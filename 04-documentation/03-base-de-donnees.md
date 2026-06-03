# Base de données — Modèle de données et Prisma

## Prisma ORM

### Qu'est-ce que Prisma ?

Prisma est un **ORM (Object-Relational Mapper)** pour Node.js et TypeScript. Il fait l'intermédiaire entre le code applicatif et PostgreSQL.

**Sans Prisma** (SQL brut avec le module `pg`) :
```typescript
// Le type retourné est `any` — aucune vérification à la compilation
const result = await pool.query("SELECT * FROM incidents WHERE status = $1", ['ACTIVE']);
const incident = result.rows[0]; // incident.naem ? Erreur détectée seulement à l'exécution
```

**Avec Prisma** :
```typescript
// Type généré automatiquement depuis le schéma
const incident = await prisma.incident.findMany({
  where: { status: 'ACTIVE' },
  include: { logEntries: true }
}); // incident.name → autocomplétion, erreur de typo à la compilation
```

### Les trois composants de Prisma

| Composant | Rôle | Fichier |
|---|---|---|
| **Prisma Schema** | Définition du modèle de données | `02-backend/prisma/schema.prisma` |
| **Prisma Migrate** | Génère et applique les migrations SQL | `02-backend/prisma/migrations/` |
| **Prisma Client** | Client TypeScript généré auto | `node_modules/@prisma/client` |

### Commandes principales

```bash
# Créer et appliquer une migration (développement)
docker compose exec backend npx prisma migrate dev --name nom_de_la_migration

# Appliquer les migrations en production (sans créer de nouvelle)
docker compose exec backend npx prisma migrate deploy

# Générer le client TypeScript (après modification du schéma)
docker compose exec backend npx prisma generate

# Peupler la base avec les données initiales
docker compose exec backend npx prisma db seed

# Ouvrir l'interface graphique Prisma Studio
docker compose exec backend npx prisma studio
# → Accessible sur http://localhost:5555
```

---

## Architecture du modèle de données

Le modèle est organisé en **5 couches** autour de l'`Incident` comme entité centrale.

```
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 1 — IDENTITÉ & ACCÈS                                    │
│                                                                  │
│  User ────── RoleAssignment ────── Role                          │
│                                      └── RolePermission ── Permission
│  User ────── RefreshToken                                        │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Un utilisateur crée/agit dans
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 2 — WORKSPACE (entité centrale)                          │
│                                                                  │
│  Incident { id, name, status, severity, startedAt, resolvedAt } │
└─────────────────────────────────────────────────────────────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────────┐
│ LogEntry │  │ Timeline  │  │ Document │  │ IncidentContact  │
│ (main    │  │ Event     │  │          │  │ (annuaire)       │
│ courante)│  │           │  │          │  │                  │
└──────────┘  └───────────┘  └──────────┘  └──────────────────┘
     │                │               │
     ▼                ▼               └────── Bibliothèque globale
┌──────────┐  ┌───────────────┐              (incidentId = null)
│ Tag      │  │ openctiEntity │
│ (M2M via │  │ (optionnel)   │
│LogEntryTag│ └───────────────┘
└──────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 5 — TRAÇABILITÉ (transverse)                            │
│                                                                  │
│  AuditLog { userId, action, resource, metadata, ipAddress }     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Schéma complet et annoté

### Utilisateurs et contrôle d'accès

```prisma
model User {
  id           String    @id @default(uuid())  // UUID v4 — pas d'ID séquentiel exposé
  email        String    @unique
  passwordHash String                          // Jamais le mot de passe en clair
  firstName    String
  lastName     String
  phone        String?
  company      String?
  site         String?                         // Site physique ("Paris - Siège")
  isActive     Boolean   @default(true)        // Désactivation sans suppression
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt            // Mis à jour automatiquement par Prisma
  deletedAt    DateTime?                       // Soft delete — jamais DELETE en base
  // ... relations
}

model Role {
  id          String    @id @default(uuid())
  name        String    @unique
  isSystem    Boolean   @default(false)  // true = rôle de base non supprimable
  // ... relations
}

model Permission {
  resource PermissionResource  // Quelle section de l'app
  action   PermissionAction    // READ ou WRITE
  @@unique([resource, action]) // Une permission = une combinaison unique
}
```

**Logique RBAC** :
- Un `User` peut avoir plusieurs `Role` (via `RoleAssignment`)
- Un `Role` a plusieurs `Permission` (via `RolePermission`)
- Une `Permission` = accès READ ou WRITE à une ressource (onglet de l'app)

### Incident — l'entité workspace

```prisma
model Incident {
  id            String         @id @default(uuid())
  name          String                              // Ex: "Ransomware Production - Mai 2026"
  status        IncidentStatus @default(ACTIVE)     // ACTIVE | CONTAINED | CLOSED
  severity      Severity       @default(MEDIUM)     // LOW | MEDIUM | HIGH | CRITICAL
  startedAt     DateTime       @default(now())
  resolvedAt    DateTime?                           // null tant que non résolu
  openctiCaseId String?                             // Lien optionnel vers OpenCTI
  deletedAt     DateTime?                           // Soft delete
}
```

Tout dans l'application est filtré par `incidentId`. Changer d'incident dans l'interface = changer le filtre.

### Main courante

```prisma
model LogEntry {
  incidentId String
  cell       Cell      // DIRECTIONAL | OPERATIONAL | SHARED
  content    String
  authorId   String
  isEdited   Boolean   @default(false)
  editedAt   DateTime?
  editedById String?   // Qui a modifié l'entrée
  deletedAt  DateTime? // Soft delete — les entrées ne disparaissent jamais
}

