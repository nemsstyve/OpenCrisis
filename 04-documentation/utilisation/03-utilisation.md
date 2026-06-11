# Guide d'utilisation

## Connexion

Ouvrir **http://localhost** (ou l'URL de votre instance).

1. Saisir l'email et le mot de passe.
2. Si c'est votre première connexion (ou si un administrateur a réinitialisé votre mot de passe), vous serez redirigé vers la page de changement de mot de passe obligatoire.

**Politique de mot de passe :** 8 caractères minimum, 1 majuscule, 1 chiffre, 1 caractère spécial.

---

## Sélecteur d'incident

Après connexion, vous arrivez sur le **sélecteur d'incident**. OpenCrisis fonctionne comme Slack : chaque incident est un espace de travail indépendant.

- **Cliquer sur un incident** pour entrer dans son espace de travail.
- Un incident peut être `ACTIF`, `CONTENU` ou `CLOS`.
- Plusieurs incidents peuvent coexister simultanément.
- Pour revenir au sélecteur depuis n'importe quelle page, cliquer sur le logo dans la barre latérale.

---

## Pages disponibles

### Tableau de bord

Vue d'ensemble de l'incident en cours :
- Statut, sévérité, date de début
- Nombre d'entrées en main courante, événements timeline, documents
- Frise des derniers événements
- Liste des contributeurs actifs

### Main courante — Direction

Journal de bord de la **cellule directionnelle**. Chaque entrée peut être :
- Associée à un ou plusieurs **tags** (libres, colorés)
- Modifiée par son auteur ou par un utilisateur avec droit `WRITE` sur la cellule
- Supprimée (soft delete)

Les nouvelles entrées apparaissent **en temps réel** pour tous les utilisateurs connectés à cet incident.

### Main courante — Opérations

Journal de bord de la **cellule opérationnelle**. Même fonctionnement que la main courante direction.

> Les cellules Direction et Opérations ont chacune leur espace propre. Les entrées marquées `SHARED` sont visibles dans les deux vues.

### Timeline

Frise chronologique des événements de la crise :
- Types d'événements : Détection, Action, Décision, Communication, Escalade, Résolution
- Champs disponibles : titre, description, date/heure d'occurrence, IP, asset, utilisateur affecté
- Mise à jour en temps réel

**Export :** bouton "Exporter Excel" pour télécharger la timeline complète au format `.xlsx`.

### Bibliothèque

Gestion des documents en deux onglets :
- **Bibliothèque globale** : documents accessibles depuis tous les incidents (fiches réflexe, procédures)
- **Documents de l'incident** : artefacts, rapports, documents spécifiques à la crise en cours

**Upload :** glisser-déposer ou bouton de sélection de fichier. Taille maximale et formats acceptés définis par la configuration Nginx.

**Catégories :** ARTEFACT, FICHE_RÉFLEXE, RAPPORT, PROCÉDURE, AUTRE.

**Download :** clic sur le nom du fichier.

### Annuaire

Contacts de l'organisation disponibles pour toute la crise :
- Créer, modifier, supprimer un contact
- Champs : prénom, nom, rôle, organisation, téléphone, email, site, notes

### Administration

Accessible uniquement aux utilisateurs avec le droit `ADMIN`.

**Onglet Utilisateurs :**
- Créer un utilisateur (email, nom, mot de passe temporaire)
- Activer/désactiver un compte
- Réinitialiser le mot de passe (force la création d'un nouveau mot de passe à la prochaine connexion)
- Assigner/retirer des rôles

**Onglet Rôles & Permissions :**
- Créer des rôles personnalisés
- Assigner des permissions (READ/WRITE par ressource)
- Les rôles système ne peuvent pas être supprimés

**Onglet Journal d'audit :**
- Toutes les mutations enregistrées automatiquement
- Filtrable par utilisateur, action, ressource, incident
- Paginé

---

## Rôles système

| Rôle | Ressources accessibles |
|---|---|
| `Administrateur` | Tout, y compris ADMIN |
| `Pilote de crise` | Tout sauf ADMIN |
| `Cellule Directionnelle` | DASHBOARD, MAIN_COURANTE_DIR, TIMELINE, ANNUAIRE, DOCUMENTS |
| `Cellule Opérationnelle` | DASHBOARD, MAIN_COURANTE_OPS, TIMELINE, ANNUAIRE, DOCUMENTS |
| `Observateur` | DASHBOARD, TIMELINE, BIBLIOTHEQUE, DOCUMENTS (lecture seule) |

Un utilisateur peut avoir plusieurs rôles. Ses permissions effectives sont l'union de tous ses rôles.

---

## Exports

### Export PDF — Main courante

Depuis la page Main courante (Direction ou Opérations), bouton **"Exporter PDF"** :
- Génère un fichier PDF avec toutes les entrées visibles par l'utilisateur
- Le contenu est filtré selon les cellules auxquelles l'utilisateur a accès en lecture

### Export Excel — Timeline

Depuis la page Timeline, bouton **"Exporter Excel"** :
- Génère un fichier `.xlsx` avec tous les événements de la timeline
- Inclut tous les champs : date, type, titre, description, IP, asset, acteur

---

## Déconnexion

Bouton **Déconnexion** en bas de la barre latérale. Le refresh token est immédiatement révoqué côté serveur.
