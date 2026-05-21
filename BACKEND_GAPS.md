# Shephr Web — Backend Gaps

Inventaire des endpoints requis par le design web `shephr-webapp` vs. ceux exposés par `cmfipraise-backend` (modules `auth`, `donation/*`, `org/*`).

Repo backend : `/Users/philippeveigne/Documents/WorkSpace/Cmfipraise/cmfipraise-backend`

Légende : ✅ existe · ⚠️ partiel · ❌ manquant

---

## 1. Authentification

| Besoin frontend | Backend | Endpoint | Statut |
|---|---|---|---|
| Login admin | `AuthController` | `POST /api/cmfipraise/auth/login` | ✅ |
| Récupérer utilisateur courant | `ChurchAuthController` | `GET /api/church/auth/me` | ✅ |
| Logout (révocation token) | — | — | ❌ Logout côté client uniquement. Pas d'invalidation backend. |
| Mot de passe oublié | — | — | ❌ Lien présent dans la page Login mais pas d'endpoint. |
| Changer son mot de passe | — | — | ❌ Onglet « Paramètres → Profil » a un formulaire ; pas d'endpoint. |

**Réponse `/login` attendue :** `{ token: string, user?: {...} }`. Le service frontend (`src/services/authService.ts`) lit `data.token` (ou `data.accessToken`). Vérifier que `AuthResponseDTO` expose effectivement `token`.

**Contrôle d'accès admin :** le frontend exige `user.role === "ADMIN"` dans `ProtectedRoute`. Si `/auth/me` ne retourne pas `role`, ajuster le DTO.

---

## 2. Tableau de bord

| Besoin frontend | Backend | Endpoint | Statut |
|---|---|---|---|
| Total ce mois + comparaison mois précédent + YTD | `DonationStatsController` | `GET /api/church/donations/stats/summary` | ✅ |
| Série mensuelle 12 mois | `DonationStatsController` | `GET /api/church/donations/stats/by-month` | ✅ |
| Top 5 unités | `DonationStatsController` | `GET /api/church/donations/stats/by-unit` | ✅ (à trier + limiter côté front) |
| Membres actifs (donné dans 3 derniers mois) | — | — | ❌ Pas d'endpoint dédié. À ajouter, ex. `GET /api/church/stats/active-members`. |
| Répartition par localité | — | — | ⚠️ Pas d'endpoint direct. Soit dériver de `/by-unit` en groupant par `localityId`, soit ajouter `GET /api/church/donations/stats/by-locality`. **Recommandé : ajouter l'endpoint** (moins de logique côté front, meilleure perf). |
| Derniers 10 dons | `DonationController` | `GET /api/church/donations?size=10&sort=donationDate,desc` | ✅ |

---

## 3. Dons (page `/donations`)

| Besoin frontend | Backend | Endpoint | Statut |
|---|---|---|---|
| Liste paginée + filtres | `DonationController` | `GET /api/church/donations?from&to&category&unitId&userId&page&size` | ✅ |
| Détail d'un don | `DonationController` | `GET /api/church/donations/{id}` | ✅ |
| Édition d'un don | `DonationController` | `PATCH /api/church/donations/{id}` | ✅ |
| Suppression | `DonationController` | `DELETE /api/church/donations/{id}` | ✅ |
| Export CSV filtré | `DonationExportController` | `GET /api/church/donations/export?format=csv&from&to&unitId` | ✅ |
| Filtres « localité » + « type d'unité » | — | — | ⚠️ Le `GET /donations` accepte `unitId` mais pas `localityId` ni `unitType`. Ajouter ces query params dans `DonationController.list()` + `DonationSpecifications`. |
| Filtres `minAmount` / `maxAmount` | — | — | ⚠️ Idem : pas dans la signature actuelle de `list()`. Ajouter. |
| Recherche par nom de membre (texte libre) | — | — | ⚠️ Actuellement filtré côté `userId` UUID. Le design propose un champ texte ; ajouter `?memberQuery=` ou résolution côté front en présélectionnant l'utilisateur. |

---

## 4. Structure → Ministères (`/ministeres`)

