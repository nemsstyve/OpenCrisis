# Base de données

## Vue d'ensemble

La base de données est PostgreSQL 16, gérée via Prisma 5. Le fichier source de vérité est `02-backend/prisma/schema.prisma`.

**Principes :**
- UUID v4 pour toutes les clés primaires (pas d'entiers auto-incrémentés exposés dans l'API)
- Soft delete sur toutes les entités métier (`deletedAt DateTime?`) — jamais de `DELETE` SQL
- Indexes sur les colonnes fréquemment filtrées (`deletedAt`, `incidentId`, `createdAt`, etc.)

---

## Modèles

### Identité & accès

#### `User`
Utilisateur de l'application.

| Champ | Type | Description |
|---|---|---|
| `id` | UUID | Clé primaire |
| `email` | String | Unique, identifiant de connexion |
| `passwordHash` | String | Hash bcrypt du mot de passe |
| `firstName`, `lastName` | String | Identité |
| `phone`, `company`, `site` | String? | Informations optionnelles |
| `isActive` | Boolean | Compte actif/désactivé |
| `mustChangePassword` | Boolean | Force le changement de mdp à la connexion |
| `deletedAt` | DateTime? | Soft delete |

#### `Role`
Rôle nommé attribuable à un utilisateur.

| Champ | Type | Description |
|---|---|---|
| `id` | UUID | Clé primaire |
| `name` | String | Unique (ex : "Administrateur") |
| `isSystem` | Boolean | Si `true`, non supprimable |

#### `Permission`
Combinaison unique `PermissionResource × PermissionAction`.

| Champ | Type | Description |
|---|---|---|
| `resource` | PermissionResource | Ressource protégée |
| `action` | PermissionAction | READ ou WRITE |

#### `RoleAssignment`
Liaison User ↔ Role (M2M). Un utilisateur peut avoir plusieurs rôles.

#### `RolePermission`
Liaison Role ↔ Permission (M2M). Définit les droits d'un rôle.

#### `RefreshToken`
Refresh tokens actifs stockés en base.

| Champ | Type | Description |
|---|---|---|
| `token` | String | Valeur du token (unique) |
| `userId` | String | Propriétaire |
| `expiresAt` | DateTime | Date d'expiration |

---

### Incident (workspace central)

#### `Incident`
Entité centrale. Tout le contenu (main courante, timeline, documents) est rattaché à un incident.

| Champ | Type | Description |
|---|---|---|
| `name` | String | Nom de l'incident |
| `status` | IncidentStatus | ACTIVE, CONTAINED, CLOSED |
| `severity` | Severity | LOW, MEDIUM, HIGH, CRITICAL |
| `startedAt` | DateTime | Début de l'incident |
| `resolvedAt` | DateTime? | Résolution (null si en cours) |
| `openctiCaseId` | String? | Référence vers un Case OpenCTI |
| `deletedAt` | DateTime? | Soft delete |

---

### Main courante

#### `LogEntry`
Entrée du journal de bord.

| Champ | Type | Description |
|---|---|---|
| `incidentId` | String | Incident parent |
| `cell` | Cell | DIRECTIONAL, OPERATIONAL, SHARED |
| `content` | String | Contenu de l'entrée |
| `authorId` | String | Auteur |
| `isEdited` | Boolean | Indique si l'entrée a été modifiée |
| `editedAt`, `editedById` | — | Traçabilité des modifications |
| `deletedAt` | DateTime? | Soft delete |

#### `Tag`
Tag libre associé aux entrées main courante.

| Champ | Type | Description |
|---|---|---|
| `name` | String | Unique |
| `color` | String | Couleur hexadécimale |

#### `LogEntryTag`
Liaison LogEntry ↔ Tag (M2M).

---

### Timeline

#### `TimelineEvent`
Événement chronologique de la crise.

| Champ | Type | Description |
|---|---|---|
| `incidentId` | String | Incident parent |
| `type` | TimelineEventType | Catégorie de l'événement |
| `title` | String | Titre court |
| `occurredAt` | DateTime | Date/heure de l'événement (pas de création) |
| `actorId` | String? | Utilisateur responsable |
| `ipAddress`, `assetName`, `affectedUser` | String? | Contexte technique |
| `openctiEntityId`, `openctiEntityType` | String? | Lien OpenCTI |
| `deletedAt` | DateTime? | Soft delete |

---

### Documents

#### `Document`
Fichier uploadé.

| Champ | Type | Description |
|---|---|---|
| `incidentId` | String? | `null` = bibliothèque globale |
| `timelineEventId` | String? | Document lié à un événement timeline |
| `name` | String | Nom d'affichage |
| `filePath` | String | Chemin dans le volume Docker |
| `mimeType` | String | Type MIME |
| `sizeBytes` | Int | Taille en octets |
| `category` | DocumentCategory | Catégorie du document |
| `uploadedById` | String | Auteur de l'upload |
| `openctiEntityId`, `openctiEntityType` | String? | Lien OpenCTI |
| `deletedAt` | DateTime? | Soft delete |

---

### Annuaire

#### `Contact`
Contact de l'organisation.

| Champ | Type | Description |
|---|---|---|
| `firstName`, `lastName` | String | Identité |
| `role` | String | Fonction dans l'organisation |
| `organization`, `phone`, `email`, `site`, `notes` | — | Informations de contact |
| `deletedAt` | DateTime? | Soft delete |

---

### Audit

#### `AuditLog`
Trace immuable de toutes les mutations. Jamais de soft delete — jamais de suppression.

| Champ | Type | Description |
|---|---|---|
| `userId` | String? | Utilisateur qui a effectué l'action (null si système) |
| `action` | String | Nom de l'action (CREATE, UPDATE, DELETE, LOGIN...) |
| `resource` | String | Nom de l'entité |
| `resourceId` | String? | ID de l'entité concernée |
| `incidentId` | String? | Incident concerné |
| `metadata` | Json? | Données contextuelles libres |
| `ipAddress` | String? | IP de l'appelant |

---

## Enums

| Enum | Valeurs |
|---|---|
| `IncidentStatus` | `ACTIVE`, `CONTAINED`, `CLOSED` |
| `Severity` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `Cell` | `DIRECTIONAL`, `OPERATIONAL`, `SHARED` |
| `TimelineEventType` | `DETECTION`, `ACTION`, `DECISION`, `COMMUNICATION`, `ESCALATION`, `RESOLUTION` |
| `DocumentCategory` | `ARTIFACT`, `FICHE_REFLEXE`, `RAPPORT`, `PROCEDURE`, `OTHER` |
| `PermissionAction` | `READ`, `WRITE` |
| `PermissionResource` | `DASHBOARD`, `MAIN_COURANTE_DIR`, `MAIN_COURANTE_OPS`, `TIMELINE`, `DOCUMENTS`, `BIBLIOTHEQUE`, `ANNUAIRE`, `ADMIN` |

---

## Procédures

### Créer une migration

Après modification de `schema.prisma` :

```bash
# En production (via Docker)
docker exec -it opencrisis-backend-1 npx prisma migrate dev --name <nom>

# En développement local
cd 02-backend && npx prisma migrate dev --name <nom>
```

### Lancer le seed

```bash
docker exec opencrisis-backend-1 npx prisma db seed
```

### Ouvrir Prisma Studio

```bash
docker exec opencrisis-backend-1 npx prisma studio
# Accessible sur http://localhost:5555
```

> Ne jamais modifier les fichiers dans `prisma/migrations/` manuellement.
