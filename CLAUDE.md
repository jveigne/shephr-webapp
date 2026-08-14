# CLAUDE.md — shephr-webapp

## Vue d'ensemble

**Back-office JExcellence** : console d'administration **cross-tenant réservée au `SUPER_ADMIN`** de la plateforme. Elle gère *les ministères eux-mêmes* (onboarding, structure, comptes, abonnements, facturation, audit) — **pas** leur vie quotidienne (dons, objectifs, suivi pastoral), qui est le domaine de `shephr-app`.

- **React 18** · **Vite 5** (`@vitejs/plugin-react-swc`) · **TypeScript 5.5** · ESM
- **@tanstack/react-query 5** — toute donnée serveur (aucun state global maison)
- **react-router-dom 6** · **react-i18next 17** (FR + EN, FR par défaut)
- **`fetch` natif** via `services/api.ts` (⚠ pas d'axios ici — contrairement à `shephr-app`)
- **Aucune librairie UI ni CSS framework** : primitives maison (`components/primitives.tsx`) + un seul fichier de design tokens (`src/index.css`, ~900 lignes)
- Déploiement **Vercel** (SPA rewrite dans `vercel.json`)

### Les trois dépôts de l'écosystème

| Dépôt | Rôle | Audience |
|---|---|---|
| `cmfipraise-backend` | API Spring Boot 3.2 / Java 17, multi-tenant par `Ministry` | — |
| `shephr-app` | monorepo `web/` (espace ministère) + `mobile/` (Expo) | dirigeants & membres **d'un** ministère |
| **`shephr-webapp`** (ici) | back-office plateforme, cross-tenant | **SUPER_ADMIN JExcellence uniquement** |

> Tout changement de contrat API dans `cmfipraise-backend` peut impacter **les deux** frontends. Vérifier lequel consomme l'endpoint avant de le modifier.

---

## Structure

```
src/
├── main.tsx                  Bootstrap (import i18n + index.css)
├── App.tsx                   Routes + QueryClientProvider + Toast/Auth providers
├── index.css                 TOUT le design system (tokens + ~82 classes)
├── components/
│   ├── AppShell.tsx          Sidebar + <main> + ToastHost
│   ├── Sidebar.tsx           NAV en constante (4 sections) + switch FR/EN + footer user
│   ├── ProtectedRoute.tsx    Garde : authentifié ET `user.superAdmin` — sinon /login
│   ├── ErrorBoundary.tsx     Remonté par `key={pathname}` dans App.tsx
│   ├── primitives.tsx        Button, IconButton, Field, Input, Select, Toggle, Checkbox,
│   │                         Badge/RoleBadge/StatusBadge/UnitTypeBadge, Modal, Drawer,
│   │                         ToastHost, Table, Pagination, Crumbs, TopBar
│   ├── charts.tsx            AreaChart, HorizontalBars, Spark (SVG maison, zéro dépendance)
│   ├── icons.tsx             `Icons` (map SVG inline) + type `IconName`
│   ├── UserCombobox.tsx      Recherche serveur d'utilisateurs (superviseur, affectation)
│   └── ResponsablesDrawer.tsx Responsables d'un nœud org (inviter / affecter / réaffecter)
├── context/
│   ├── AuthContext.tsx       JWT en localStorage + `/api/church/auth/me` + `getStoredToken()`
│   └── ToastContext.tsx      `useToasts().push({ kind, title, msg })`
├── data/mock.ts              ⚠ VESTIGE — voir « Points d'attention » n°1
├── hooks/useDebounced.ts
├── i18n/                     index.ts + locales/fr.json + locales/en.json (mêmes clés)
├── lib/
│   ├── orgTree.ts            `NodeLevel`, `TreeNode`, `buildTree()`, `byNameFr`
│   ├── responsables.ts       `RESP_ROLES_BY_LEVEL`, `buildGoalAttachment()`
│   └── countries.ts          Référentiel pays (code/fr/en/devise/continent)
├── pages/                    Login, Ministeres, Structure, Demandes, Utilisateurs,
│                             Abonnements, Audit, Settings
└── services/                 1 fichier par domaine backend (voir plus bas)
```

### Routes

| Route | Page | Contenu |
|---|---|---|
| `/login` | `Login` | seule route publique |
| `/ministeres` | `Ministeres` | liste + **bootstrap** d'un ministère (crée ministère + 1ʳᵉ localité + contact `SECRETARIAT` inactif + lien d'invitation) |
| `/structure` | `Structure` | arbre org d'un ministère, CRUD 4 niveaux + drawer Responsables |
| `/demandes` | `Demandes` | validation des demandes de **structure** et de **rattachement** (join requests) |
| `/utilisateurs` | `Utilisateurs` | annuaire **paginé et filtré côté serveur**, invitation, rôle, réaffectation, mot de passe, suppression |
| `/abonnements` | `Abonnements` | catalogue de modules, abonnements par périmètre, **devis (pricing quote)** |
| `/goals` | `Placeholder` | vue globale des objectifs — **pas encore implémentée** |
| `/audit` | `Audit` | dashboard de compteurs + journal d'audit |
| `/settings` | `Settings` | coordonnées de support (branché) + onglets profil/sécurité (mock) |

