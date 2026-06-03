# Documentation OpenCrisis

Documentation technique du projet OpenCrisis — application web de gestion de crise cyber.

---

## Index

| Fichier | Contenu |
|---|---|
| [00-plan.md](00-plan.md) | Plan de développement complet — 7 phases, schéma Prisma, librairies |
| [01-architecture.md](01-architecture.md) | Vue d'ensemble, choix techniques, concepts clés |
| [02-infrastructure-docker.md](02-infrastructure-docker.md) | Services Docker, réseau, volumes, Nginx |
| [03-base-de-donnees.md](03-base-de-donnees.md) | Modèle de données, Prisma ORM, schéma complet |
| [04-configuration.md](04-configuration.md) | Variables d'environnement, secrets, paramétrage |
| [05-guide-demarrage.md](05-guide-demarrage.md) | Prérequis, démarrage, workflow de développement |
| [06-verification.md](06-verification.md) | Tests effectués, procédures de vérification |
| [07-audit-securite.md](07-audit-securite.md) | Audit sécurité OWASP (WSTG + Top 10) — constats S1-S20, plan A-F |
| [08-audit-interface.md](08-audit-interface.md) | Audit interface (UI/UX) — constats U1-U27, plan I-VII, test live navigateur |
| [09-plan-actions-consolide.md](09-plan-actions-consolide.md) | **Plan d'actions consolidé** — point d'entrée de la session dédiée (lots P0/P1/P2 + décisions) |
| [10-propositions-evolutions.md](10-propositions-evolutions.md) | Propositions d'évolution — nouvelles fonctions, UX, UI, intégrations (Top 10 + phasage P8-P11) |

---

## Référence rapide

```bash
# Démarrer tous les services (production)
docker compose up --build --detach

# Voir l'état des containers
docker compose ps

# Voir les logs d'un service
docker compose logs <service>        # backend | frontend | postgres | redis | nginx

# Arrêter tous les services
docker compose down

# Arrêter et supprimer les volumes (DESTRUCTIF — perte des données)
docker compose down --volumes

# Accéder à la base de données
docker compose exec postgres psql -U opencrisis -d opencrisis

# Tester le backend
curl http://localhost/api/health

# Mode développement (postgres + redis uniquement)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --detach
```

---

## État d'avancement

| Phase | Description | Statut |
|---|---|---|
| Phase 1 | Infrastructure Docker (5 services, nginx, volumes) | **Terminé** |
| Phase 2 | Nettoyage et restructuration du template frontend | À faire |
| Phase 3 | Backend : auth, RBAC, Prisma migrations | À faire |
| Phase 4 | Backend : modules métier (main courante, timeline, documents…) | À faire |
| Phase 5 | Frontend : auth et navigation (Login, IncidentSelector) | À faire |
| Phase 6 | Frontend : connexion GraphQL par module | À faire |
| Phase 7 | Export PDF/Excel, Administration | À faire |
