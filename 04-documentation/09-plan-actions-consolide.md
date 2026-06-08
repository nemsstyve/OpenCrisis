# Plan d'actions consolidé — OpenCrisis

> Date : 2026-05-31 · Point d'entrée unique pour la **session de travail dédiée**.
> Agrège les deux audits. Détail des constats :
> - 🔐 Sécurité : [07-audit-securite.md](07-audit-securite.md) (constats S1-S20, Q1-Q6 · plan A-F)
> - 🖥️ Interface : [08-audit-interface.md](08-audit-interface.md) (constats U1-U27 · plan I-VII · test live en §5)
>
> **Légende** — Impact : 🟢 transparent (aucune décision) · 🟠 décision requise · 🔵 infra/ops. Effort : S ≤ ½ j · M 1-2 j · L > 2 j.

---

## 1. Décisions à trancher (à faire en début de session) ⏸️

Rien de ce qui en dépend ne doit être codé avant arbitrage.

| Réf | Sujet | Options | Bloque |
|---|---|---|---|
| **DÉC-1** | Cloisonnement de l'export | (a) export *scoped* aux cellules autorisées *(reco)* · (b) 2 endpoints DIR/OPS + boutons | Séc. A3 · UI III3 (U4) |
| **DÉC-2** | Périmètre d'édition main courante | (a) auteur seul (= UI actuelle) · (b) pilote/admin peut corriger autrui | Séc. A1 (option) |
| **DÉC-3** | Stratégie mot de passe | (a) complexité seule *(rapide)* · (b) + changement forcé au 1er login | Séc. C3 · UI VII2 |
| **DÉC-UI-1** | Mode clair (U1) | (a) **abandonner** → `forcedTheme="dark"` + retirer le bouton *(rapide)* · (b) **achever** le thème clair (L) | UI II1/II2 |
| **DÉC-UI-2** | Source de types (U10) | (a) brancher codegen + supprimer `api.ts` · (b) assumer types manuels + supprimer codegen/`generated.ts` + MAJ CLAUDE.md | UI VI1 |

---

## 2. Backlog priorisé par lots

### 🔴 P0 — Bloquant production (à faire avant tout déploiement)

**Sécurité — contrôle d'accès & upload** (réf. plan séc. A/B/C)
- A1 🟢 — `requirePermission` sur les 4 mutations `logEntry` (S1)
- A2 🟢 — RBAC sur `GET /files/:id` (S2)
- A4 🟢 — `logEntries` : filtrer les cellules selon permissions (S9)
- A5 🟢 — RBAC sur mutations `tag` (S16)
- B1 🟢 — Valider `incidentId` avant écriture disque (S4, path traversal)
- B2 🟢 — RBAC `DOCUMENTS:WRITE` à l'upload (S5)
- C1 🟢 — Rate-limiting sur `login` (S6)
- C2 🟢 — Helper de permission réutilisable HTTP + GraphQL (prérequis A2/A3)
- A3 🟠 — Export sécurisé/cloisonné — **dépend de DÉC-1** (S3)

**Interface — fiabilité opérationnelle** (réf. plan UI I/II/III)
- I1 🟢 M — Refresh token Apollo (`errorLink` + refresh proactif + reconnexion WS) (U21/U22)
- III1 🟢 M — Dashboard : n'interroger que les cellules autorisées + état « accès restreint » (U3)
- II1 🟢 S — Mode clair : `forcedTheme="dark"` + retirer le bouton — **ou** II2 si DÉC-UI-1 = achever (U1/U2)

### 🟠 P1 — Avant mise en production réelle

