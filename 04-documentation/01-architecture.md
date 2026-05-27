# Architecture — OpenCrisis

## Objectif de l'application

OpenCrisis est une application web de gestion de crise (principalement cyber) conçue pour **une seule organisation**. Elle réunit deux cellules de crise sur une interface unique :

- **Cellule Directionnelle** : direction générale, RSSI, communication, juridique — vision stratégique et décisionnelle
- **Cellule Opérationnelle** : équipe technique, experts sécurité — actions terrain, investigation, containment

L'objectif est de centraliser les ressources, fluidifier la communication inter-cellules et garantir une **traçabilité complète** de chaque incident pour le rapport post-crise et les obligations légales.

---

## Concept central : le workspace d'incident

Le modèle de navigation s'inspire des **workspaces Slack** :

1. L'utilisateur se connecte → arrive sur l'**écran de sélection d'incident** (`/incidents`)
2. Il choisit une crise (active, contenue, ou historique)
3. Toutes les routes de l'application deviennent `/incidents/:id/*`
4. Il peut basculer d'un incident à un autre sans se déconnecter

Ce modèle permet de **gérer plusieurs crises simultanément** (ex : incident cyber en cours + simulation planifiée) et de conserver un historique complet de chaque crise passée.

---

## Schéma d'architecture

```
                         ┌─────────────────────────────────────────┐
                         │              Utilisateur                 │
                         │         (navigateur web)                 │
                         └────────────────┬────────────────────────┘
                                          │ HTTP / WebSocket
                                          ▼
                         ┌─────────────────────────────────────────┐
                         │              nginx :80                   │
                         │          Reverse Proxy                   │
                         │                                          │
                         │  /api/graphql ──────────────────────►   │
                         │  /api/*       ──────────────────────►   │
                         │  /*           ──────────────────────►   │
                         └────┬─────────────────────────┬──────────┘
                              │                         │
                 ┌────────────▼──────────┐   ┌─────────▼──────────┐
                 │    backend :4000      │   │   frontend :80     │
                 │  Node.js + Express    │   │  nginx + SPA Vite  │
                 │  Apollo Server        │   │  React + TypeScript│
                 │  GraphQL + WebSocket  │   └────────────────────┘
                 └────────┬─────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
 ┌────────────▼───────────┐  ┌────────▼───────────┐
 │    postgres :5432      │  │    redis :6379     │
 │    PostgreSQL 16       │  │    Redis 7         │
 │    Base de données     │  │    Pub/Sub         │
 │    principale          │  │    (subscriptions) │
 └────────────────────────┘  └────────────────────┘
```

---

## Choix techniques et justifications

### Frontend — React + Vite + TypeScript + Tailwind v4 + shadcn/ui

| Technologie | Justification |
|---|---|
| **React 18** | Écosystème mature, composants réutilisables, gestion d'état flexible |
| **Vite** | Build ultra-rapide, HMR natif, support TypeScript sans configuration |
| **TypeScript** | Typage statique — critique pour un projet avec une API GraphQL complexe |
| **Tailwind v4** | CSS utilitaire — itération rapide, cohérence visuelle, pas de CSS custom à maintenir |
| **shadcn/ui** | Composants accessibles (Radix UI) avec style Tailwind — 52 composants prêts à l'emploi |
| **Zustand** | État global minimal (incident courant, user, permissions) — plus simple que Redux |
| **Apollo Client** | Client GraphQL officiel avec cache normalisé et support des subscriptions WebSocket |

### Backend — Node.js + Express + Apollo Server

| Technologie | Justification |
|---|---|
| **Node.js 20** | Runtime JavaScript côté serveur — cohérence de langage avec le frontend |
| **Express** | Framework HTTP minimal et flexible, très large écosystème |
| **Apollo Server 4** | Serveur GraphQL de référence, intégration native avec Express |
| **GraphQL** | API typée, introspectable, permet au frontend de demander exactement ce dont il a besoin |
| **graphql-ws** | Protocole WebSocket standard pour les subscriptions GraphQL |
| **Prisma** | ORM type-safe — types TypeScript auto-générés depuis le schéma de données |
| **Zod** | Validation d'inputs à la frontière système (données utilisateur, API externe) |

