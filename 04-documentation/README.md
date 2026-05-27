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
