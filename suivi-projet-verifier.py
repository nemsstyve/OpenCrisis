#!/usr/bin/env python3
"""Vérifie suivi-projet.json avant un commit, avec les règles de la plateforme Suivi-Projet.

Usage : python suivi-projet-verifier.py   (ou python3)
Le script ne modifie rien et ne contacte aucun service. Fichier tenu à jour par la plateforme.
"""
import datetime
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
REPORT = os.path.join(ROOT, "suivi-projet.json")
CATALOGUE = os.path.join(ROOT, "suivi-projet-cartes.json")
MAX_FILE = 65536
MAX_EVIDENCE = 8000
ADVISED_EVIDENCE = 800
FUTURE_MARGIN = datetime.timedelta(minutes=5)
TASK_STATUS = ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE"]
LISTS = {
    "tasks": ("tâche", TASK_STATUS, 500),
    "milestones": ("jalon", ["TODO", "IN_PROGRESS", "DONE"], 100),
    "deliverables": ("livrable", ["PENDING", "IN_REVIEW"], 100),
    "indicators": ("indicateur", None, 100),
}
DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$")
REPOSITORY = re.compile(r"^[A-Za-z0-9._-]{1,100}/[A-Za-z0-9._-]{1,100}$")
CARD_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
KEY = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
HIDDEN = re.compile("[\u0000-\u001f\u007f‪-‮⁦-⁩]")
HIDDEN_MULTILINE = re.compile("[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]")

errors = []
warnings = []


def length(text):
    """Longueur comptée comme la plateforme (unités UTF-16)."""
    return len(text.encode("utf-16-le")) // 2


def describe(kind, item):
    label = LISTS[kind][0] if kind in LISTS else "ajout"
    if isinstance(item, dict):
        if isinstance(item.get("key"), str):
            return "%s « %s »" % (label, item["key"])
        if isinstance(item.get("id"), str):
            return "%s d'identifiant %s" % (label, item["id"])
        if isinstance(item.get("title"), str):
            return "%s « %s »" % (label, item["title"][:80])
    return label


def parse_date(value):
    if not isinstance(value, str):
        return None
    match = DATE.match(value)
    if not match:
        return None
    year, month, day, hour, minute, second = (int(match.group(i)) for i in range(1, 7))
    zone = match.group(8)
    try:
        moment = datetime.datetime(year, month, day, hour, minute, second)
    except ValueError:
        return None
    offset = datetime.timedelta(0)
    if zone != "Z":
        sign = 1 if zone[0] == "+" else -1
        offset = sign * datetime.timedelta(hours=int(zone[1:3]), minutes=int(zone[4:6]))
    return (moment - offset).replace(tzinfo=datetime.timezone.utc)


def check_common(kind, item, where):
    moment = parse_date(item.get("updatedAt"))
    if moment is None:
        errors.append("%s : updatedAt doit être une date ISO 8601 complète avec fuseau, par exemple 2026-11-12T00:21:53+01:00." % where)
    elif moment > datetime.datetime.now(datetime.timezone.utc) + FUTURE_MARGIN:
        errors.append("%s : updatedAt (%s) est dans le futur. Lisez l'heure sur l'horloge (date -Iseconds)." % (where, item["updatedAt"]))
    evidence = item.get("evidence")
    if not isinstance(evidence, str) or length(evidence.strip()) < 3:
        errors.append("%s : evidence doit décrire la preuve consultée (3 caractères minimum)." % where)
    elif length(evidence.strip()) > MAX_EVIDENCE:
        errors.append("%s : evidence dépasse %d caractères ; résumez-la et renvoyez au rapport détaillé." % (where, MAX_EVIDENCE))
    elif length(evidence.strip()) > ADVISED_EVIDENCE:
        warnings.append("%s : evidence dépasse %d caractères, longueur conseillée." % (where, ADVISED_EVIDENCE))


def load(path, name):
    try:
        with open(path, "rb") as handle:
            raw = handle.read()
    except OSError:
        return None, None
    try:
        return raw, json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as error:
        errors.append("%s n'est pas un JSON UTF-8 valide : %s" % (name, error))
        return raw, None


def catalogue_cards(catalogue, kind):
    cards = catalogue.get(kind) if isinstance(catalogue, dict) else None
    return [card for card in cards if isinstance(card, dict)] if isinstance(cards, list) else []


