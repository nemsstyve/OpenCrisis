# Audit de l'interface (UI/UX) — OpenCrisis

> Date : 2026-05-31 · Périmètre : `01-frontend/src` (pages, layout, composants applicatifs, routing, état, types)
> Hors périmètre : `components/ui/*` (shadcn, non modifiés) · sécurité serveur (voir [07-audit-securite.md](07-audit-securite.md))
> Type : revue de code statique de l'intégralité du frontend

---

## 1. Synthèse

L'interface est **cohérente visuellement, soignée et déjà fonctionnelle** : thème sombre homogène, gating des actions par `hasPermission`, mises à jour temps réel (subscriptions), gestion des états de chargement, mises à jour optimistes du cache Apollo. Le niveau est bon.

Trois problèmes ont toutefois un **impact opérationnel réel** pour un outil de gestion de crise utilisé plusieurs heures d'affilée :
1. **Le token d'accès (15 min) n'est jamais rafraîchi tant que l'onglet reste ouvert** → l'application cesse silencieusement de fonctionner au bout de 15 min, jusqu'au rechargement complet (U21).
2. **Le mode clair est cassé** sur toutes les pages de contenu alors qu'un bouton de bascule existe (U1).
3. **Le tableau de bord masque les erreurs de permission** et affiche « 0 entrée » au lieu de « accès restreint » (U3).

| Sévérité | Nombre | Thème dominant |
|---|---|---|
| 🔴 Élevé | 4 | Fiabilité de session, thème, données trompeuses |
| 🟠 Moyen | 9 | Cohérence, design system, accessibilité |
| 🟡 Faible | 8 | Polish, idées d'amélioration |

---

## 2. Constats détaillés

### 🔴 U21 — Le token d'accès n'est jamais rafraîchi en cours de session
**Fichiers** : [`lib/apolloClient.ts`](../01-frontend/src/lib/apolloClient.ts), [`context/AuthContext.tsx`](../01-frontend/src/context/AuthContext.tsx)

Le `tokenStore` n'est alimenté qu'au **login** et à la **restauration de session au chargement de page**. L'access token JWT expire en **15 min** ([services/auth.ts](../02-backend/src/services/auth.ts)). Apollo n'a **pas de lien d'erreur** (`onError`) pour intercepter un `UNAUTHENTICATED` et appeler `refreshToken` avant de réessayer.

**Impact** — Après 15 min d'onglet ouvert, **toutes les requêtes/mutations échouent** silencieusement (et les subscriptions se coupent, U22) jusqu'à un rechargement manuel. Pour une cellule de crise qui garde l'outil ouvert des heures, c'est un défaut de fiabilité majeur : on perd la saisie en cours sans message clair.

**Correctif** — Ajouter un `errorLink` (`@apollo/client/link/error`) qui, sur `UNAUTHENTICATED`, déclenche `refreshToken`, met à jour `tokenStore` et rejoue l'opération ; idéalement un refresh proactif (minuteur à ~13 min). Reconnecter le WS avec le nouveau token.

### 🔴 U1 — Mode clair cassé sur toutes les pages de contenu
**Fichiers** : toutes les `pages/*`, [`providers/ThemeProvider.tsx`](../01-frontend/src/app/providers/ThemeProvider.tsx)

`ThemeProvider` est configuré `defaultTheme="dark"` **+ `enableSystem`**, et la Sidebar propose un bouton clair/sombre. Or l'ossature ([`RootLayout`](../01-frontend/src/app/layouts/RootLayout.tsx), Sidebar, ErrorBoundary, NotFound) gère les variantes `dark:` **mais aucune page de contenu ne le fait** : elles codent en dur `bg-[#0f1116]`, `bg-[#13151a]`, `text-white`, etc.

**Impact** — Basculer en mode clair ne change que la coquille ; le contenu reste sombre, et certains textes blancs deviennent illisibles. Pour un utilisateur dont l'OS est en clair (`enableSystem`), le premier rendu est déjà incohérent. **Fonctionnalité à moitié implémentée.**