**Sécurité** (réf. C/D/E)
- C3 🟠 — Politique mot de passe (zod) — **dépend de DÉC-3** (S8)
- C4 🟢 — Anti-timing login + journalisation des échecs (S7)
- C5 🟢 — Épinglage algorithme JWT (S11)
- D1 🔵 — TLS + HSTS + CSP (corrige aussi le bug cookie `Secure`) (S12)
- D2 🔵 — Conteneur non-root (`USER node`) (S13)
- D3 🟢 — `trust proxy` (IP réelle dans l'audit) (S15)
- D4 🟢 — Introspection GraphQL off en prod + depth-limit + timeout (S10)
- D5 🟢 — `helmet` + limite de taille du body (S10)
- E1/E2 🟢 — Journaliser échecs auth & refus de permission (A09)
- B3 🟠 — Liste blanche MIME + nom de fichier généré — **arbitrage léger des formats** (S5)
- F6 🔴 — Index DB (`@@index` sur FK + `AuditLog.createdAt` + `deletedAt`) + migration — perf/scalabilité (Q7)
- F7 🟠 — Corriger le `.gitignore` pour versionner les `migration.sql` — sinon `prisma migrate deploy` cassé en CI/prod (Q8)

**Interface** (réf. III/IV/V/VI)
- III2 🟢 M — Garde RBAC de route + écran « Accès refusé » (U5)
- III4 🟢 S — Main courante : tri cohérent → « Dernière entrée » & historique corrects (U30)
- III5 🟢 M — Filtre « bibliothèque globale uniquement » → l'onglet global ne fuit plus les docs d'incident (U31)
- VII5 🟢 M — Cycle de vie incident : UI changement de statut / clôture / édition / suppression (brancher `updateIncident`/`deleteIncident`) (U36)
- III3 🟠 S — Bouton export gardé par permission — **dépend de DÉC-1** (U4)
- IV1 🟢 S — Monter `<Toaster>` (sonner) (U14)
- IV2 🟢 M — `try/catch` + toasts sur toutes les mutations destructives (U9)
- IV3 🟢 M — Remplacer `confirm()`/`alert()` par `AlertDialog` shadcn (U13)
- V1 🟢 M — Migrer les modales maison vers `Dialog` shadcn (a11y) (U12)
- VI4 🟢 S — Réhydrater `currentIncident` sur Annuaire/Administration (U26)
- VI6 🟠 S — Unifier `BIBLIOTHEQUE`/`DOCUMENTS` (1 seule ressource) + corriger le seed → Cellule Dir/Ops voient le menu Bibliothèque (U29)

### 🟡 P2 — Durcissement, dette & finitions

**Sécurité**
- C6 🔵 — Hash des refresh tokens + détection de rejeu (S14)
- B4 🔵 — `multer 1.x → 2.x` + `npm audit` (S17)
- F1 🟢 — Validation d'entrée centralisée (zod) (Q3)
- F2 🟢 — Middleware `requireAuth` partagé + retrait des `if (!ctx.userId)` redondants (Q2/Q5)
- F3 🟢 — Suite de tests RBAC (acceptation + refus par ressource×action) (S20/Q4)
- F4 🟢 — Validation zod des variables d'env (Q6)
- F5 🟢 — Correction numérotation pages PDF (S19)

**Interface**
- V2 🟢 S — Grilles responsives uniformisées (U11)
- V3 🟢 M — Passe accessibilité (`aria-label`, contrastes, `scope`) (U19)
- V4 🟢 S — Skeletons sur listes/tableaux (U17)
- VI2 🟢 S — Retirer la prop morte `onClearFilter` (U6)
- VI3 🟢 S — Harmoniser terminologie Bibliothèque/Documents (U8)
- VI5 🟡 S — Renseigner/afficher l'acteur des événements timeline (U27)
- VI7 🟡 S — `CARTOGRAPHIE` : retirer de l'enum/seed/matrice **ou** implémenter la page (cf. évolution 1.10) (U28)
- VI8 🟠 M — Annuaire contacts d'incident : implémenter **ou** retirer le backend inutilisé + fixer commentaire `getContacts` (U32/U33)
- VI9 🟢 S — `deleteTag` : détacher en transaction / message clair (U34)
- VI10 🟢 S — `createTimelineEvent` : `actorId = userId` + afficher l'auteur (U35/U27)
- VI11 🟢 S — Config dev : chemin `/api/graphql` ou proxy Vite (U37)
- VII6 🟢 S — Exposer l'édition d'un événement timeline (U38)
- VI12/VI13/VI14 🟢/🟡 S — Subscriptions incident non consommées (U39) · code mort + `noUnusedLocals` (U40/U6) · `createdBy` non-null + divers StrictMode/favicon (U41/U42)
- VII1 🟢 M — Validation formulaire client (react-hook-form + zod) (U16)
- VII2 🟠 M — Écran « Mon compte » + changement mot de passe self-service — **lié DÉC-3** (U23)
- VII3 🟢 S — Filtre actifs/clos du sélecteur d'incidents (U20)
- VII4 🟢 S — Debounce des recherches/filtres (U18)

---

## 3. Ordre d'exécution recommandé

1. **Session « Décisions »** — trancher DÉC-1 à DÉC-UI-2 (≈ 1 h).
2. **Sprint P0-a (sans décision)** — A1, A2, A4, A5, B1, B2, C1, C2 · I1, III1, II1. *Meilleur point de départ : I1 + III1 + A1 (impact max, zéro régression).*
3. **Sprint P0-b (post-décisions)** — A3, B3, C3, II2 (si retenu), III3.
4. **Sprint P1** — reste du durcissement sécurité (C4-C5, D1-D5, E) + UI (III2, IV*, V1, VI4).
5. **Sprint P2** — dette, tests, accessibilité, fonctionnalités (C6, B4, F*, V2-V4, VI*, VII*).

**Jalons de vérification** (rejouer après chaque sprint) :
- Après P0-a : un **Observateur** ne peut plus éditer la main courante, ni voir un Dashboard mensonger, ni rester bloqué 15 min sans refresh ; brute-force limité.
- Après P0-b : plus de fuite inter-cellules à l'export, plus de path traversal, mots de passe faibles rejetés.
- Après P1 : RBAC de route effectif (`/admin` → écran « Accès refusé »), TLS/HSTS/CSP en place, feedback utilisateur unifié (toasts).
- Après P2 : couverture de tests RBAC ≥ 90 %, passe a11y validée.

---

## 4. Sprint P2 — avancement (2026-06-08)

### ✅ Livré et vérifié
- **VI7** — CARTOGRAPHIE retiré (enum Prisma, seed, matrice admin) + migration `drop_cartographie_incident_contact`.
- **VI8** — `IncidentContact` retiré (modèle, service, resolver, typeDefs, front) + colonne `Contact.isGlobal` supprimée.
- **F2** — helper `requireAuth(ctx)` ; 21 `if (!ctx.userId)` redondants supprimés.
- **F1** — schémas zod centralisés (`utils/validation.ts` + `validate()`) sur toutes les mutations (incident, contact, logEntry, timeline, tag). Vérifié : « Email invalide », « Le prénom est requis », « Le contenu est requis » → `BAD_USER_INPUT`.
- **F4** — validation zod des variables d'env (`utils/env.ts`). Vérifié : URL invalide → exit 1.
- **F5** — pagination PDF corrigée. Vérifié : « Page 1/2 » + « Page 2/2 » sur PDF multi-pages.
- **VI9** — `deleteTag` transactionnel (détache `LogEntryTag` puis supprime). Vérifié : suppression avec association OK, entrée conservée.
- **VI3** — terminologie « Bibliothèque » harmonisée.
- **VII3** — filtre Actifs/Clos/Tous dans le sélecteur d'incidents.
- **VII4** — hook `useDebounce` sur recherches Annuaire + Bibliothèque.
- **VII6** — modale réutilisable `EventModal` (création/édition) + bouton éditer par ligne, câblage `updateTimelineEvent`.
- **V4** — skeletons de chargement (composant `Skeleton`) sur Timeline et Annuaire.
- **V2** — grilles de modale responsives (`grid-cols-1 sm:grid-cols-2`).
- **VII1** — migration react-hook-form + zod des **5 formulaires** (Login, IncidentSelector, ContactModal, EventModal, UserModal) ; schémas centralisés dans `src/lib/formSchemas.ts` ; ajout `zod` + `@hookform/resolvers`. Vérifié : build tsc OK + rendu live.
- **Bonus** — correction de 2 bugs de build P1 révélés par le `tsc` de prod (plugin Apollo inexistant → `introspection: !IS_PROD` ; types `graphql-depth-limit`).

> **Note** : VI2 (`onClearFilter`) était en réalité utilisé → aucun changement.

- **V3** — passe a11y : `scope="col"` sur tous les `<th>`, `aria-label` boutons icône/fermeture/filtres, `aria-pressed` toggles, `role="status"` skeletons, `aria-live="polite"` tableaux de résultats, `aria-label` inputs de recherche. Vérifié : tsc OK.

### ⏳ Reste (sprint dédié)
- **F3** — suite de tests RBAC (sprint test dédié, décision utilisateur).
- **VII2** — écran « Mon compte » self-service (reporté sur décision utilisateur).

### Reporté
- **VII2** — écran « Mon compte » self-service (décision utilisateur).