def main():
    raw, report = load(REPORT, "suivi-projet.json")
    if raw is None:
        errors.append("suivi-projet.json est introuvable à la racine du dépôt.")
        return
    if len(raw) > MAX_FILE:
        errors.append("suivi-projet.json pèse %d octets ; la limite est de 64 Kio (%d octets)." % (len(raw), MAX_FILE))
    if not isinstance(report, dict):
        if report is not None:
            errors.append("suivi-projet.json doit contenir un objet JSON.")
        return
    _, catalogue = load(CATALOGUE, "suivi-projet-cartes.json")
    if catalogue is None:
        warnings.append("suivi-projet-cartes.json est absent : les identifiants et titres des cartes ne sont pas vérifiés.")

    allowed = {"version", "repository", "tasks", "milestones", "deliverables", "indicators", "additions"}
    for key in sorted(set(report) - allowed):
        errors.append("Champ inconnu à la racine du bilan : %s." % key)
    if report.get("version") != 1:
        errors.append("version doit valoir 1.")
    repository = report.get("repository")
    if not isinstance(repository, str) or not REPOSITORY.match(repository):
        errors.append("repository doit avoir la forme propriétaire/dépôt.")
    elif isinstance(catalogue, dict) and isinstance(catalogue.get("repository"), str) and catalogue["repository"].lower() != repository.lower():
        errors.append("repository (%s) ne correspond pas au catalogue (%s). Après un renommage du dépôt, mettez le nom actuel." % (repository, catalogue["repository"]))
    if not isinstance(report.get("tasks"), list):
        errors.append("tasks doit être une liste, même vide.")

    for kind, (label, statuses, limit) in LISTS.items():
        entries = report.get(kind, [])
        if not isinstance(entries, list):
            errors.append("%s doit être une liste." % kind)
            continue
        if len(entries) > limit:
            errors.append("%s contient %d entrées ; la limite est %d." % (kind, len(entries), limit))
        cards = catalogue_cards(catalogue, kind)
        seen = set()
        matched = {}
        for position, item in enumerate(entries, 1):
            where = "%s n° %d (%s)" % (kind, position, describe(kind, item))
            if not isinstance(item, dict):
                errors.append("%s : chaque entrée doit être un objet." % where)
                continue
            extra = set(item) - ({"id", "title", "updatedAt", "evidence", "current"} if kind == "indicators" else {"id", "title", "updatedAt", "evidence", "status"})
            for key in sorted(extra):
                errors.append("%s : champ inconnu %s." % (where, key))
            card_id, title = item.get("id"), item.get("title")
            if card_id is not None and (not isinstance(card_id, str) or not CARD_ID.match(card_id)):
                errors.append("%s : id invalide." % where)
                card_id = None
            if title is not None and (not isinstance(title, str) or not 1 <= length(title.strip()) <= 200):
                errors.append("%s : title doit faire de 1 à 200 caractères." % where)
                title = None
            if not card_id and not title:
                errors.append("%s : indiquez l'identifiant de la carte (id) ou son titre exact (title)." % where)
            if kind == "indicators":
                current = item.get("current")
                if isinstance(current, bool) or not isinstance(current, (int, float)) or current != current or abs(current) > 1e12:
                    errors.append("%s : current doit être un nombre fini." % where)
            elif item.get("status") not in statuses:
                errors.append("%s : status doit être l'une des valeurs %s." % (where, ", ".join(statuses)))
            check_common(kind, item, where)
            reference = ("id:" + card_id) if card_id else ("title:" + title) if title else None
            if reference:
                if reference in seen:
                    errors.append("%s : cette carte apparaît deux fois dans %s ; gardez une seule entrée." % (where, kind))
                seen.add(reference)
            if catalogue is None or not reference:
                continue
            found = [card for card in cards if (card.get("id") == card_id if card_id else card.get("title") == title)]
            if len(found) != 1:
                errors.append("%s : %s dans suivi-projet-cartes.json. Reprenez l'identifiant exact de la carte." % (where, "introuvable" if not found else "titre ambigu"))
                continue
            target = found[0].get("id") or found[0].get("title")
            if target in matched:
                errors.append("%s : désigne la même carte que l'entrée n° %d." % (where, matched[target]))
            matched[target] = position

    additions = report.get("additions", [])
    if not isinstance(additions, list):
        errors.append("additions doit être une liste.")
        additions = []
    if len(additions) > 100:
        errors.append("additions contient %d entrées ; la limite est 100." % len(additions))
    keys, titles = set(), set()
    for position, item in enumerate(additions, 1):
        where = "additions n° %d (%s)" % (position, describe("additions", item))
        if not isinstance(item, dict):
            errors.append("%s : chaque entrée doit être un objet." % where)
            continue
        for key in sorted(set(item) - {"key", "title", "description", "status", "updatedAt", "evidence"}):
            errors.append("%s : champ inconnu %s." % (where, key))
        key, title, description = item.get("key"), item.get("title"), item.get("description")
        if not isinstance(key, str) or not KEY.match(key):
            errors.append("%s : key doit être en minuscules, chiffres et tirets (64 caractères maximum)." % where)
        if not isinstance(title, str) or not 3 <= length(title.strip()) <= 120 or HIDDEN.search(title):
            errors.append("%s : title doit faire de 3 à 120 caractères, sur une ligne." % where)
        if description is not None and (not isinstance(description, str) or length(description.strip()) > 600 or HIDDEN_MULTILINE.search(description)):
            errors.append("%s : description fait au plus 600 caractères, sans caractère de contrôle." % where)
        if item.get("status") not in TASK_STATUS:
            errors.append("%s : status doit être l'une des valeurs %s." % (where, ", ".join(TASK_STATUS)))
        check_common("additions", item, where)
        if key in keys or (isinstance(title, str) and title in titles):
            errors.append("%s : même clé ou même titre qu'un autre ajout." % where)
        keys.add(key)
        if isinstance(title, str):
            titles.add(title)


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    main()
    for message in warnings:
        print("Attention : " + message)
    for message in errors:
        print("Erreur : " + message)
    if errors:
        print("Bilan refusé : corrigez %s avant le commit." % ("ce point" if len(errors) == 1 else "ces %d points" % len(errors)))
        sys.exit(1)
    print("Bilan conforme : la plateforme pourra l'appliquer.")