### Infrastructure

| Technologie | Justification |
|---|---|
| **PostgreSQL 16** | Base relationnelle robuste, excellente gestion des JSON, support de Prisma |
| **Redis 7** | Pub/Sub pour les subscriptions GraphQL temps réel — nécessaire avec un serveur Node.js |
| **Nginx** | Reverse proxy — évite les problèmes CORS, support WebSocket, point d'entrée unique |
| **Docker Compose** | Isolation des services, reproductibilité de l'environnement, déploiement simplifié |

### Pourquoi GraphQL plutôt que REST ?

- **Requêtes précises** : le frontend demande exactement les champs dont il a besoin — pas de sur-fetching
- **Type system partagé** : le schéma GraphQL est la source de vérité pour les types frontend et backend (via GraphQL Code Generator)
- **Subscriptions natives** : le protocole GraphQL over WebSocket gère naturellement les mises à jour temps réel
- **Introspection** : les outils de développement (GraphQL Playground, Apollo DevTools) permettent d'explorer l'API

### Pourquoi Prisma plutôt que SQL brut ?

- **Type safety** : les types TypeScript sont générés automatiquement depuis le schéma — toute divergence est une erreur de compilation
- **Migrations versionnées** : `prisma migrate dev` génère et applique les migrations, qui sont commitées dans Git
- **API objet** : `prisma.incident.findMany({ where: { status: 'ACTIVE' }, include: { logEntries: true } })` est plus lisible et moins error-prone que du SQL inline
- **Soft delete facile** : filtrage automatique des enregistrements supprimés via `deletedAt`

---

## Modules de l'application

| Module | Route | Cellule(s) | Description |
|---|---|---|---|
| **Sélecteur d'incident** | `/incidents` | Toutes | Choix du workspace de crise |
| **Dashboard** | `/incidents/:id` | Toutes | Vue synthétique de l'état de la crise |
| **Main courante directionnelle** | `/incidents/:id/main-courante-direction` | Directionnelle | Journal des décisions stratégiques |
| **Main courante opérationnelle** | `/incidents/:id/main-courante-operationnelle` | Opérationnelle | Journal des actions techniques |
| **Timeline** | `/incidents/:id/timeline` | Toutes | Chronologie des événements de l'incident |
| **Documents** | `/incidents/:id/documents` | Toutes | Artefacts, rapports, preuves liés à l'incident |
| **Bibliothèque** | `/bibliotheque` | Toutes | Fiches réflexes et procédures globales |
| **Annuaire** | `/annuaire` | Toutes | Contacts de crise (global + incident) |
| **Cartographie** | `/incidents/:id/cartographie` | Opérationnelle | Infrastructure SI et assets impactés |
| **Administration** | `/admin` | Administrateur | Gestion des utilisateurs, rôles, permissions |

---

## Sécurité

### Authentification

- **JWT (JSON Web Token)** : access token de courte durée (15 minutes) envoyé dans le header `Authorization`
- **Refresh token** : token de longue durée (7 jours) stocké dans un cookie HttpOnly — inaccessible au JavaScript
- Ce mécanisme évite de déconnecter les utilisateurs en pleine crise tout en limitant la fenêtre d'exposition d'un token volé

### Contrôle d'accès (RBAC)

- Chaque onglet de l'application correspond à une **permission** (`PermissionResource × PermissionAction`)
- Les **rôles** regroupent des permissions et sont assignés aux utilisateurs
- Le contrôle est appliqué **deux fois** : côté backend (middleware resolver) et côté frontend (onglets masqués)
- Un attaquant qui contourne le frontend ne peut pas accéder aux données — la vérification backend est la source de vérité

### Audit log

- Toutes les mutations GraphQL sont automatiquement tracées dans la table `AuditLog`
- Données enregistrées : utilisateur, action, ressource, ancien/nouveau état, adresse IP, timestamp
- Les logs d'audit ne sont jamais supprimés — essentiels pour le rapport post-incident et les obligations légales
