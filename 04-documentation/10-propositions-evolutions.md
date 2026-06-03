# Propositions d'évolution — OpenCrisis

> Date : 2026-05-31 · Idées d'amélioration **prospectives** (nouvelles valeurs), distinctes des correctifs d'audit.
> Référentiels de correction : [07](07-audit-securite.md) (sécurité), [08](08-audit-interface.md) (interface), [09](09-plan-actions-consolide.md) (plan consolidé).
>
> **Cadrage produit** : outil de gestion de crise **cyber**, mono-organisation, réunissant cellule **directionnelle** (stratégie) et cellule **opérationnelle** (technique). Pivot = l'incident (workspace). Contraintes métier fortes : **rapidité sous stress**, **traçabilité à valeur probante**, **fonctionnement 24/7**, **conformité réglementaire**, et le fait que **la crise peut toucher l'infra de l'organisation elle-même**.
>
> Chaque idée : *besoin → proposition → effort (S/M/L/XL) → liens*. Les **★** marquent les recommandations prioritaires.

---

## 1. Nouvelles fonctionnalités

### 1.1 ★ Suivi des actions / tâches (qui-fait-quoi)
**Besoin** — Aujourd'hui la main courante est du texte libre : aucune façon de suivre **les décisions transformées en actions**, leur responsable, leur échéance, leur statut. C'est le manque n°1 d'un outil de crise.
**Proposition** — Entité `Action` (titre, responsable, cellule, priorité, échéance, statut Ouverte/En cours/Faite/Bloquée), créable depuis une entrée de main courante (« convertir en action »). Vue Kanban + liste filtrable, compteur d'actions ouvertes sur le Dashboard, rappel des échéances dépassées.
**Effort** — L · **Liens** — réutilise le modèle RBAC/temps réel existant.

### 1.2 ★ Échéances réglementaires & minuteurs de conformité
**Besoin** — En crise cyber, des **délais légaux** courent dès la qualification : notification CNIL **72 h** (RGPD), information des personnes concernées, obligations sectorielles (NIS2, DORA, contrats clients). Les rater a des conséquences juridiques.
**Proposition** — Module « Conformité » : modèles d'obligations (CNIL 72 h, notification clients, dépôt de plainte…), **comptes à rebours visuels** déclenchés à la qualification de l'incident, statut (à faire / en cours / fait / N/A), pièces justificatives rattachées. Bandeau d'alerte si une échéance approche.
**Effort** — L · **Liens** — 1.4 (communication), bibliothèque (modèles).

### 1.3 ★ Module de communication de crise
**Besoin** — La cellule direction doit **tracer et coordonner les communications** (interne, clients, presse, régulateur, autorités). Rien n'existe aujourd'hui.
**Proposition** — Registre des communications : destinataire/canal, statut (brouillon/validé/envoyé), validateur, horodatage, modèle. Workflow de validation direction. Lien vers les échéances (1.2).
**Effort** — M/L.

### 1.4 ★ Registre de décisions structuré
**Besoin** — Les décisions stratégiques noyées dans la main courante sont difficiles à retrouver pour le RETEX et la défense juridique.
**Proposition** — Entité `Décision` (intitulé, options envisagées, option retenue, justification, décideur, horodatage). Vue dédiée + inclusion automatique dans le rapport post-incident. Distincte du log narratif.
**Effort** — M.

### 1.5 ★ Rapport post-incident / RETEX automatisé
**Besoin** — Après la crise, produire un **retour d'expérience** est laborieux et manuel.
**Proposition** — Génération d'un rapport structuré (synthèse, chronologie, décisions, actions, métriques MTTD/MTTC/MTTR, contributeurs, pièces) en PDF/DOCX, à partir des données déjà saisies.
**Effort** — M · **Liens** — exports PDF/Excel existants, 1.1, 1.4, 1.8.

### 1.6 Registre d'IOC (indicateurs de compromission)
**Besoin** — Cœur de l'IR cyber : centraliser IP, hash, domaines, comptes compromis, et leur statut (à bloquer / bloqué / surveillé).
**Proposition** — Entité `IOC` (type, valeur, statut, source, lien timeline). Import/export CSV/STIX, enrichissement via OpenCTI (déjà intégré en option).
**Effort** — M · **Liens** — OpenCTI, timeline.