| Besoin frontend | Backend | Endpoint | Statut |
|---|---|---|---|
| Lister ministères | `AdminMinistryController` | `GET /api/church/admin/ministries` | ✅ |
| Créer | `AdminMinistryController` | `POST /api/church/admin/ministries` | ✅ |
| Mettre à jour | `AdminMinistryController` | `PATCH /api/church/admin/ministries/{id}` | ✅ |
| Supprimer | — | — | ❌ Bouton « Supprimer » présent dans le tableau du design. Soit ajouter `DELETE /api/church/admin/ministries/{id}`, soit retirer le bouton. (Pour le pilote, suppression peu fréquente ; on peut commencer par cacher le bouton.) |
| Compteurs (localités, unités, membres) dans la réponse | `MinistryResponse` (à vérifier) | — | ⚠️ Vérifier que `MinistryResponse` expose `localitiesCount`, `unitsCount`, `membersCount`. Sinon ajouter agrégat côté service ou faire des appels supplémentaires. |

---

## 5. Structure → Localités (`/localites`)

| Besoin frontend | Backend | Endpoint | Statut |
|---|---|---|---|
| Lister | `AdminLocalityController` | `GET /api/church/admin/localities?ministryId` | ✅ |
| Créer | `AdminLocalityController` | `POST /api/church/admin/localities` | ✅ |
| Mettre à jour | `AdminLocalityController` | `PATCH /api/church/admin/localities/{id}` | ✅ |
| Supprimer | `AdminLocalityController` | `DELETE /api/church/admin/localities/{id}` | ✅ |
| Filtre par pays | — | — | ⚠️ Le filtre `country` n'est pas exposé dans la query string. À ajouter ou retirer du UI. |
| Compteurs (unités, membres) | `LocalityResponse` | — | ⚠️ Vérifier que ces compteurs sont présents dans la réponse. |

---

## 6. Structure → Unités (`/unites`)