model Tag {
  name  String @unique
  color String @default("#6B7280")
}

// Relation many-to-many entre LogEntry et Tag
model LogEntryTag {
  logEntryId String
  tagId      String
  @@id([logEntryId, tagId])
}
```

Le champ `cell` distingue les journaux : un membre de la cellule directionnelle ne peut écrire que dans `DIRECTIONAL`, et voir `SHARED`. La séparation est appliquée par le RBAC.

### Timeline

```prisma
model TimelineEvent {
  type              TimelineEventType  // DETECTION | ACTION | DECISION | ...
  title             String
  occurredAt        DateTime           // Moment réel de l'événement (peut différer du createdAt)
  actorId           String?            // Utilisateur responsable de l'action
  ipAddress         String?            // Adresse IP impliquée (investigation)
  assetName         String?            // Asset système concerné
  affectedUser      String?            // Utilisateur affecté (texte libre)
  openctiEntityId   String?            // Observable OpenCTI lié (optionnel)
  openctiEntityType String?            // "IPv4-Addr", "Malware", etc.
}
```

### Documents, Bibliothèque et Artefacts

```prisma
model Document {
  incidentId      String?  // null = Bibliothèque globale (fiches réflexes, procédures)
                           // non-null = Artefact ou rapport lié à un incident
  timelineEventId String?  // Pièce jointe à un événement timeline
  filePath        String   // Chemin relatif dans le volume uploads_data
                           // Ex: "incidents/uuid/rapport-forensic.pdf"
  category        DocumentCategory  // ARTIFACT | FICHE_REFLEXE | RAPPORT | PROCEDURE | OTHER
}
```

**Trois usages d'un seul modèle `Document`** :
- `incidentId = null` + `category = FICHE_REFLEXE` → Bibliothèque globale
- `incidentId = X` + `category = ARTIFACT` → Artefact d'investigation
- `incidentId = X` + `timelineEventId = Y` → Pièce jointe à un événement timeline

### Audit Log

```prisma
model AuditLog {
  userId     String?  // null si action système
  action     String   // "CREATE_LOG_ENTRY", "UPLOAD_DOCUMENT", "CHANGE_INCIDENT_STATUS"...
  resource   String   // "LogEntry", "Incident", "Document"...
  resourceId String?  // ID de la ressource affectée
  incidentId String?  // Incident concerné (pour filtrer les logs d'un incident)
  metadata   Json?    // Données supplémentaires (ancien/nouveau état, paramètres)
  ipAddress  String?  // IP du client
  createdAt  DateTime @default(now())
  // Pas de deletedAt — un audit log ne se supprime JAMAIS
}
```

---

## Décisions de modélisation

### UUID plutôt qu'ID séquentiels

Tous les IDs sont des **UUID v4** (`@default(uuid())`).

- **Sécurité** : un ID séquentiel `123` invite à tester `122`, `124`... Un UUID v4 est imprévisible
- **Distribution** : permet de générer des IDs sans coordination avec la base (utile si on distribue la génération)
- **Merge de données** : si on fusionne des données de deux instances, pas de collision d'IDs

### Soft delete universel

Toutes les entités importantes ont un champ `deletedAt DateTime?`.

- `deletedAt = null` → enregistrement actif
- `deletedAt = DateTime` → enregistrement supprimé

**Pourquoi ne pas vraiment supprimer ?**
- **Audit post-crise** : une entrée de main courante "supprimée" par erreur doit rester accessible aux administrateurs
- **Obligations légales** : dans le cadre d'une investigation, la suppression de preuves est un problème
- **Référentiel intègre** : les `AuditLog` pointent vers des `resourceId` qui doivent rester en base

La requête standard exclut automatiquement les suppressions :
```typescript
prisma.logEntry.findMany({ where: { incidentId: id, deletedAt: null } })
```

### Timestamps automatiques

```prisma
createdAt DateTime @default(now())  // Rempli à la création
updatedAt DateTime @updatedAt       // Mis à jour par Prisma à chaque modification
```

Prisma gère `updatedAt` automatiquement — aucun code applicatif nécessaire.

### Relations many-to-many explicites

Au lieu d'une table de jointure implicite Prisma, on utilise des tables explicites (`LogEntryTag`, `RolePermission`, `IncidentContact`) pour pouvoir y ajouter des métadonnées si nécessaire.

---

## Enums

| Enum | Valeurs | Usage |
|---|---|---|
| `IncidentStatus` | `ACTIVE`, `CONTAINED`, `CLOSED` | Statut de progression d'un incident |
| `Severity` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | Niveau de gravité |
| `Cell` | `DIRECTIONAL`, `OPERATIONAL`, `SHARED` | Cellule propriétaire d'une entrée |
| `TimelineEventType` | `DETECTION`, `ACTION`, `DECISION`, `COMMUNICATION`, `ESCALATION`, `RESOLUTION` | Nature d'un événement timeline |
| `DocumentCategory` | `ARTIFACT`, `FICHE_REFLEXE`, `RAPPORT`, `PROCEDURE`, `OTHER` | Type de document |
| `PermissionResource` | `DASHBOARD`, `MAIN_COURANTE_DIR`, `MAIN_COURANTE_OPS`, `TIMELINE`, `DOCUMENTS`, `BIBLIOTHEQUE`, `ANNUAIRE`, `CARTOGRAPHIE`, `ADMIN` | Section de l'app contrôlée par RBAC |
| `PermissionAction` | `READ`, `WRITE` | Niveau d'accès |