**Correctif** — Soit finaliser le thème clair (passer les pages en tokens sémantiques `bg-background`/`text-foreground` déjà définis par shadcn dans [`theme.css`](../01-frontend/src/styles/theme.css)), soit **retirer le bouton** et forcer le thème sombre (`forcedTheme="dark"`). Recommandé : la 2ᵉ option à court terme, la 1ʳᵉ à moyen terme.

### 🔴 U2 — Nom de l'incident invisible en thème clair (Sidebar)
**Fichier** : [`components/Sidebar.tsx`](../01-frontend/src/app/components/Sidebar.tsx) (ligne 104)

`<p className="text-xs text-white …">{incidentName}</p>` — couleur **blanche figée** sans variante. Sur la Sidebar blanche du mode clair, le nom de l'incident est invisible. Cas concret de U1 mais présent même dans la coquille qui, elle, gère le clair.

### 🔴 U3 — Le Dashboard masque les erreurs de permission (données trompeuses)
**Fichier** : [`pages/Dashboard.tsx`](../01-frontend/src/app/pages/Dashboard.tsx) (l.141-155)

Le Dashboard interroge **toujours** les deux cellules (`DIRECTIONAL` et `OPERATIONAL`). Un utilisateur n'ayant qu'une cellule (Cellule Opérationnelle, Cellule Directionnelle, Observateur) reçoit un `FORBIDDEN` sur l'autre cellule — **erreur ignorée** (`?? []`). Résultat : la statistique affiche « 0 entrée direction » et le widget contributeurs affiche « Aucune entrée », alors qu'il s'agit d'un **manque de droits**, pas d'une absence de données.

**Impact** — Information mensongère sur un écran décisionnel de crise. S'aggravera après le durcissement RBAC backend.

**Correctif** — N'interroger que les cellules autorisées (`hasPermission`), et afficher un état « accès restreint » distinct de « aucune donnée ».

### 🟠 U4 — Bouton « Exporter PDF » non gardé et fuite inter-cellules (côté UI)
**Fichiers** : [`MainCouranteDirection.tsx`](../01-frontend/src/app/pages/MainCouranteDirection.tsx) (l.368), [`MainCouranteOperationnelle.tsx`](../01-frontend/src/app/pages/MainCouranteOperationnelle.tsx) (l.359)

Le bouton d'export est rendu **inconditionnellement** (hors `canWrite`, sans contrôle de permission). Aujourd'hui, l'export de la page Opérationnelle produit un PDF **contenant aussi les entrées Direction** (pendant UI de la faille serveur S3). Après le correctif backend A3, ce bouton renverra une erreur `alert()` pour les utilisateurs mono-cellule.

**Correctif** — Aligner sur la décision DÉC-1 du plan sécurité (export cloisonné) et garder le bouton selon la permission réelle.

### 🟠 U5 — Aucune protection RBAC au niveau des routes
**Fichier** : [`app/routes.ts`](../01-frontend/src/app/routes.ts)

La Sidebar masque les liens par permission, mais les **routes ne sont pas gardées**. En tapant/bookmarkant `/incidents/:id/admin` (ou toute autre page), un utilisateur non autorisé **monte le composant** ; les requêtes GraphQL renvoient `FORBIDDEN` et la page affiche le **message d'erreur brut** (`error.message`) au lieu d'un écran « Accès refusé » propre.

**Correctif** — Introduire un garde de route par permission (composant `RequirePermission` enveloppant, ou `loader` qui vérifie). Défense en profondeur + UX cohérente.

### 🟠 U9 — Échecs de suppression silencieux (pas de retour utilisateur)
**Fichiers** : `MainCourante*`, [`Bibliotheque.tsx`](../01-frontend/src/app/pages/Bibliotheque.tsx) (l.404), [`Annuaire.tsx`](../01-frontend/src/app/pages/Annuaire.tsx)

Plusieurs handlers de suppression appellent la mutation **sans `try/catch`** (`handleDelete` Bibliothèque, `onDelete` main courante). En cas d'échec (ex. `FORBIDDEN` après durcissement), la promesse est rejetée sans message : l'élément **reste affiché** sans explication.

**Correctif** — Encapsuler dans `try/catch` + notifier l'utilisateur (voir U14 toasts).

