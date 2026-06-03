# Audit de sécurité & qualité — OpenCrisis

> Date : 2026-05-31 · Périmètre : `01-frontend`, `02-backend`, `03-nginx`, infra Docker, schéma Prisma
> Méthodologie sécurité : **OWASP WSTG v4.2** + référentiel **OWASP Top 10 (éditions 2013, 2017, 2021)**
> Type : revue de code « boîte blanche » (lecture statique de l'intégralité du code source)

---

## 1. Synthèse pour la direction

Le projet est **bien structuré** : séparation nette `schema / resolvers / services / middleware`, nommage cohérent, soft-delete systématique, journal d'audit, JWT stocké en mémoire (pas de `localStorage`), cookie refresh `HttpOnly`. La base est saine et proche d'un niveau « entreprise ».

**Mais l'application n'est pas déployable en production en l'état.** L'audit révèle **un contrôle d'accès incohérent** : la règle interne « toute mutation appelle `requirePermission` » n'est pas respectée partout, et **les routes REST (`/files`, `/export`) contournent totalement la couche RBAC**. Conséquence directe : un simple compte « Observateur » (lecture seule) peut **modifier/supprimer la main courante**, et n'importe quel compte authentifié peut **télécharger tous les documents** et **exporter toute la main courante directionnelle** d'une crise.

| Sévérité | Nombre | Thème dominant |
|---|---|---|
| 🔴 Critique / Élevé | 8 | Broken Access Control (A01) |
| 🟠 Moyen | 7 | Configuration, durcissement, session |
| 🟡 Faible / Info | 5 | Hygiène, qualité |

**Top 3 à corriger en priorité absolue :** S1 (édition/suppression main courante sans permission), S2/S3 (téléchargement & export REST sans RBAC), S4 (path traversal à l'upload).

---

## 2. Méthodologie

Tests dérivés du **Web Security Testing Guide (WSTG)** de l'OWASP, croisés avec les trois dernières éditions du Top 10 pour éviter les doublons :

- **WSTG-ATHZ** (Authorization) — IDOR, contournement de schéma d'autorisation, traversée de répertoire
- **WSTG-ATHN / IDNT** (Authentication / Identity) — brute-force, énumération de comptes, identifiants par défaut, politique de mot de passe
- **WSTG-SESS** (Session Management) — gestion des jetons JWT/refresh, cookies
- **WSTG-CONF / CRYP** (Configuration / Cryptography) — en-têtes, TLS, secrets, durcissement conteneur
- **WSTG-INPV / BUSLOGIC** (Input / Business Logic) — validation, upload de fichiers, abus de logique
- **WSTG-APIT** (API/GraphQL) — introspection, profondeur/complexité des requêtes

Correspondance Top 10 : 2021 (A01→A10), réutilise les catégories 2017 (A1 Injection, A5 Broken Access Control, A6 Misconfiguration, A2 Broken Auth) et 2013 (A4 Insecure Direct Object References, A5 Security Misconfiguration) sans répéter un même test.

---

## 3. Constats détaillés

### 🔴 S1 — Mutations « main courante » sans contrôle de permission
**OWASP** A01:2021 Broken Access Control · A5:2017 · **WSTG-ATHZ-02 / ATHZ-04**
**Fichier** : [`02-backend/src/resolvers/logEntry.ts`](../02-backend/src/resolvers/logEntry.ts) (lignes 40-70)

`editLogEntry`, `deleteLogEntry`, `addTagToLogEntry`, `removeTagFromLogEntry` ne vérifient **que** l'authentification (`if (!ctx.userId)`) — **jamais `requirePermission`**, contrairement à `createLogEntry`. C'est une violation de la règle n°2 du projet.

**Impact** — N'importe quel compte authentifié (y compris **Observateur en lecture seule**) peut **modifier ou supprimer toute entrée** de main courante de n'importe quelle crise, et altérer les tags. La main courante est une **pièce à valeur probante** en gestion de crise : son intégrité doit être garantie. Aucune vérification d'appartenance à la cellule (un agent OPS peut éditer une entrée DIRECTIONAL).

### 🔴 S2 — Téléchargement de fichiers sans RBAC ni cloisonnement (IDOR)
**OWASP** A01:2021 · A4:2013 (IDOR) · **WSTG-ATHZ-04**
**Fichier** : [`02-backend/src/routes/files.ts`](../02-backend/src/routes/files.ts) (lignes 92-102)

`GET /files/:id` n'applique que `requireAuth` ; aucune vérification `requirePermission(DOCUMENTS, READ)`. La couche GraphQL (`document`) vérifie pourtant la permission — mais c'est **la route REST qui sert réellement les octets**, et elle ne la vérifie pas.

**Impact** — Tout compte authentifié peut télécharger **n'importe quel document** (preuves forensic, rapports sensibles) en énumérant les UUID, même un rôle sans aucune permission `DOCUMENTS`.

### 🔴 S3 — Exports PDF/Excel sans RBAC (fuite inter-cellules)
**OWASP** A01:2021 · **WSTG-ATHZ-02 / WSTG-BUSLOGIC**
**Fichier** : [`02-backend/src/routes/export.ts`](../02-backend/src/routes/export.ts) (lignes 23, 114)

`GET /export/:incidentId/pdf` et `/xlsx` ne vérifient que l'authentification. Le PDF exporte **toutes les cellules**, y compris `DIRECTIONAL`.

**Impact** — Un agent de la **cellule opérationnelle** (sans permission `MAIN_COURANTE_DIR`) récupère via l'export PDF l'intégralité des **notes stratégiques de la cellule directionnelle**. Le cloisonnement DIR/OPS appliqué côté GraphQL est totalement contourné. Fuite de confidentialité majeure.

### 🔴 S4 — Path traversal à l'upload via `incidentId`
**OWASP** A01:2021 / A03:2021 · **WSTG-ATHZ-01 (traversée de répertoire)**
**Fichier** : [`02-backend/src/routes/files.ts`](../02-backend/src/routes/files.ts) (lignes 57-68)

`incidentId` provient de `req.body` et est injecté tel quel dans un chemin disque : `path.join(UPLOADS_DIR, 'incidents', incidentId)`. Aucune validation (format UUID, existence de la crise). `path.join` **normalise les `..`**.

**Impact** — Un `incidentId` du type `../../...` permet d'écrire **hors du répertoire prévu**, dans le système de fichiers du conteneur. Aggravé par le fait que le conteneur tourne **en root** (S13). Écriture arbitraire de fichiers + contournement du rattachement à la crise.

### 🔴 S5 — Upload non restreint, sans type ni permission
**OWASP** A04:2021 (Insecure Design) / A05 · **WSTG-BUSLOGIC-09**
**Fichier** : [`02-backend/src/routes/files.ts`](../02-backend/src/routes/files.ts) (lignes 32-88)

Pas de `requirePermission(DOCUMENTS, WRITE)`, **aucune liste blanche de types MIME/extensions**, pas d'analyse antivirale. Tout fichier ≤ 50 Mo (HTML, SVG, exécutable) est accepté, l'extension d'origine est conservée, et le `mimeType` stocké est renvoyé tel quel au téléchargement.

**Impact** — Diffusion de contenus malveillants ; risque de **stored XSS** si le `Content-Disposition: attachment` (seule barrière avec le `nosniff` nginx) venait à changer. Tout compte authentifié peut écrire.

### 🔴 S6 — Aucune protection anti-brute-force sur le login
**OWASP** A07:2021 Identification & Auth Failures · A2:2017 · **WSTG-ATHN-03**
**Fichier** : [`02-backend/src/services/auth.ts`](../02-backend/src/services/auth.ts) (login) · [`server.ts`](../02-backend/src/server.ts)

Aucun rate-limiting, verrouillage de compte, délai progressif ou CAPTCHA. La mutation `login` accepte un nombre illimité de tentatives.

**Impact** — Brute-force / password-spraying possibles. Combiné au compte par défaut `admin@opencrisis.local / Admin1234!` (S8), compromission triviale.

### 🔴 S7 — Énumération de comptes + absence d'audit des échecs
**OWASP** A07:2021 / A09:2021 (Logging) · **WSTG-IDNT-04**
**Fichier** : [`02-backend/src/services/auth.ts`](../02-backend/src/services/auth.ts) (lignes 68-79)

`bcrypt.compare` n'est exécuté **que si l'utilisateur existe** → différence de temps de réponse mesurable = **énumération d'e-mails valides**. De plus, `logAudit` n'est appelé qu'en cas de **succès** : les échecs de connexion ne laissent **aucune trace**.

**Impact** — Cartographie des comptes valides ; attaques par force brute **invisibles** pour la supervision.

### 🔴 S8 — Identifiants par défaut & politique de mot de passe absente
**OWASP** A07:2021 / A05:2021 · **WSTG-ATHN-02 (default creds) / ATHN-07 (weak policy)**
**Fichiers** : [`prisma/seed.ts`](../02-backend/prisma/seed.ts) (l.94-108), [`services/admin.ts`](../02-backend/src/services/admin.ts) (createUser/resetPassword)

Admin par défaut `Admin1234!` **écrit en clair dans les logs**, aucun changement forcé au premier login. `createUser`/`resetPassword` acceptent **n'importe quelle chaîne** comme mot de passe (aucune contrainte longueur/complexité), alors que `zod` est déjà dans les dépendances mais non utilisé.

**Impact** — Compte d'administration prévisible ; mots de passe utilisateurs faibles autorisés.

---

### 🟠 S9 — Fuite de données inter-cellules dans `logEntries`
**OWASP** A01:2021 · **WSTG-ATHZ-02** — [`resolvers/logEntry.ts`](../02-backend/src/resolvers/logEntry.ts) (l.18-26)

Quand l'argument `cell` est omis, la requête ne vérifie que `MAIN_COURANTE_DIR:READ` mais `getLogEntries` retourne **toutes les cellules**. Un utilisateur Directionnel lit ainsi les entrées Opérationnelles. Le contrôle et le filtrage de données ne sont pas alignés.

### 🟠 S10 — Introspection GraphQL active & pas de limite de profondeur/complexité
**OWASP** A05:2021 / DoS · **WSTG-APIT-01** — [`server.ts`](../02-backend/src/server.ts) (l.64-78)

`ApolloServer` sans `introspection: false` ni règle de validation (`graphql-depth-limit` / analyse de coût). Schéma exposé ; requêtes imbriquées non bornées → **épuisement de ressources (DoS)**. Aucun timeout de requête.

### 🟠 S11 — Vérification JWT sans épinglage d'algorithme
**OWASP** A02:2021 · **WSTG-SESS / ATHN** — [`middleware/auth.ts`](../02-backend/src/middleware/auth.ts) (l.8-14)

`jwt.verify(token, secret)` sans `{ algorithms: ['HS256'] }`, ni claims `iss`/`aud`. Durcissement défense-en-profondeur recommandé.

### 🟠 S12 — En-têtes de sécurité incomplets, pas de TLS/HSTS/CSP
**OWASP** A05:2021 / A02:2021 · **WSTG-CONF / CRYP-03** — [`03-nginx/nginx.conf`](../03-nginx/nginx.conf)

nginx n'écoute qu'en **HTTP :80** (pas de TLS, pas de HSTS), **aucune `Content-Security-Policy`**, `X-XSS-Protection` est obsolète (devrait être `0`). Le cookie refresh est `Secure` uniquement si `NODE_ENV=production` — or le proxy étant en clair, le cookie `Secure` ne serait jamais émis.

**Impact** — MITM, absence de chiffrement transport, défense XSS affaiblie.

### 🟠 S13 — Conteneur backend exécuté en root
**OWASP** A05:2021 · **WSTG-CONF** — [`02-backend/Dockerfile`](../02-backend/Dockerfile)

Aucune directive `USER node`. Le process et le volume `uploads` sont en root, ce qui **amplifie le rayon d'action de S4**.

### 🟠 S14 — Refresh tokens : stockage en clair, pas de détection de rejeu
**OWASP** A07:2021 / A02:2021 · **WSTG-SESS** — [`services/auth.ts`](../02-backend/src/services/auth.ts) (l.51-120)

Les refresh tokens sont stockés **en clair** en base (le JWT lui-même). La rotation supprime l'ancien, mais le rejeu d'un token volé n'est pas distingué (« introuvable » sans révocation de la famille). Une fuite de la base = tokens exploitables jusqu'à expiration.

### 🟠 S15 — IP source non capturée dans l'audit (proxy non déclaré)
**OWASP** A09:2021 · **WSTG-CONF** — [`server.ts`](../02-backend/src/server.ts)

Express n'a pas `app.set('trust proxy', …)`. `req.ip` (utilisé par `logAudit`) renvoie donc **l'IP de nginx**, pas celle du client réel. Tous les journaux d'audit enregistrent la même IP interne → **forensique inopérante**.

---

### 🟡 Constats faibles / informationnels

- **S16 — Mutations `tag` sans RBAC** ([`resolvers/tag.ts`](../02-backend/src/resolvers/tag.ts)) : `createTag`/`deleteTag` n'exigent que l'authentification. Écriture globale non contrôlée (faible sensibilité).
- **S17 — Composant obsolète** : `multer@1.4.5-lts.1` est en fin de vie (dépendance `dicer`/`busboy` historiquement vulnérable). **A06:2021 Vulnerable Components** — migrer vers `multer@2.x`.
- **S18 — Données non cloisonnées par appartenance** : `getDocuments`/`getContacts` ne filtrent pas selon les crises auxquelles l'utilisateur participe (acceptable en mono-organisation, à garder en tête pour le moindre privilège).
- **S19 — Numérotation PDF erronée** : pied de page figé à `Page 1/N` ([`export.ts`](../02-backend/src/routes/export.ts) l.102) — bug fonctionnel mineur.
- **S20 — Aucun test automatisé** dans le dépôt (aucun `*.test.ts`/`*.spec.ts`). Indispensable au niveau « entreprise », en particulier pour verrouiller le RBAC.

---

## 4. Constats qualité de code (hors sécurité)

Le code est globalement propre et cohérent. Points d'amélioration :

| # | Constat | Fichier(s) |
|---|---|---|
| Q1 | **Modèle d'autorisation incohérent** (cause racine de S1/S16) : certains resolvers utilisent `requirePermission`, d'autres seulement `if (!ctx.userId)`. Une protection « opt-in » finit toujours par être oubliée. | `resolvers/*` |
| Q2 | **`requireAuth` dupliqué** à l'identique dans `files.ts` et `export.ts` (copier-coller). À extraire dans un middleware partagé. | `routes/files.ts`, `routes/export.ts` |
| Q3 | **Validation d'entrée absente** : `zod` est installé mais inutilisé. Pas de validation d'e-mail, de longueur, de format UUID, de politique de mot de passe. | global |
| Q4 | **Aucun test** (unitaire/intégration), notamment sur le RBAC. | — |
| Q5 | `if (!ctx.userId)` après `await requirePermission(...)` est **redondant** (requirePermission lève déjà) — sert uniquement au typage TS, à factoriser. | `resolvers/*` |
| Q6 | Validation d'environnement minimale (3 variables) ; `CORS_ORIGIN` mono-valeur. À centraliser (schéma `zod` d'env). | `server.ts` |
| Q7 🔴 | **Aucun index DB** : le schéma n'a aucun `@@index` ; la migration ne crée que les contraintes `UNIQUE`. Toutes les colonnes de FK (`incidentId`, `authorId`, `userId`, `uploadedById`, `actorId`…) et de tri/filtre (`AuditLog.createdAt`, `LogEntry.createdAt`, `deletedAt`) sont non indexées → scans complets dégradants. Critique pour `AuditLog` (croît à chaque mutation, trié par `createdAt`) et la main courante/timeline (`incidentId`). | `schema.prisma`, `migration.sql` |
| Q8 🟠 | **`.gitignore` ignore les `migration.sql`** : toute nouvelle migration ne sera pas versionnée → `prisma migrate deploy` cassé en CI / checkout propre / build Docker. Contradiction avec le commentaire « versionné ». | `.gitignore:16` |
| Q9 🟡 | Dette/nettoyage : alias `@/` configuré mais inutilisé ; `fonts.css` vide mais importé ; `DB - Template.txt` obsolète à la racine ; bloat de dépendances frontend (template shadcn) ; aucun lint/format (eslint/prettier) ni test. | divers |

**Globalement, la complexité n'est pas excessive** : pas de code mort significatif, abstractions justifiées, pas de sur-ingénierie. L'effort doit porter sur la **rigueur de sécurité** plutôt que sur la simplification.

---

## 5. Plan de correction — mesure par mesure, par catégorie

> **Priorités** : **P0** = bloquant production · **P1** = avant mise en prod réelle · **P2** = durcissement / dette.
>
> **Impact** (issu de l'analyse de consommation du frontend) :
> - 🟢 **Transparent** — s'aligne sur le gating UI existant ; aucune régression pour les utilisateurs légitimes. Réalisable sans décision préalable.
> - 🟠 **Décision requise** — change un comportement visible ; **dépend d'un arbitrage produit** (voir §5.1). **Reporté à une session dédiée.**
> - 🔵 **Infra / ops** — pas de changement de code applicatif, mais travail d'environnement (certificats, permissions, dépendances).
>
> Constat clé : le frontend gate déjà l'écriture via `hasPermission` et passe **toujours** l'argument `cell`. La plupart des correctifs P0 ne font donc que **rendre le backend cohérent avec l'UI** — ils ferment un contournement sans modifier les parcours.

### 5.1 Décisions produit en attente (à trancher en session dédiée) ⏸️

Ces trois points conditionnent A3, A1(option) et C3. **À ne pas coder avant arbitrage.**

| Réf | Décision | Options |
|---|---|---|
| **DÉC-1** | **Cloisonnement de l'export** (bloque A3) | (a) Export **scoped** aux cellules autorisées de l'appelant *(recommandé)* · (b) deux endpoints distincts DIR/OPS + adaptation des boutons frontend |
| **DÉC-2** | **Périmètre d'édition de la main courante** (option de A1) | (a) Édition **réservée à l'auteur** (= UI actuelle) · (b) un Pilote/Admin peut corriger l'entrée d'autrui |
| **DÉC-3** | **Stratégie mot de passe** (cadre C3) | (a) Politique de complexité seule *(rapide)* · (b) + flux « changement forcé au 1er login » (nouvel écran + champ schéma + migration) |

### Catégorie A — Contrôle d'accès (A01) · **P0**
1. **A1** 🟢 — Ajouter `requirePermission` aux 4 mutations de `logEntry.ts` (S1). Déduire la ressource via la `cell` de l'entrée ciblée (charger l'entrée d'abord) → `MAIN_COURANTE_DIR/OPS:WRITE`. *Le verrou de base est transparent (aligné sur `canWrite`) ; le périmètre auteur vs pilote = **DÉC-2**.*
2. **A2** 🟢 — Protéger `GET /files/:id` : après `getDocument`, vérifier `DOCUMENTS:READ` (via le helper C2). Tous les rôles voyant des documents ont déjà cette permission → transparent.
3. **A3** 🟠 — Protéger `GET /export/:incidentId/(pdf|xlsx)`. **Bloqué par DÉC-1** : un verrou naïf `MAIN_COURANTE_DIR:READ` casserait le bouton « Exporter » de la page Opérationnelle. Le correctif doit être **cloisonné**.
4. **A4** 🟢 — Aligner `logEntries` (S9) : filtrer les cellules retournées selon les permissions quand `cell` est omis. Le frontend passant toujours `cell`, **impact nul** — ferme uniquement le trou API.
5. **A5** 🟢 — Ajouter `requirePermission` aux mutations `tag` (S16).

### Catégorie B — Upload / validation de fichiers (A03/A04) · **P0**
6. **B1** 🟢 — Valider `incidentId` (regex UUID + existence en base) **avant** toute opération disque (S4).
7. **B2** 🟢 — Exiger `DOCUMENTS:WRITE` à l'upload (S5). Déjà gaté côté UI (Observateur = READ seul) → transparent.
8. **B3** 🟠 — Liste blanche MIME/extensions + vérification du *magic number* ; nom de fichier généré (UUID), jamais l'`originalname` sur disque. **Décision légère** : figer la liste des formats réellement utilisés (PDF, Office, images, `.eml`, archives…) pour ne pas rejeter de fichiers légitimes.
9. **B4** 🔵 — Migrer `multer@1.x → 2.x` (S17) + `npm audit`. Retester le parcours d'upload.

### Catégorie C — Authentification & session (A07/A02) · **P0/P1**
10. **C1** 🟢 *(P0)* — Rate-limiting sur `login` (compteur Redis : 5 essais / 15 min / IP+email) + verrouillage temporaire (S6). N'affecte que l'abus.
11. **C2** 🟢 *(P0)* — Factoriser le contrôle de permission en helper réutilisable HTTP **et** GraphQL (prérequis propre de A2/A3).
12. **C3** 🟠 *(P1)* — Politique de mot de passe via `zod` sur `createUser`/`resetPassword`/seed (S8). **Cadré par DÉC-3** (complexité seule vs + 1er login forcé).
13. **C4** 🟢 *(P1)* — `bcrypt.compare` factice si l'utilisateur n'existe pas (anti-timing) + **journaliser les échecs** (`LOGIN_FAILED`) (S7).
14. **C5** 🟢 *(P1)* — Épingler l'algorithme JWT (`algorithms: ['HS256']`) + claims `iss`/`aud` (S11). Transparent (jetons déjà HS256).
15. **C6** 🔵 *(P2)* — Refresh tokens : stocker un **hash** (SHA-256) + détection de rejeu (révocation de la famille) (S14). **Impact ponctuel** : invalide les sessions actives au déploiement (reconnexion unique) → fenêtre de maintenance.

### Catégorie D — Configuration & durcissement (A05) · **P1**
16. **D1** 🔵 — TLS sur nginx (HTTPS :443, redirection 80→443) + **HSTS** ; **CSP** ajustée à la SPA (style inline Tailwind/shadcn → `style-src 'unsafe-inline'` ou nonces) ; `X-XSS-Protection: 0` (S12). ⚠️ **Corrige aussi un bug latent** : `NODE_ENV=production` + HTTP fait rejeter le cookie `Secure` → session cassée aujourd'hui.
17. **D2** 🔵 — `USER node` dans le `Dockerfile` + `chown` du volume `uploads` (S13).
18. **D3** 🟢 — `app.set('trust proxy', 1)` pour capturer la vraie IP client (S15).
19. **D4** 🟢 — Désactiver l'introspection GraphQL **en prod uniquement** (dev conservé pour `codegen`) + `graphql-depth-limit`/coût + timeout (S10).
20. **D5** 🟢 — `helmet` sur Express + limite de taille du body `/api/graphql`.

### Catégorie E — Observabilité & journalisation (A09) · **P1**
21. **E1** 🟢 — Journaliser les échecs d'authentification et les refus de permission (`FORBIDDEN`) (cf. C4).
22. **E2** 🟢 — Vérifier que l'audit capture une IP exploitable (dépend de D3).

### Catégorie F — Qualité & dette · **P2**
23. **F1** 🟢 — Centraliser la validation d'entrée avec `zod` (resolvers + routes) (Q3).
24. **F2** 🟢 — Extraire le middleware `requireAuth` partagé (Q2) + retirer les `if (!ctx.userId)` redondants (Q5).
25. **F3** 🟢 — Suite de tests (Vitest/Jest) priorisant le RBAC : un test par couple ressource×action (acceptation **et** refus) (S20/Q4).
26. **F4** 🟢 — Schéma `zod` de validation des variables d'environnement au démarrage (Q6).
27. **F5** 🟢 — Corriger la numérotation des pages du PDF (S19).
28. **F6** 🔴 *(P1, perf)* — Ajouter des `@@index` Prisma sur les FK et colonnes de tri/filtre (`LogEntry.incidentId`, `TimelineEvent.incidentId`, `Document.incidentId`, `AuditLog.[incidentId, createdAt]`, `RefreshToken.userId`, `*.deletedAt`) + migration (Q7).
29. **F7** 🟠 *(P1, ops)* — Corriger le `.gitignore` pour **versionner les `migration.sql`** (Q8).
30. **F8** 🟡 *(P2)* — Nettoyage : retirer/utiliser l'alias `@/`, supprimer `fonts.css` vide et `DB - Template.txt`, élaguer les dépendances inutilisées, ajouter eslint/prettier (Q9).

---

## 6. Feuille de route révisée

Réorganisée selon l'impact : on démarre par tout ce qui **ne dépend d'aucune décision**, on isole les points d'arbitrage dans une session dédiée.

| Lot | Contenu | Pré-requis | Objectif |
|---|---|---|---|
| **Lot 0 — Sécurisation transparente** 🟢 *(démarrable immédiatement)* | A1*(verrou base)*, A2, A4, A5, B1, B2, C1, C2, C4, C5, D3, D4, D5, E1, E2 | Aucun | Fermer l'essentiel du contrôle d'accès + brute-force **sans régression** ni décision |
| **Session « Décisions »** ⏸️ | Trancher DÉC-1, DÉC-2, DÉC-3 | — | Débloquer A3, l'option de A1, et C3 |
| **Lot 1 — Post-décisions** 🟠 | A3, A1*(périmètre)*, B3, C3 | DÉC-1/2/3 | Cloisonnement export, upload, politique mdp |
| **Lot 2 — Infra & durcissement** 🔵 | B4, C6, D1, D2 | Certificats TLS, fenêtre de maintenance | TLS/HSTS/CSP, conteneur non-root, tokens hashés, multer 2.x |
| **Lot 3 — Qualité & dette** 🟢 | F1-F5 | — | Validation, refactor, tests RBAC |

**Jalons de vérification :**
- Fin de Lot 0 : re-tester S1, S2, S6, S7, S9 — un compte **Observateur** ne peut plus éditer la main courante ni télécharger un document hors permission ; le brute-force est limité et journalisé.
- Fin de Lot 1 : re-tester S3, S4, S5, S8 — plus de fuite inter-cellules à l'export, plus de path traversal, mots de passe faibles rejetés.
- Fin de Lot 3 : viser une **couverture de tests RBAC ≥ 90 %**.
