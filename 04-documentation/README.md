# Documentation OpenCrisis

Documentation technique et fonctionnelle du projet OpenCrisis.

---

## Utilisation

| Fichier | Description |
|---|---|
| [01-installation.md](utilisation/01-installation.md) | Prérequis, génération des certificats TLS, démarrage production, mode développement, commandes de maintenance |
| [02-configuration.md](utilisation/02-configuration.md) | Toutes les variables d'environnement, JWT, Redis, OpenCTI, CORS (HTTPS) |
| [03-utilisation.md](utilisation/03-utilisation.md) | Guide utilisateur : connexion, pages, rôles, exports |

## Fonctionnement

| Fichier | Description |
|---|---|
| [04-architecture.md](fonctionnement/04-architecture.md) | Architecture globale, concept workspace, flux auth, temps réel, isolation réseau, décisions clés |
| [05-technologies.md](fonctionnement/05-technologies.md) | Stack technique complète avec versions et justifications |
| [06-frontend.md](fonctionnement/06-frontend.md) | Structure React, Apollo Client, Zustand, composants clés, utilitaires |
| [07-backend.md](fonctionnement/07-backend.md) | Structure Express/GraphQL, middlewares, routes REST, patterns de mutation |
| [08-base-de-donnees.md](fonctionnement/08-base-de-donnees.md) | Schéma Prisma : 13 modèles, 7 enums, soft delete, migrations |
| [09-docker.md](fonctionnement/09-docker.md) | 5 services durcis, 2 réseaux séparés, volumes, healthchecks, mode développement |
| [10-autre.md](fonctionnement/10-autre.md) | OpenCTI, sécurité applicative, codegen GraphQL, conventions de commits |
| [11-securite-infrastructure.md](fonctionnement/11-securite-infrastructure.md) | **Durcissement infrastructure complet** : capabilities Linux, no-new-privileges, TLS/HTTPS, rate limiting, headers OWASP, isolation réseau, couverture OWASP Top 10, tests de validation |

---

## Sécurité — vue d'ensemble

La sécurité est documentée à deux niveaux :

- **Sécurité applicative** (code backend Node.js) → [10-autre.md](fonctionnement/10-autre.md#sécurité-applicative)
- **Sécurité infrastructure** (Docker, réseau, TLS, reverse proxy) → [11-securite-infrastructure.md](fonctionnement/11-securite-infrastructure.md)

Pour une démo ou une présentation, [11-securite-infrastructure.md](fonctionnement/11-securite-infrastructure.md) contient un tableau récapitulatif des 29 mesures appliquées, la couverture OWASP Top 10, et la procédure complète de tests de validation.