| Besoin frontend | Backend | Endpoint | Statut |
|---|---|---|---|
| Lister | `AdminUnitController` | `GET /api/church/admin/units?ministryId&localityId&type` | ✅ |
| Créer | `AdminUnitController` | `POST /api/church/admin/units` | ✅ |
| Mettre à jour (toggle actif, etc.) | `AdminUnitController` | `PATCH /api/church/admin/units/{id}` | ✅ (à confirmer que `active` est dans `UpdateUnitRequest`) |
| Filtre statut actif/inactif | — | — | ⚠️ Pas de `?active=true` dans la signature actuelle. À ajouter. |
| Suppression | `AdminUnitController` (à vérifier) | `DELETE /api/church/admin/units/{id}` | ⚠️ La classe importe `DeleteMapping` ; à confirmer dans le fichier complet. |
| Affichage du total du mois courant par unité | — | — | ⚠️ À récupérer depuis `/stats/by-unit?from=current-month` puis fusionner côté front (ou enrichir `UnitResponse`). |
| Affichage des dirigeants assignés par unité | — | — | ⚠️ Soit `UnitResponse` les inclut, soit appeler `/leader-assignments?unitId=...` (le filtre `unitId` n'existe pas encore — voir §9). |

---

## 7. Utilisateurs (`/users`)

| Besoin frontend | Backend | Endpoint | Statut |
|---|---|---|---|
| Lister utilisateurs paginés | `AdminUserController` | `GET /api/church/admin/users?role&unitId&ministryId&active&page&size` | ✅ |
| Inviter (générer lien) | `AdminUserController` | `POST /api/church/admin/users/invite` | ✅ |
| Mettre à jour (rôle, niveau, unité, statut) | `AdminUserController` | `PATCH /api/church/admin/users/{id}` | ✅ |
| Désactiver | `AdminUserController` | `POST /api/church/admin/users/{id}/deactivate` | ✅ |
| Réactiver | — | — | ⚠️ Le toggle « Compte actif » est bidirectionnel dans le design ; pas d'endpoint « réactiver » visible. Soit ajouter `POST /{id}/activate`, soit autoriser `PATCH { active: true }`. |
| Recherche texte (nom/email) | — | — | ⚠️ Pas de `?search=` dans la signature actuelle. À ajouter. |
| Filtre statut « Invité » | — | — | ⚠️ Aujourd'hui `active: Boolean` ; le design distingue Actif / Inactif / Invité (post-invite, pré-acceptation). Ajouter un statut tri-état (Enum `UserStatus`) ou un flag `pendingInvite`. |

---

## 8. Hiérarchie → Attributions (`/hierarchy` section A)

| Besoin frontend | Backend | Endpoint | Statut |
|---|---|---|---|
| Lister attributions | `AdminLeaderAssignmentController` | `GET /api/church/admin/leader-assignments?leaderId` | ✅ |
| Créer attribution | `AdminLeaderAssignmentController` | `POST /api/church/admin/leader-assignments` | ✅ |
| Supprimer | `AdminLeaderAssignmentController` | `DELETE /api/church/admin/leader-assignments/{id}` | ✅ |
| Filtre par unité | — | — | ⚠️ Seulement `leaderId` dispo aujourd'hui. Ajouter `unitId`. |
| `attribuéPar` (admin qui a créé l'attribution) | — | — | ⚠️ Vérifier que `LeaderAssignmentResponse` expose `createdById` / `createdByName`. Sinon l'ajouter (utile pour audit). |

---

## 9. Hiérarchie → Supervision Senior–Junior (`/hierarchy` section B)

| Besoin frontend | Backend | Endpoint | Statut |
|---|---|---|---|
| Lister les liens senior→juniors | — | — | ❌ `AdminLeaderHierarchyController` n'expose que `POST` et `DELETE`. **Ajouter `GET /api/church/admin/leader-hierarchies`** (avec optionnel `?seniorId`). Sans lui le frontend ne peut pas afficher l'arbre. |
| Créer un lien (cycle rejeté) | `AdminLeaderHierarchyController` | `POST /api/church/admin/leader-hierarchies` | ✅ |
| Supprimer un lien | `AdminLeaderHierarchyController` | `DELETE /api/church/admin/leader-hierarchies/{id}` | ✅ |
| Validation cycle côté serveur | (annoté « cycle rejeté ») | — | ✅ confirmé par l'annotation. |

---

## 10. Exports (`/exports`)

| Besoin frontend | Backend | Endpoint | Statut |
|---|---|---|---|
| Génération CSV à la demande | `DonationExportController` | `GET /api/church/donations/export?format=csv&from&to&unitId` | ✅ |
| Presets nommés (« Tout le ministère », « Par localité », « Par unité », « Par catégorie ») | — | — | ⚠️ Le backend n'a pas la notion de « preset ». Soit on les implémente côté front (mapping vers les bons query params), soit on persiste des presets en base (`GET/POST /api/church/admin/export-presets`). **Recommandé : front-only pour V1.** |
| Filtre `category` dans l'export | — | — | ⚠️ Pas dans la signature actuelle (seul `unitId` est filtrable). À ajouter pour le preset « Par catégorie ». |
| Filtre `localityId` dans l'export | — | — | ⚠️ Idem. À ajouter. |
| Regroupement (`grouping`) | — | — | ❌ Le CSV est plat. Le UI propose `Aucun/Localité/Unité/Catégorie/Mois`. Soit retirer du UI en V1, soit ajouter un paramètre `groupBy`. |
| Historique des exports | — | — | ❌ Aucun stockage. **Ajouter table `donation_export` + endpoints `GET /api/church/admin/exports` (historique) + retour de l'`id` lors de la génération + endpoint de re-téléchargement `GET /api/church/admin/exports/{id}/download`.** Sinon l'historique est purement local au navigateur. |

---

## 11. Paramètres (`/settings`)

### 11.1 Profil
| Besoin | Statut |
|---|---|
| Modifier nom, email, langue, fuseau | ❌ Aucun endpoint `PATCH /api/church/auth/me` ou équivalent. **À ajouter.** |
| Changer mot de passe | ❌ Pas d'endpoint. **Ajouter `POST /api/church/auth/change-password { currentPassword, newPassword }`.** |
| Upload photo de profil | ❌ Aucun. (Peut être différé en V2.) |

### 11.2 Notifications
| Besoin | Statut |
|---|---|
| Lire / écrire préférences email | ❌ Aucun endpoint. **Ajouter `GET/PUT /api/church/admin/notification-preferences`** avec les 7 toggles (digestWeekly, digestMonthly, newDonation, lowActivity, newUser, invitePending, exportReady). Le service `notification` existe déjà côté backend ; étendre. |

### 11.3 Sécurité
| Besoin | Statut |
|---|---|
| 2FA | ⚠️ Affiché « Bientôt » dans le design — pas urgent. |
| Sessions actives (liste, déconnexion ciblée, déconnexion globale) | ❌ Pas d'endpoint. **Ajouter `GET /api/church/auth/sessions`, `DELETE /sessions/{id}`, `POST /sessions/revoke-all`.** Implique persistance des sessions JWT côté backend (sinon, JWT stateless = pas de liste). |

### 11.4 Catégories & devises
| Besoin | Statut |
|---|---|
| CRUD sur les catégories de dons | ⚠️ Aujourd'hui `category` est un champ `String` libre sur `Donation`. Le design propose une liste fermée avec activation/désactivation. **Ajouter table `donation_category` + endpoints `GET/POST/PATCH/DELETE /api/church/admin/categories`.** Migrer le champ `category` vers une FK. |
| Devise par défaut + devises supportées par ministère | ⚠️ La devise par défaut existe sur `Ministry`. Le design veut une liste de devises **supportées** distincte. **Ajouter champ `supportedCurrencies: List<String>` sur Ministry + endpoint dédié si besoin.** |

---

## Récapitulatif des **endpoints à créer/étendre** (ordre de priorité)

### Bloquants pour l'usage de base
1. ❌ `GET /api/church/admin/leader-hierarchies` — sinon l'écran Hiérarchie est inutilisable.
2. ⚠️ Élargir filtres `DonationController.list()` : `localityId`, `unitType`, `minAmount`, `maxAmount`, `memberQuery`.
3. ⚠️ Élargir filtres `DonationExportController.export()` : `localityId`, `category`, éventuellement `groupBy`.
4. ⚠️ S'assurer que `AuthResponseDTO` expose `token` (et que `/auth/me` retourne `role`) — vérifier les DTOs.

### Importants (UX)
5. ❌ Sauvegarde du profil utilisateur courant (`PATCH /api/church/auth/me`).
6. ❌ Changement de mot de passe (`POST /api/church/auth/change-password`).
7. ❌ Préférences notifications (`GET/PUT /api/church/admin/notification-preferences`).
8. ⚠️ Filtre `search` et statut « Invité » sur `AdminUserController.list()`.
9. ⚠️ Stats par localité (soit dériver côté front, soit `GET /api/church/donations/stats/by-locality`).
10. ⚠️ Métrique « membres actifs » (3 derniers mois) — éventuellement à inclure dans `/stats/summary`.

### Différables
11. ❌ Historique d'exports persistant (`donation_export` + endpoints associés).
12. ❌ CRUD catégories normalisées + migration de `Donation.category`.
13. ❌ Sessions actives + révocation (impose sessions persistées).
14. `DELETE /admin/ministries/{id}` (rare en production).

---

## Notes d'intégration côté frontend

- Base URL : `VITE_API_URL` (défaut `http://localhost:8080`), définie dans `.env`.
- Token : stocké en `localStorage` sous la clé `shephr_token`. Helper `authHeaders()` dans `src/services/api.ts`.
- Toutes les pages utilisent actuellement les **mocks** définis dans `src/data/mock.ts`. Les services API sont à implémenter au fur et à mesure que les gaps ci-dessus sont comblés ou contournés.
- L'écran Login est déjà câblé sur `/api/cmfipraise/auth/login` via `authService.authLogin()`. Au premier essai, vérifier la forme exacte de la réponse (champ `token` vs `accessToken`) et adapter `authService.ts:24`.
- `ProtectedRoute` redirige vers `/login` si `user.role !== "ADMIN"`. Si le backend renvoie une casse différente (ex. `Admin`), normaliser dans `fetchCurrentUser`.