### 🟠 U10 — Double source de types : `generated.ts` (codegen, mort) vs `api.ts` (manuel)
**Fichiers** : [`types/api.ts`](../01-frontend/src/types/api.ts), `types/generated.ts`, [`codegen.yml`](../01-frontend/codegen.yml)

L'application importe **exclusivement** des types maintenus **à la main** dans `api.ts`. Le fichier `generated.ts` produit par codegen **n'est importé nulle part** (vérifié) — il est mort. Cela **contredit la règle projet** (« ne jamais éditer `generated.ts`, toujours `pnpm codegen` ») inscrite dans `CLAUDE.md` et la mémoire.

**Impact** — Risque de **dérive** entre les types manuels et le schéma réel (ex. `GqlUser` manuel n'a ni `isActive` ni `createdAt`, présents côté serveur). Maintenance à double.

**Correctif** — Trancher : (a) **brancher la sortie codegen** dans l'app et supprimer `api.ts`, ou (b) **assumer les types manuels**, supprimer codegen + `generated.ts` et mettre à jour `CLAUDE.md`/mémoire. À décider en session dédiée.

### 🟠 U11 — Grilles de statistiques non responsives
**Fichiers** : `MainCouranteOperationnelle.tsx` (`grid-cols-4`), `MainCouranteDirection.tsx` (`grid-cols-3`)

Ces grilles n'ont **aucune variante responsive**, contrairement au Dashboard (`grid-cols-2 md:grid-cols-4`). Sur petit écran, débordement / écrasement.

**Correctif** — Uniformiser (`grid-cols-2 md:grid-cols-4`).

### 🟠 U12 — Modales maison sans accessibilité ni cohérence
**Fichiers** : modales de `IncidentSelector`, `Annuaire`, `Bibliotheque`, `Timeline`, `Administration`

Toutes les modales sont des `div fixed inset-0` faites main : **pas de focus trap, pas de fermeture par `Esc`, pas de `role="dialog"`/`aria-modal`, pas de restauration du focus**, fermeture au clic-fond incohérente. Le composant shadcn [`dialog.tsx`](../01-frontend/src/app/components/ui/dialog.tsx) existe mais n'est pas utilisé.

**Correctif** — Migrer vers `Dialog` shadcn (a11y + cohérence gratuites).

### 🟠 U13 — `confirm()` / `alert()` natifs pour des actions critiques
Suppressions via `window.confirm`, erreurs d'export via `window.alert`. Bloquant, non stylé, incohérent avec l'UI sombre. `alert-dialog.tsx` (shadcn) disponible et inutilisé.

### 🟠 U14 — Pas de système de notifications (toasts)
[`sonner.tsx`](../01-frontend/src/app/components/ui/sonner.tsx) est présent mais **aucun `<Toaster>` monté**, aucun toast émis. Le retour d'action est inégal : certaines pages affichent une bannière, d'autres avalent l'erreur (U3, U9). Un système de toasts unifierait succès/erreur (upload, suppression, permission refusée).

### 🟠 U8 — Dérive de nommage Bibliothèque / Documents
**Fichier** : `Bibliotheque.tsx`

Libellé Sidebar = « Bibliothèque », titre de page H1 = « Documents », permission de navigation = `BIBLIOTHEQUE`, mais `canWrite = BIBLIOTHEQUE || DOCUMENTS`. Trois noms pour un même concept → confusion. Harmoniser la terminologie.

### 🟡 Constats faibles / idées d'amélioration

- **U6 — Prop morte** : `onClearFilter` passé à `DocumentTable` mais jamais appelé ([Bibliotheque.tsx](../01-frontend/src/app/pages/Bibliotheque.tsx) l.173). À retirer.
- **U16 — Validation formulaire côté client absente** : on s'appuie sur `required` + `type=email`. Le mot de passe affiche « Min. 8 caractères » sans le vérifier ; IP/téléphone non validés. [`form.tsx`](../01-frontend/src/app/components/ui/form.tsx) (shadcn + react-hook-form) inutilisé. Aligner avec la politique mdp serveur (C3).
- **U17 — Skeletons inutilisés** : seulement des spinners ; [`skeleton.tsx`](../01-frontend/src/app/components/ui/skeleton.tsx) dispo pour un rendu perçu plus fluide.
- **U18 — Recherche/filtres non débouncés** (Annuaire, Bibliothèque, Timeline) : filtrage à chaque frappe sur toute la liste. Sans impact à petite échelle ; à prévoir pour gros volumes.
- **U19 — Accessibilité générale** : boutons icône-only avec `title` mais sans `aria-label` ; contrastes faibles (`text-gray-600` sur fond sombre) ; tables sans `scope` ; vérifier `lang="fr"` dans `index.html`. Cible « opérateurs de crise » → le clavier/lecteur d'écran comptent.
- **U20 — Sélecteur d'incident sans filtre de statut** : tous les incidents non supprimés (y compris `CLOSED`) sont listés sans tri ni filtre → encombrement à terme. Ajouter filtre/onglet « actifs / clos ».
- **U22 — Subscriptions WS non rafraîchies** (lié à U21) : `connectionParams` lit le token à la connexion ; sans refresh, reconnexion avec token expiré.
- **U23 — Pas de profil utilisateur ni changement de mot de passe self-service** : seul l'admin peut réinitialiser. Ajouter un écran « Mon compte » (cohérent avec C3/DÉC-3 du plan sécurité).
- **U25 — Frise du Dashboard non proportionnelle au temps** : les points sont espacés uniformément (`flex 1 1 0`), pas selon l'horodatage réel ; acceptable mais le terme « frise chronologique » suggère une échelle temporelle.
- **U26 🟠 — Sidebar affiche l'UUID brut de l'incident sur certaines pages** *(découvert en test live)* : les pages qui **n'appellent pas `useCurrentIncident()`** — [`Annuaire.tsx`](../01-frontend/src/app/pages/Annuaire.tsx) et [`Administration.tsx`](../01-frontend/src/app/pages/Administration.tsx) — ne réhydratent pas le store `currentIncident`. Après un accès direct ou un rafraîchissement sur ces pages, la Sidebar affiche `c3bdb5e6-a745-…` au lieu de « Ransomware Prod ». Les autres pages (Dashboard, Main courante, Timeline, Bibliothèque) sont correctes. **Correctif** : appeler `useCurrentIncident()` dans ces pages, ou hydrater l'incident au niveau du `RootLayout`.
- **U27 🟡 — Acteur (créateur) des événements timeline non renseigné** *(observé en test live)* : un événement créé n'affiche aucun acteur (sous-ligne bleue), idem pour les données existantes. Le champ `actorId` ne semble pas positionné à la création → traçabilité de l'auteur d'un événement absente côté UI.
- **U28 🟡 — Permission `CARTOGRAPHIE` morte** : la ressource existe dans l'enum `PermissionResource`, le seed l'attribue à la Cellule Opérationnelle (+ Pilote/Admin) et elle apparaît dans la matrice de l'Administration, **mais aucune route/page/resolver/menu ne l'utilise**. Un utilisateur qui la possède n'a nulle part où aller. À implémenter (cf. proposition 1.10) ou à retirer de l'enum/seed.
- **U30 🟠 — Main courante : tri incohérent + « Dernière entrée » erronée** : `getLogEntries` trie `createdAt: 'asc'` (plus ancien d'abord), mais l'UI **préfixe** les nouvelles entrées et lit `entries[0]` comme « Dernière entrée ». Au chargement, `entries[0]` est donc la **plus ancienne** (confirmé en test live : « Dernière entrée 30/05 19:09 » alors qu'une entrée 31/05 00:10 existait). L'historique mélange aussi les ordres (base ascendante + nouveautés en tête). **Correctif** : trier `desc` côté backend (ou re-trier côté client comme le fait Timeline) pour un ordre cohérent et un `entries[0]` = réellement la dernière. Affecte les deux pages Main courante.
- **U31 🟠 — « Bibliothèque globale » affiche tous les documents** : `getDocuments(incidentId?)` n'applique aucun filtre quand `incidentId` est absent ([`document.ts`](../02-backend/src/services/document.ts)) → l'onglet « globale » (`variables: {}`) renvoie **tous** les documents, y compris ceux d'un incident, qui apparaissent donc **dans les deux onglets**. Aucun chemin « incidentId IS NULL ». **Correctif** : exposer un filtre explicite « globaux uniquement » (ex. argument `scope: GLOBAL|INCIDENT` ou `where incidentId null`).
- **U32 🟠 — Annuaire : fonctionnalité « contacts d'incident » inutilisée** : le backend gère contacts globaux et spécifiques (`isGlobal=false`, `linkContactToIncident`/`unlink`), mais [`Annuaire.tsx`](../01-frontend/src/app/pages/Annuaire.tsx) interroge `contacts` **sans `incidentId`** (globaux seulement), crée toujours `isGlobal: true`, et n'utilise jamais `LINK_CONTACT_MUTATION`. Tout le pan « contacts rattachés à l'incident » est inaccessible. **Correctif** : décider — soit implémenter (onglet global/incident comme la Bibliothèque), soit retirer les capacités backend inutilisées.
- **U33 🟡 — `getContacts` : commentaire ≠ code** : le commentaire annonce « contacts liés + globaux » mais le code ne retourne que les **liés** ([`contact.ts`](../02-backend/src/services/contact.ts)). Bug latent si le chemin `incidentId` était utilisé (lié à U32).
- **U34 🟡 — Suppression d'un tag utilisé échoue sans message clair** : `deleteTag` fait un `delete` brut ; si le tag est rattaché à des entrées (`LogEntryTag`, sans cascade), Prisma lève une violation FK non gérée → erreur générique. **Correctif** : détacher d'abord (`logEntryTag.deleteMany`) en transaction, ou message explicite.
- **U35 🟡 — Acteur des événements timeline jamais enregistré** *(cause racine de U27)* : `createTimelineEvent` ne positionne pas `actorId` à partir du `userId` créateur (le formulaire ne l'envoie pas ; `userId` ne sert qu'au log d'audit). Les événements n'ont aucun auteur en base. **Correctif** : `actorId = userId` à la création + affichage.

### Constats de la passe « fichier par fichier » (2026-06)

- **U36 🟠 — Cycle de vie de l'incident absent de l'UI** : le backend expose `updateIncident` (statut ACTIVE→CONTAINED→CLOSED, `resolvedAt`, sévérité) et `deleteIncident`, **mais aucune requête frontend ne les appelle** ([`graphql/incident.ts`](../01-frontend/src/graphql/incident.ts) n'a que query+query+create). Conséquence : **impossible de changer le statut, de clôturer ou de supprimer un incident depuis l'interface** — une crise reste `ACTIVE` à vie, le badge de statut du Dashboard est en lecture seule. Manque fonctionnel majeur pour un outil de crise. **Correctif** : ajouter les mutations + contrôles UI (changement de statut, clôture, édition), gardés par `DASHBOARD:WRITE`/`ADMIN:WRITE`.
- **U37 🟠 — Config de dev cassée (chemin API)** : [`.env.development`](../01-frontend/.env.development) pointe vers `http://localhost:4000/graphql` et `ws://localhost:4000/graphql`, alors que le backend sert **`/api/graphql`** ([`server.ts`](../02-backend/src/server.ts)). De plus, aucun proxy n'est défini dans [`vite.config.ts`](../01-frontend/vite.config.ts). → `pnpm dev` (hors Docker) **ne joint pas l'API**. **Correctif** : corriger le chemin (`/api/graphql`) ou ajouter un proxy Vite `/api` → `:4000`.
- **U38 🟡 — Édition d'un événement timeline non exposée** : `updateTimelineEvent` + `UPDATE_TIMELINE_EVENT_MUTATION` existent mais ne sont jamais importés ; l'UI ne permet que créer/supprimer un événement.
- **U39 🟡 — Subscriptions incident non consommées** : `incidentCreated` et `incidentStatusChanged` sont définies (schéma + resolvers + pubsub) mais le frontend (IncidentSelector/Dashboard) **ne s'y abonne pas** → la liste d'incidents et le statut ne sont pas temps réel.
- **U40 🟡 — Code mort / exports inutilisés** : `ME_QUERY`, `LINK_CONTACT_MUTATION`, `UPDATE_TIMELINE_EVENT_MUTATION` exportés mais jamais importés ; `types/generated.ts` (sortie codegen) inutilisé (cf. U10). Non détecté car **`tsconfig` n'active pas `noUnusedLocals`/`noUnusedParameters`**. **Correctif** : activer ces options + purger.
- **U41 🟡 — `Incident.createdBy: User!` non-null fragile** : le resolver fait `prisma.user.findUnique(...)` qui peut renvoyer `null` (créateur supprimé définitivement) → violation de champ non-null → **crash de la requête incident**. Risque faible (soft-delete en place) mais à blinder (`createdBy: User` nullable, ou garantir l'intégrité).
- **U42 🟡 — Divers** : `main.tsx` sans `<StrictMode>` (perd les vérifications React en dev) ; `index.html` sans favicon ni meta description ; over-fetch `metadata` dans `ADMIN_AUDIT_LOGS_QUERY` (non affiché) ; commentaire de `docker-compose.dev.yml` inexact (« nodemon » au lieu de `ts-node-dev`).
- **Note (contexte U1)** — Le thème clair **est déjà défini en tokens sémantiques** dans [`theme.css`](../01-frontend/src/styles/theme.css) (`:root`/`.dark`, `body { bg-background text-foreground }`). Le correctif U1 consiste donc à **migrer les pages des couleurs en dur (`bg-[#0f1116]`…) vers ces tokens** — l'infrastructure existe déjà, ce qui réduit l'effort de la décision DÉC-UI-1 option (b).
- **U29 🟠 — Incohérence `BIBLIOTHEQUE` vs `DOCUMENTS`** : le **menu** « Bibliothèque » est conditionné à `BIBLIOTHEQUE` (jamais vérifié par le backend), tandis que les **données** sont protégées par `DOCUMENTS` (jamais utilisé comme gate de menu). Comme les rôles **Cellule Directionnelle** et **Cellule Opérationnelle** ont `DOCUMENTS` mais **pas** `BIBLIOTHEQUE`, le **menu « Bibliothèque » leur est masqué** alors qu'ils ont accès aux documents (la page fonctionne via l'URL). **Correctif** : unifier sur une seule ressource (`DOCUMENTS`) — gate de menu + canWrite + backend — et corriger le seed ; ou aligner le seed pour donner `BIBLIOTHEQUE` aux rôles concernés. Lié à la dérive de nommage U8.

---

## 3. Plan d'actions — par catégorie

> **Impact** : 🟢 transparent · 🟠 décision requise (session dédiée). **Effort** : S (≤½ j) · M (1-2 j) · L (>2 j).

### Catégorie I — Fiabilité de session · **P0**
1. **I1** 🟢 M — Lien d'erreur Apollo : refresh automatique sur `UNAUTHENTICATED` + rejeu de l'opération ; refresh proactif (~13 min) ; reconnexion WS avec le nouveau token (U21, U22).

### Catégorie II — Thème · **P0**
2. **II1** 🟢 S — Court terme : `forcedTheme="dark"` + retirer le bouton clair/sombre de la Sidebar (U1, U2).
3. **II2** 🟠 L — Moyen terme (alternative à II1) : finaliser le thème clair via tokens sémantiques shadcn sur toutes les pages. **Décision : abandonner le mode clair ou l'achever ?**

### Catégorie III — Cohérence des données & accès · **P0/P1**
4. **III1** 🟢 M *(P0)* — Dashboard : n'interroger que les cellules autorisées + état « accès restreint » distinct (U3).
5. **III2** 🟢 M *(P1)* — Garde RBAC de route + page « Accès refusé » propre (U5).
6. **III3** 🟠 S *(P1)* — Aligner le bouton d'export sur la décision DÉC-1 (cloisonnement) et le garder par permission (U4).

### Catégorie IV — Retour utilisateur (feedback) · **P1**
7. **IV1** 🟢 S — Monter `<Toaster>` (sonner) à la racine (U14).
8. **IV2** 🟢 M — Encapsuler toutes les mutations destructives en `try/catch` + toast succès/erreur (U9).
9. **IV3** 🟢 M — Remplacer `confirm()`/`alert()` par `AlertDialog` shadcn (U13).

### Catégorie V — Design system & accessibilité · **P1/P2**
10. **V1** 🟢 M *(P1)* — Migrer les modales maison vers `Dialog` shadcn (focus trap, `Esc`, ARIA) (U12).
11. **V2** 🟢 S *(P2)* — Uniformiser les grilles responsives (U11).
12. **V3** 🟢 M *(P2)* — Passe accessibilité : `aria-label` sur boutons-icônes, contrastes, `scope` de tables, `lang="fr"` (U19).
13. **V4** 🟢 S *(P2)* — Skeletons sur les listes/tableaux (U17).

### Catégorie VI — Cohérence & dette · **P2**
14. **VI1** 🟠 M — Trancher la **source de types** : brancher codegen OU assumer les types manuels (+ MAJ `CLAUDE.md`/mémoire) (U10). **Décision requise.**
15. **VI2** 🟢 S — Retirer la prop morte `onClearFilter` (U6).
16. **VI3** 🟢 S — Harmoniser la terminologie Bibliothèque/Documents (U8).
17. **VI4** 🟢 S *(P1)* — Réhydrater `currentIncident` sur Annuaire/Administration (ou au niveau `RootLayout`) pour éviter l'affichage de l'UUID dans la Sidebar (U26).
18. **VI5** 🟡 S — Renseigner/afficher l'acteur des événements timeline (U27).
19. **VI6** 🟠 S *(P1)* — Résoudre l'incohérence `BIBLIOTHEQUE`/`DOCUMENTS` : unifier sur une seule ressource (gate de menu + canWrite + backend) et corriger le seed pour que Cellule Dir/Ops voient le menu (U29).
20. **VI7** 🟡 S — Permission `CARTOGRAPHIE` : la retirer de l'enum/seed/matrice **ou** l'implémenter (cf. proposition 1.10) (U28).
21. **III4** 🟢 S *(P1)* — Main courante : tri cohérent (backend `desc` ou re-tri client) → corrige « Dernière entrée » et l'ordre de l'historique (U30).
22. **III5** 🟢 M *(P1)* — Filtre « bibliothèque globale uniquement » (scope GLOBAL/INCIDENT) → l'onglet global ne montre plus les docs d'incident (U31).
23. **VI8** 🟠 M *(P2)* — Annuaire : implémenter les contacts d'incident (onglet global/incident) **ou** retirer les capacités backend inutilisées + corriger le commentaire de `getContacts` (U32/U33).
24. **VI9** 🟢 S *(P2)* — `deleteTag` : détacher en transaction ou message clair si tag utilisé (U34).
25. **VI10** 🟢 S *(P2)* — `createTimelineEvent` : enregistrer `actorId = userId` + afficher l'auteur (U35/U27).
26. **VII5** 🟢 M *(P1)* — Cycle de vie de l'incident : UI de changement de statut (ACTIVE/CONTAINED/CLOSED), clôture (`resolvedAt`), édition, suppression — brancher `updateIncident`/`deleteIncident` (U36).
27. **VI11** 🟢 S *(P2)* — Corriger la config de dev : chemin `/api/graphql` dans `.env.development` **ou** proxy Vite `/api`→`:4000` (U37).
28. **VII6** 🟢 S *(P2)* — Exposer l'édition d'un événement timeline (`updateTimelineEvent`) (U38).
29. **VI12** 🟡 S *(P2)* — Brancher les subscriptions `incidentCreated`/`incidentStatusChanged` (liste & statut temps réel) **ou** les retirer si non souhaitées (U39).
30. **VI13** 🟢 S *(P2)* — Activer `noUnusedLocals`/`noUnusedParameters` + purger le code mort (`ME_QUERY`, `LINK_CONTACT_MUTATION`, `UPDATE_TIMELINE_EVENT_MUTATION`, `generated.ts`, `onClearFilter`) (U40/U6).
31. **VI14** 🟡 S *(P2)* — Blinder `Incident.createdBy` (nullable ou intégrité garantie) (U41) ; divers `main.tsx` StrictMode, favicon, commentaires (U42).

### Catégorie VII — Fonctionnalités & idées · **P2**
17. **VII1** 🟢 M — Validation de formulaire côté client (react-hook-form + zod), alignée sur la politique mdp serveur (U16).
18. **VII2** 🟢 M — Écran « Mon compte » + changement de mot de passe self-service (U23, lié DÉC-3).
19. **VII3** 🟢 S — Filtre actifs/clos dans le sélecteur d'incident (U20).
20. **VII4** 🟢 S — Debounce des recherches/filtres (U18).

---

## 4. Feuille de route suggérée

| Lot | Contenu | Objectif |
|---|---|---|
| **Lot UI-0 — Fiabilité (P0)** | I1, II1, III1 | Stopper les défauts opérationnels : session qui tombe, thème cassé, données trompeuses |
| **Lot UI-1 — Cohérence & feedback (P1)** | III2, III3, IV1-IV3, V1 | RBAC de route, toasts, modales accessibles |
| **Lot UI-2 — Polish & a11y (P2)** | V2-V4, VI2, VI3, VII3, VII4 | Responsive, accessibilité, dette légère |
| **Session « Décisions »** | II2 (mode clair), VI1 (source de types), III3 (cloisonnement export, = DÉC-1) | Arbitrages structurants |
| **Lot UI-3 — Fonctionnalités (P2)** | VII1, VII2 | Validation client, compte self-service |

**Décisions à trancher en session dédiée** (regroupées avec celles du plan sécurité) :
- **DÉC-UI-1** — Mode clair : l'achever (II2) ou l'abandonner (II1) ?
- **DÉC-UI-2** — Source de types : codegen branché ou types manuels assumés (VI1) ?
- Rappel : **DÉC-1** (cloisonnement export) du plan sécurité conditionne aussi III3 côté UI.

> Note : I1 (refresh token) et III1 (Dashboard) sont indépendants de toute décision et constituent le meilleur point de départ.

---

## 5. Annexe — Test fonctionnel en conditions réelles (navigateur)

Réalisé le 2026-05-31 sur l'instance Docker (`http://localhost`), via pilotage Chrome, en tant qu'**Administrateur** puis en tant qu'**Observateur** (compte de test créé puis nettoyé).

### Fonctionnalités validées ✅
- **Authentification & session** : login, restauration automatique de session via cookie refresh (multi-onglets), `logout`, redirection `/login`↔`/incidents`.
- **Sélecteur d'incident** : liste, sélection, **gating RBAC du bouton « Déclarer un incident »** (masqué pour l'Observateur).
- **Dashboard** : stats, frise chronologique, widgets contributeurs (pour un compte ayant les droits).
- **Main courante (Direction)** : création d'entrée + tag à la volée, **édition** (marqueur « modifié »), **suppression**, filtres par tag — tout fonctionne.
- **Timeline** : rendu, **création d'événement** (modale, date pré-remplie), compteur mis à jour.
- **Annuaire / Bibliothèque / Administration** : rendu correct, CRUD utilisateur (création du compte de test OK), onglets, pagination.
- **Navigation RBAC** : la Sidebar masque correctement les entrées non autorisées (Observateur ne voit ni Main courante, ni Annuaire, ni Administration).

### Défauts **confirmés en production** 🔴/🟠
- **U1** — Bascule « Mode clair » : seul le libellé du bouton change, **l'UI reste intégralement sombre**.
- **U3** — En tant qu'Observateur, le Dashboard affiche **« Entrées direction : 0 / opérationnelles : 0 / Contributeurs : 0 » et « Aucune entrée »** alors que l'incident contient 2 entrées de direction → **donnée mensongère** (erreurs de permission masquées).
- **U5** — Accès direct à `/admin` en tant qu'Observateur : **toute la page Administration se monte** (onglets + bouton « + Ajouter » cliquable), avec seulement un texte rouge « Permission refusée » et « 0 utilisateur ». Pas d'écran « Accès refusé ».
- **U13** — La suppression d'une entrée déclenche un `confirm()` natif qui a **gelé le rendu ~30 s** (timeout CDP) en pilotage automatisé — illustration concrète du caractère bloquant des dialogues natifs.
- **U26** *(nouveau)* — Sur l'Annuaire et l'Administration, la Sidebar affiche **l'UUID brut** de l'incident au lieu de son nom (store non réhydraté).

> Données de test créées pendant l'audit (entrée de main courante, événement timeline, compte « Test Observateur ») : **nettoyées** à l'issue du test.
