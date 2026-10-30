# OpenCrisis

Application web de gestion de crise cyber pour une seule organisation. Elle réunit la cellule directionnelle et la cellule opérationnelle sur une interface unique avec collaboration en temps réel.

![React](https://img.shields.io/badge/React-18-blue)
![Node.js](https://img.shields.io/badge/Node.js-20-green)
![GraphQL](https://img.shields.io/badge/GraphQL-16-pink)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)
![Docker](https://img.shields.io/badge/Docker-Compose-blue)

---

## Démarrage rapide

**Prérequis :** Docker Desktop ≥ 25, Git

```bash
git clone <url-du-repo> opencrisis
cd opencrisis
cp .env.example .env          # puis renseigner les secrets (voir Configuration)
docker compose up --build
```

L'application est disponible sur **http://localhost** après quelques secondes.

**Compte administrateur par défaut :** créé par le seed au premier démarrage.

```bash
# Initialiser la base de données (premier démarrage uniquement)
docker exec opencrisis-backend-1 npx prisma db seed
```

---

## Fonctionnalités principales

- **Sélecteur d'incident** — modèle workspace Slack : une interface, plusieurs crises simultanées
- **Main courante** — journal de bord collaboratif en temps réel, séparé par cellule (Direction / Opérations / Partagé)
- **Timeline** — frise chronologique des événements de la crise
- **Bibliothèque de documents** — gestion de fichiers par incident et bibliothèque globale
- **Annuaire** — contacts de crise de l'organisation
- **Tableau de bord** — statistiques, indicateurs de la crise en cours
- **Administration** — gestion des utilisateurs, rôles, permissions et journal d'audit
- **Temps réel** — toutes les vues se mettent à jour instantanément via WebSocket
- **Exports** — export PDF de la main courante, export Excel de la timeline

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | React 18 · Vite · TypeScript · Tailwind v4 · shadcn/ui |
| Backend | Node.js 20 · Express · Apollo Server 4 (GraphQL) |
| ORM | Prisma 5 |
| Base de données | PostgreSQL 16 |
| Temps réel | GraphQL Subscriptions (graphql-ws + Redis pub/sub) |
| Auth | JWT access token + refresh token (cookie HttpOnly) |
| Infra | Docker Compose · Nginx |

---

## Documentation

La documentation complète est dans [`04-documentation/`](04-documentation/).

| Section | Contenu |
|---|---|
| [Installation](04-documentation/utilisation/01-installation.md) | Prérequis, démarrage, mode développement |
| [Configuration](04-documentation/utilisation/02-configuration.md) | Variables d'environnement, JWT, OpenCTI |
| [Utilisation](04-documentation/utilisation/03-utilisation.md) | Guide utilisateur, rôles, pages |
| [Architecture](04-documentation/fonctionnement/04-architecture.md) | Vue d'ensemble, flux d'auth, temps réel |
| [Technologies](04-documentation/fonctionnement/05-technologies.md) | Stack complète avec versions |
| [Frontend](04-documentation/fonctionnement/06-frontend.md) | Structure React, Apollo, Zustand |
| [Backend](04-documentation/fonctionnement/07-backend.md) | Structure Express, GraphQL, middlewares |
| [Base de données](04-documentation/fonctionnement/08-base-de-donnees.md) | Schéma Prisma, modèles, enums |
| [Docker](04-documentation/fonctionnement/09-docker.md) | Services, volumes, réseau, mode dev |
| [Autre](04-documentation/fonctionnement/10-autre.md) | OpenCTI, sécurité, codegen, conventions |

---

## Structure du projet

```
opencrisis/
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── 01-frontend/          # Application React + Vite
├── 02-backend/           # API Node.js + GraphQL + Prisma
├── 03-nginx/             # Configuration Nginx
└── 04-documentation/     # Documentation complète
```

## Auteurs
Pierre Moutiers, Vigine Zhang, Styve Nematcha, Ambre Traina, Sas0ri

## Licence
Apache 2.0 — voir le fichier LICENSE