### 1.7 ★ Relève d'équipe (passation de quart)
**Besoin** — Une crise dure 24/7 ; les équipes tournent. La perte d'information à la passation est un risque majeur.
**Proposition** — Fonction « Relève » : synthèse semi-automatique (actions ouvertes, décisions récentes, points d'attention, dernières entrées) générée pour le quart suivant, archivée et signée.
**Effort** — M.

### 1.8 Métriques & KPIs de crise
**Besoin** — Piloter avec des indicateurs (Dashboard actuel = simples compteurs).
**Proposition** — MTTD/MTTC/MTTR, nombre d'actions ouvertes/fermées, durée par statut, charge par cellule, courbe d'activité. Cartes KPI + mini-graphes.
**Effort** — M · **Liens** — `chart.tsx` (shadcn) déjà présent, 1.1.

### 1.9 Modèles de crise & fiches réflexes interactives
**Besoin** — La bibliothèque stocke des fiches réflexes **statiques**. En situation, on veut des **checklists actionnables**.
**Proposition** — Modèles par scénario (ransomware, DDoS, fuite de données, compromission AD…) : checklist d'étapes cochables qui **pré-remplissent** actions (1.1) et timeline à l'ouverture d'un incident.
**Effort** — L.

### 1.10 Cartographie (CARTOGRAPHIE) — concrétiser la permission existante
**Besoin** — La ressource `CARTOGRAPHIE` existe en RBAC/seed mais **aucune page ne l'implémente** (constat de la revue). Manque pour la cellule opérationnelle.
**Proposition** — Vue cartographie d'incident : assets touchés, segments réseau, propagation, statut de remédiation (graphe ou plan). MVP simple (liste d'assets + statut) puis visualisation.
**Effort** — L/XL.

### 1.11 Recherche globale
**Besoin** — Pas de recherche transverse (entrées, timeline, documents, contacts).
**Proposition** — Recherche unifiée (avec la command palette 2.1), résultats typés et cliquables.
**Effort** — M.

---

## 2. Optimisations UX (rapidité & conscience de situation)

### 2.1 ★ Palette de commandes (Cmd/Ctrl-K) & saisie rapide globale
**Besoin** — Sous stress, naviguer à la souris est lent. Saisir une entrée de main courante doit être possible **depuis n'importe où**.
**Proposition** — Palette `Cmd-K` : navigation, « + entrée main courante », « + action », « + événement timeline », recherche (1.11). Raccourci global de saisie rapide. `command.tsx` shadcn déjà présent.
**Effort** — M.

### 2.2 ★ Notifications temps réel & présence
**Besoin** — Le temps réel existe (subscriptions) mais **rien n'avertit** qu'un collègue a ajouté une entrée/événement ; on ne sait pas **qui est connecté**.
**Proposition** — Toasts/badges « nouvelle entrée de X », indicateur de présence (qui est en ligne / sur quelle page), « X est en train d'écrire ». Notifications navigateur (et son) pour les événements **CRITICAL**.
**Effort** — M · **Liens** — toasts (UI IV1), subscriptions existantes.

### 2.3 ★ Brouillons auto-sauvegardés
**Besoin** — Une saisie en cours est **perdue** si la session expire (lié à U21) ou en cas de rafraîchissement.
**Proposition** — Sauvegarde locale (debounced) des entrées/événements en cours de rédaction, restaurée au retour. Filet de sécurité indispensable en crise.
**Effort** — S/M · **Liens** — U21 (refresh token).

### 2.4 « Quoi de neuf depuis ma dernière visite »
**Besoin** — En reprenant l'écran, repérer vite ce qui a changé.
**Proposition** — Marqueurs « non lu », ancre « depuis votre dernière visite », bouton « tout marquer comme lu ». **Liens** — 1.7 (relève).
**Effort** — M.

### 2.5 Timeline interactive enrichie
**Besoin** — La frise est **espacée uniformément** (non proportionnelle au temps, cf. U25) et la timeline opérationnelle est un simple tableau.
**Proposition** — Axe temporel proportionnel, zoom, filtres par type/cellule, **couloirs (swimlanes)** Direction/Opérationnel, liens visuels entre événement timeline et entrées de main courante.
**Effort** — L.