Toutes les routes protégées passent par `<Shielded>` = `ProtectedRoute` › `AppShell` › `ErrorBoundary`.

---

## Modèle métier (vocabulaire « Chantier B »)

L'arbre organisationnel a **4 niveaux** ; les identifiants techniques restent ceux du backend, seul le **vocabulaire affiché** a changé :

| `NodeLevel` (technique) | Libellé métier | Entité backend |
|---|---|---|
| `COUNTRY` | **Nation** | `org_country` |
| `ZONE` | **Région** ou **État** (libellé porté par le nœud NATION, cf. `updateNodeRegionLabel`) | `org_zone` |
| `LOCALITY` | **Ville** | `org_locality` |
| `UNIT` | **Assemblée de maison** | `org_unit` (type toujours `ASSEMBLY`) |

- **Le niveau `TEAM` est supprimé** (teams dissoutes). Ne pas rappeler `/api/org/admin/teams` : le contrôleur n'existe plus, et un 404 y faisait échouer tout le chargement de la structure (cf. commentaire dans `subscriptionService.fetchMinistryOrg`).
- **Plus de type `CENTER`** : toute unité créée est une `ASSEMBLY`.

### Rôles

`ModuleRole` (7 valeurs, déclaré à l'identique dans `authService.ts` et `userService.ts`) :

```
MEMBRE · DIRIGEANT_UNITE · DIRIGEANT · DIRIGEANT_SENIOR · DIRIGEANT_COORDINATEUR · LEADER · SECRETARIAT
```

⚠ **`DIRIGEANT_LEADER` n'existe plus** — renommé `DIRIGEANT_SENIOR`, et `DIRIGEANT_UNITE` a été ajouté. Le `CLAUDE.md` du backend est encore partiellement sur l'ancienne nomenclature : **la source de vérité est `com.excellence.back.auth.ModuleRole`**.

Rôle « naturel » par niveau (`lib/responsables.ts`) : `COUNTRY`→COORDINATEUR · `ZONE`→SENIOR · `LOCALITY`→DIRIGEANT (dirigeant de ville) · `UNIT`→DIRIGEANT_UNITE/MEMBRE · `MINISTRY`→LEADER/SECRETARIAT.

Un utilisateur porte un rôle **par module** (`donationRole`, `goalRole`) + un booléen transverse **`superAdmin`**. Le back-office ne pose que le rattachement **Goals** (`buildGoalAttachment`) — il ne touche pas aux rattachements Dons.

---

## Services & endpoints consommés

Un fichier par domaine, chaque interface porte un commentaire `Mirrors com.excellence.back.<...>` : **le type TS est le miroir du DTO backend, garder les deux alignés**.

| Fichier | Endpoints |
|---|---|
| `api.ts` | `API_URL` + `authHeaders()` + `apiFetch<T>()` — toute requête passe par là |
| `authService.ts` | `POST /api/cmfipraise/auth/login`, `GET /api/church/auth/me` |
| `ministryService.ts` | `GET /api/org/admin/ministries`, `POST /admin/ministries/bootstrap` |
| `orgService.ts` | CRUD `/api/org/admin/{continents,countries,zones,localities,units}` + nœuds génériques `/api/org/admin/nodes` (libellé Région/État) |
| `userService.ts` | `/api/church/admin/users` (liste paginée + `search`/`placeNodeId`/`role`/`active`), `/invite`, `/{id}` PATCH·DELETE, `/deactivate`, `/reassign`, `/set-password`, `/regenerate-invitation`, `/responsables`, `/responsable-counts` |
| `subscriptionService.ts` | `/admin/modules`, `/admin/subscriptions` (+ `/deactivate`, `/reactivate`), `/admin/pricing/quote`, lectures org pour les pickers |
| `structureRequestService.ts` | `/api/church/structure-requests/pending` + `/approve` + `/reject` |
| `joinRequestService.ts` | `/api/church/join-requests/pending` + `/approve` + `/reject` |
| `auditService.ts` | `/admin/dashboard`, `/admin/audit-logs` |
| `platformService.ts` | `GET/PUT /admin/platform/contact` (coordonnées de support de l'éditeur) |

> Les contrôleurs org du backend exposent **deux préfixes** : `/api/org/admin/**` (utilisé ici) et `/api/church/admin/**` (utilisé par `shephr-app`). Les deux pointent le même contrôleur — ne pas « harmoniser » sans vérifier l'autre frontend.

---

## Conventions

### Données serveur
- **Toujours react-query**, jamais de `useEffect` + `useState` pour un GET (`Settings.tsx` › `ContactSettingsCard` est la seule exception historique).
- Clés de cache existantes : `["ministries"]`, `["continents"]`, `["ministry-structure", ministryId]`, `["ministry-org", ministryId]`, `["responsable-counts", ministryId]`, `["responsables", nodeId, level]`, `["nation-nodes"]`, `["users-page", …filtres]`, `["user-search", ministryId, q]`, `["modules"]`, `["subscriptions", ministryId]`, `["structure-requests","pending"]`, `["join-requests","pending"]`, `["dashboard"]`, `["audit-logs", …]`.
- Après mutation : `qc.invalidateQueries` sur **toutes** les clés impactées (une modification de responsable invalide `responsables`, `responsable-counts`, `users-page` **et** `user-search`).
- Erreurs : `apiFetch` relève un `Error` dont le message vient de `body.message ?? body.detail ?? HTTP <status>`. Le pattern d'affichage est `onError: (e) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") })`.

### Filtrage et pagination
La page Utilisateurs filtre et pagine **côté serveur** (`searchUsers`), et les compteurs de responsables sont agrégés **côté serveur** (`fetchResponsableCounts`). C'est délibéré : charger l'annuaire complet pour filtrer dans le navigateur rendait invisibles tous les comptes au-delà de la page chargée. **Ne pas réintroduire de filtrage client sur des listes potentiellement grandes.** `listMinistryUsers` (`size=500`) subsiste pour les usages bornés uniquement.

### i18n
- **Aucune chaîne visible en dur.** Toute clé ajoutée doit l'être **dans `fr.json` ET `en.json`** (même arborescence, mêmes clés).
- Sections : `common, nav, requests, joinRequests, login, ministries, subscriptions, audit, settings, placeholder, table, pagination, structure, responsables, users`.
- Les libellés de rôles vivent sous `responsables.role.<MODULE_ROLE>`.
- Formatage de date : `toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", …)`.
- Vérifier le JSON après édition : `node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/fr.json','utf8'))"`.

### Style
- **Aucune classe utilitaire** (pas de Tailwind). Soit une classe de `index.css`, soit un `style={{…}}` inline utilisant les tokens CSS (`var(--ink-500)`, `var(--green-800)`, `var(--line)`…).
- Palette : verts (`--green-*`), terre (`--earth-*`), parchemin/ivoire (surfaces), encre (`--ink-*`). Typo serif pour les titres (`--font-serif`).
- Réutiliser les primitives plutôt que de recréer un bouton/modale/table.

### Composition d'une page
`TopBar` (titre + `crumbs` + `actions`) › `<div className="content">` › `card`. Le trio chargement / erreur / vide est explicite dans chaque page (voir `Ministeres.tsx` comme gabarit de référence).

---

## Build & run

```bash
npm install
npm run dev        # Vite sur http://localhost:5174
npm run build      # tsc -p tsconfig.app.json && vite build
npm run lint       # eslint (flat config)
npx tsc -p tsconfig.app.json --noEmit   # typecheck seul
```

Le backend doit tourner en local sur `http://localhost:8080` (`mvn spring-boot:run -Dspring-boot.run.arguments="--spring.profiles.active=local"`, **JDK 17**).

**Variable d'environnement** : `VITE_API_URL` (défaut `http://localhost:8080`).
⚠ `services/api.ts` construit des URLs **absolues** — le proxy `/api` de `vite.config.ts` n'est donc **pas** utilisé en pratique. Le CORS doit être ouvert côté backend en dev.

Il n'y a **aucun test automatisé** dans ce dépôt. La vérification minimale avant de conclure un changement : `npx tsc -p tsconfig.app.json --noEmit` (propre au 2026-08-14) + `npm run lint`.

---

## Points d'attention

1. **`src/data/mock.ts` est un vestige, pas une source de données.** Il n'alimente plus que : `charts.tsx` (helpers `gbp`/`gbpShort` — purement du formatage) et les onglets **Profil / Sécurité** de `Settings.tsx` (constante `ADMIN`, `CATEGORIES`). Seul le bloc « coordonnées de support » de Settings est réellement branché. Ne **pas** brancher une nouvelle page sur `mock.ts` ; si un onglet Settings est implémenté, retirer l'import correspondant.

2. **`BACKEND_GAPS.md` (racine) est obsolète.** Il décrit une version antérieure du produit (pages Dons/Dashboard, rôle `ADMIN`, chemin backend `~/Documents/WorkSpace/Cmfipraise/...`). Ne pas s'y fier : croiser directement avec les contrôleurs de `cmfipraise-backend`. À supprimer ou réécrire lors du prochain passage.

3. **`ProtectedRoute` exige `user.superAdmin`** — un dirigeant de ministère authentifié est renvoyé sur `/login` (et non vers une page 403). C'est voulu : ce back-office n'a aucun mode « ministère ».

4. **`tsconfig.app.json` est en `strict: false`** (avec `noImplicitAny: false`). Le code récent est néanmoins typé explicitement : suivre le style typé plutôt que la permissivité du compilateur.

5. **Session** : token et user en `localStorage` (`shephr_token`, `shephr_user`), aucune révocation côté serveur, pas de refresh token. Un 401 n'est **pas** intercepté globalement (contrairement à `shephr-app/web`) : l'appel échoue simplement en erreur. En cas de changement de rôle en base, **re-login obligatoire** (les claims sont dans le JWT).

6. **La règle « qui est responsable d'un nœud » vit côté serveur** (`/responsables`, `/responsable-counts`). Ne pas la recalculer côté front : une seconde implémentation dériverait de la première (cf. commentaire explicite en tête de `lib/responsables.ts`).

7. **Suppressions gardées par le backend** : la suppression d'un utilisateur est refusée si un poste resterait sans responsable, la suppression d'un nœud org si celui-ci a des enfants. Afficher le message d'erreur du backend tel quel — il porte le motif.

8. **Page `/goals` = `Placeholder`.** La vue globale des objectifs (cross-ministère) reste à faire ; l'entrée de menu existe déjà.

9. **Les libellés Nation/Région/État/Ville/Assemblée sont de l'i18n**, les `NodeLevel` restent `COUNTRY/ZONE/LOCALITY/UNIT`. Ne pas renommer les identifiants techniques : ils sont alignés sur les scopes d'abonnement du backend (`SubscriptionScope`).