### 2.6 Densité d'affichage & confort
**Proposition** — Mode compact (power users), tailles de police ajustables (environnement stressant / grand écran), préférences persistées.
**Effort** — S.

---

## 3. Changements UI / design

### 3.1 ★ Mode « War Room » (affichage mural)
**Besoin** — Les cellules de crise projettent souvent un écran mural. L'UI actuelle n'est pas pensée pour ça.
**Proposition** — Vue plein écran auto-rafraîchie : KPIs, dernières entrées, échéances réglementaires, actions critiques, statut/sévérité en gros. Rotation automatique des panneaux. Polices larges, fort contraste.
**Effort** — M · **Liens** — 1.8, 1.2, finition thème.

### 3.2 ★ Langage visuel piloté par la sévérité
**Besoin** — La sévérité (LOW→CRITICAL) est peu visible une fois dans l'incident.
**Proposition** — Bandeau d'incident **persistant** coloré par sévérité/statut, code couleur cohérent partout, badge d'incident distinctif pour éviter la confusion quand **plusieurs crises** sont ouvertes.
**Effort** — S/M.

### 3.3 Thème clair finalisé + mode haut-contraste
**Besoin** — Le mode clair est cassé (U1) ; un mode haut-contraste sert en salle/écran mural.
**Proposition** — Achever le thème via tokens sémantiques (décision DÉC-UI-1), ajouter un thème haut-contraste. **Liens** — UI II2.
**Effort** — L.

### 3.4 Cohérence du design system & accessibilité
**Proposition** — Généraliser les composants shadcn (Dialog, AlertDialog, Toaster, Form, Skeleton **présents mais inutilisés**), tokens d'espacement/typo, passe a11y (clavier, ARIA, contrastes). **Liens** — UI V1-V4.
**Effort** — M (transverse).

### 3.5 Responsive / usage mobile-tablette
**Besoin** — Des intervenants sont en mobilité ; certaines grilles débordent (U11).
**Proposition** — Refonte responsive ciblée + vue mobile « saisie rapide / consultation » pour la main courante et les actions.
**Effort** — M.

---

## 4. Autres (technique, intégrations, sécurité-produit)

### 4.1 ★ MFA / 2FA à la connexion
**Besoin** — C'est un **outil de sécurité** ; l'auth par mot de passe seul est faible, surtout s'il sert pendant une compromission.
**Proposition** — TOTP (authenticator) en option/obligatoire, codes de secours. **Liens** — plan sécurité (auth).
**Effort** — M.

### 4.2 ★ SSO entreprise (OIDC / SAML)
**Besoin** — Adoption en organisation = intégration à l'IdP (Azure AD, Okta…).
**Proposition** — Connexion OIDC/SAML, provisioning des rôles depuis l'IdP. **Mais** : prévoir un **accès de secours local** car en crise l'IdP peut être indisponible/compromis.
**Effort** — L.

### 4.3 ★ Mode dégradé / PWA hors-ligne
**Besoin** — Spécificité cyber : **l'infra de l'organisation (réseau, SSO, DNS) peut être HS**. L'outil de crise doit rester utilisable.
**Proposition** — PWA installable, capture hors-ligne de la main courante avec synchronisation différée, indicateur de connectivité. Réflexion sur un déploiement résilient (hors du SI compromis).
**Effort** — L/XL.

### 4.4 ★ Intégrations entrantes (SIEM / ticketing / alerting)
**Besoin** — Alimenter la timeline automatiquement plutôt qu'à la main.
**Proposition** — Webhooks/API d'ingestion (SIEM, EDR → événements timeline/IOC), connecteurs sortants (Slack/Teams/e-mail/SMS pour notifications & escalade), lien ticketing (Jira/ServiceNow).
**Effort** — L · **Liens** — 1.6 (IOC), 2.2 (notifications).

### 4.5 ★ Main courante à valeur probante (inviolabilité)
**Besoin** — La main courante peut servir de **preuve** (juridique, assurance, régulateur). Aujourd'hui rien ne garantit la non-altération a posteriori.
**Proposition** — Journal **horodaté et chaîné par hachage** (hash-chain) des entrées et de l'audit, export scellé/signé, horodatage qualifié en option. **Liens** — audit S14, export PDF.
**Effort** — M/L.

### 4.6 Escalade & annuaire actionnable
**Besoin** — L'annuaire est statique.
**Proposition** — Chaînes d'escalade, listes d'appel (call list), disponibilité/astreinte, clic-pour-appeler/notifier, groupes par rôle de crise.
**Effort** — M · **Liens** — 2.2.

### 4.7 RACI / rôles de crise par incident
**Besoin** — Savoir qui tient quel rôle (Pilote, Comms, Juridique, Technique) **pour cet incident**.
**Proposition** — Attribution de rôles de crise par incident (distincts des rôles RBAC), affichés dans l'en-tête de l'incident.
**Effort** — M.

### 4.8 Archivage & cycle de vie des incidents
**Besoin** — Le sélecteur liste tout, y compris les crises closes (cf. U20).
**Proposition** — Statut d'archivage, rétention configurable, vue « actifs / clos / archivés », verrouillage de la main courante à la clôture (cohérent avec 4.5).
**Effort** — M.

### 4.9 Internationalisation (i18n)
**Besoin** — Interface FR uniquement.
**Proposition** — Externaliser les libellés (FR par défaut, EN), utile pour organisations internationales / filiales.
**Effort** — M (transverse).

### 4.10 Exercices / mode entraînement
**Besoin** — Les cellules de crise **s'entraînent** (exercices de gestion de crise).
**Proposition** — Incidents marqués « exercice » (visuellement distincts, exclus des stats réelles), scénarios injectables (« injects » chronométrés). Forte valeur de différenciation produit.
**Effort** — L.

---

## 5. Synthèse & priorisation

### Top 10 recommandé (★) — valeur métier la plus forte
1. **Suivi des actions** (1.1) — comble le manque fonctionnel central
2. **Échéances réglementaires / 72 h CNIL** (1.2) — enjeu juridique propre au cyber
3. **Notifications temps réel & présence** (2.2) — conscience de situation
4. **Palette de commandes & saisie rapide** (2.1) — rapidité sous stress
5. **Module de communication de crise** (1.3)
6. **Mode War Room** (3.1) — usage réel en salle de crise
7. **MFA** (4.1) — cohérence « outil de sécurité »
8. **Main courante inviolable** (4.5) — valeur probante
9. **Rapport RETEX automatisé** (1.5)
10. **Mode dégradé / hors-ligne** (4.3) — spécificité cyber décisive

### Phasage suggéré
| Phase | Thème | Contenu |
|---|---|---|
| **P8 — Pilotage de crise** | Cœur métier manquant | 1.1 Actions · 1.4 Décisions · 1.8 KPIs · 2.1 Cmd-K · 2.2 Notifications/présence · 2.3 Brouillons |
| **P9 — Conformité & communication** | Enjeux direction | 1.2 Échéances · 1.3 Comms · 1.5 RETEX · 4.5 Inviolabilité · 4.7 RACI |
| **P10 — Opérationnel cyber** | Cellule technique | 1.6 IOC · 1.10 Cartographie · 4.4 Intégrations SIEM · 2.5 Timeline enrichie |
| **P11 — Résilience & entreprise** | Robustesse/adoption | 4.1 MFA · 4.2 SSO · 4.3 Hors-ligne · 4.8 Archivage · 3.1 War Room |
| **Transverse** | UX/UI continue | 3.2 Sévérité · 3.3 Thèmes · 3.4 Design system · 1.9 Modèles · 4.10 Exercices · 4.9 i18n |

### Quick wins (fort impact / faible effort)
- **2.3 Brouillons auto-sauvegardés** (S/M) — évite la perte de saisie
- **3.2 Bandeau sévérité persistant** (S/M) — clarté immédiate
- **2.6 Densité/confort** (S)
- **1.8 KPIs** sur le Dashboard (M, composant `chart` déjà présent)

> **Prérequis** : ces évolutions supposent d'avoir traité le **plan consolidé** ([09](09-plan-actions-consolide.md)) — en particulier le contrôle d'accès (P0) et le refresh de session (I1), socle de fiabilité sur lequel toute nouvelle fonctionnalité s'appuie.
