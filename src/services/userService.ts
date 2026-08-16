import { apiFetch } from "./api";

// Rôles par module (Lot 3.5 — organigramme de personnes).
export type ModuleRole =
  | "MEMBRE" | "DIRIGEANT_UNITE" | "DIRIGEANT" | "DIRIGEANT_SENIOR"
  | "DIRIGEANT_COORDINATEUR" | "LEADER" | "SECRETARIAT";

/** Mirrors com.excellence.back.auth.admin.user.dto.AdminUserResponse */
export interface AdminUserResponse {
  id: string;
  /** Email de CONTACT — facultatif : les comptes Shephr sont créés sur `username`. */
  email: string | null;
  /** Identifiant de CONNEXION attribué par le back-office (type pveigne@shephr.org). */
  username: string | null;
  fullName: string;
  superAdmin: boolean;
  ministryId: string | null;
  supervisorId: string | null;
  /** Nom du superviseur, résolu par le backend : la liste est paginée, l'annuaire n'est plus en mémoire. */
  supervisorFullName: string | null;
  donationRole: ModuleRole | null;
  donationUnitId: string | null;
  donationZoneId: string | null;
  donationCityId: string | null;
  donationUnitIds: string[];
  donationCountryIds: string[];
  goalRole: ModuleRole | null;
  goalUnitId: string | null;
  goalZoneId: string | null;
  goalCityId: string | null;
  goalUnitIds: string[];
  goalCountryIds: string[];
  /** Multi-rattachements (home + set) : villes d'un DIRIGEANT / régions d'un SENIOR. */
  goalCityIds: string[];
  goalZoneIds: string[];
  coordinatedCountryIds: string[];
  /**
   * A-t-elle soumis SES engagements pour l'année courante ? (RG-BQ-06)
   *
   * `true` soumis · `false` pas encore · `null` = **uniquement** compte sans `goalUnitId` ou
   * `superAdmin`. ⚠ `null` ne signifie plus « ce rôle n'a rien à déclarer » : depuis RG-BQ-11 tout
   * compte rattaché déclare personnellement, DIRIGEANT de ville / SENIOR / COORDINATEUR /
   * SECRETARIAT compris. Ne jamais afficher « non applicable » attaché à un rôle.
   */
  goalSubmitted: boolean | null;
  active: boolean;
  createdAt: string;
  updatedAt: string | null;
}

interface PageResponse<T> { content: T[]; totalElements: number; }

/** Page renvoyée par Spring Data (champs utiles à la pagination du back-office). */
export interface UserPage {
  content: AdminUserResponse[];
  totalElements: number;
  totalPages: number;
  /** Index de la page courante, base 0. */
  number: number;
  size: number;
}

/**
 * Libellé d'identification d'un compte. L'identifiant de connexion prime sur l'email : les comptes
 * Shephr sont créés sur `username` et n'ont souvent PAS d'email — afficher `email` seul laisse une
 * ligne vide dans les listes.
 */
export function userLogin(u: Pick<AdminUserResponse, "username" | "email">): string {
  return u.username ?? u.email ?? "—";
}

/** Niveaux de l'arbre organisationnel, tels que le backend les nomme (identiques à `NodeLevel`). */
export type ResponsableLevel = "MINISTRY" | "COUNTRY" | "ZONE" | "LOCALITY" | "UNIT";

/**
 * Responsables rattachés EXACTEMENT à ce nœud. La règle vit côté serveur : le back-office ne
 * charge plus l'annuaire complet, il ne peut donc plus la calculer lui-même.
 */
export function listResponsables(nodeId: string, level: ResponsableLevel): Promise<AdminUserResponse[]> {
  return apiFetch<AdminUserResponse[]>(
    `/api/church/admin/users/responsables?nodeId=${nodeId}&level=${level}`,
  );
}

/** Nombre de responsables par nœud, pour tout l'arbre d'un ministère (compteurs page Structure). */
export async function fetchResponsableCounts(ministryId: string): Promise<Map<string, number>> {
  const rows = await apiFetch<Array<{ nodeId: string; count: number }>>(
    `/api/church/admin/users/responsable-counts?ministryId=${ministryId}`,
  );
  return new Map(rows.map((r) => [r.nodeId, r.count]));
}

export interface InviteUserRequest {
  /** Identifiant OU email requis (au moins un). Les comptes Shephr partent de l'identifiant. */
  email?: string;
  username?: string;
  fullName: string;
  ministryId?: string;
  supervisorId?: string | null;
  goalRole?: ModuleRole;
  goalUnitId?: string;
  goalZoneId?: string;
  goalCityId?: string;
  goalUnitIds?: string[];
  goalCountryIds?: string[];
  /** Multi-rattachements (home + set) : villes d'un DIRIGEANT / régions d'un SENIOR. */
  goalCityIds?: string[];
  goalZoneIds?: string[];
}

export interface InviteUserResponse {
  userId: string;
  email: string;
  invitationToken: string;
  invitationShortCode: string | null;
}

export interface UpdateUserRequest {
  fullName?: string;
  email?: string;
  username?: string;
  supervisorId?: string | null;
  goalRole?: ModuleRole;
  goalUnitId?: string;
  goalZoneId?: string;
  goalCityId?: string;
  goalUnitIds?: string[];
  goalCountryIds?: string[];
  active?: boolean;
}

/** Liste des utilisateurs d'un ministère (grande page pour le back-office). */
export async function listMinistryUsers(ministryId: string): Promise<AdminUserResponse[]> {
  const data = await apiFetch<PageResponse<AdminUserResponse>>(
    `/api/church/admin/users?ministryId=${ministryId}&size=500`,
  );
  return data.content;
}

export interface UserQuery {
  /** Vide = tous les ministères (le backend restreint de lui-même un acteur non SUPER_ADMIN). */
  ministryId?: string;
  /** Nom (approché), identifiant de connexion ou email. Exclusif du filtre géographique. */
  search?: string;
  /** Nation, région, ville ou assemblée : le backend prend tout le sous-arbre du nœud. */
  placeNodeId?: string;
  /** Rôle Objectifs OU Dons. */
  role?: ModuleRole | "";
  active?: boolean;
  /** Base 0. */
  page?: number;
  size?: number;
}

/**
 * Liste paginée et filtrée CÔTÉ SERVEUR. C'est le seul chemin viable au-delà de quelques centaines
 * de comptes : charger tout l'annuaire pour filtrer dans le navigateur laisse invisibles tous les
 * inscrits au-delà de la page chargée. Tri par défaut du backend : derniers inscrits en tête.
 */
export function searchUsers(q: UserQuery): Promise<UserPage> {
  const p = new URLSearchParams();
  if (q.ministryId) p.set("ministryId", q.ministryId);
  if (q.search?.trim()) p.set("search", q.search.trim());
  if (q.placeNodeId) p.set("placeNodeId", q.placeNodeId);
  if (q.role) p.set("role", q.role);
  if (q.active !== undefined) p.set("active", String(q.active));
  p.set("page", String(q.page ?? 0));
  p.set("size", String(q.size ?? 25));
  return apiFetch<UserPage>(`/api/church/admin/users?${p.toString()}`);
}

/** Mirrors com.excellence.back.auth.admin.user.dto.GoalSubmissionSummaryResponse */
export interface GoalSubmissionSummary {
  submitted: number;
  total: number;
}

/**
 * Compteur « X / Y ont soumis leur engagement », calculé sur TOUT le périmètre filtré et non sur la
 * page affichée : la liste est paginée côté serveur, décompter les 25 lignes visibles donnerait un
 * chiffre faux. Prend exactement les mêmes filtres que {@link searchUsers} (hors pagination).
 *
 * `total` ne compte que les comptes CONCERNÉS (`goalSubmitted != null`), c'est-à-dire rattachés à
 * une assemblée et non `superAdmin` — RG-BQ-06.
 */
export function fetchGoalSubmissionSummary(q: UserQuery): Promise<GoalSubmissionSummary> {
  const p = new URLSearchParams();
  if (q.ministryId) p.set("ministryId", q.ministryId);
  if (q.search?.trim()) p.set("search", q.search.trim());
  if (q.placeNodeId) p.set("placeNodeId", q.placeNodeId);
  if (q.role) p.set("role", q.role);
  if (q.active !== undefined) p.set("active", String(q.active));
  return apiFetch<GoalSubmissionSummary>(
    `/api/church/admin/users/goal-submission-summary?${p.toString()}`,
  );
}

export function inviteUser(body: InviteUserRequest): Promise<InviteUserResponse> {
  return apiFetch<InviteUserResponse>("/api/church/admin/users/invite", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateUser(id: string, body: UpdateUserRequest): Promise<AdminUserResponse> {
  return apiFetch<AdminUserResponse>(`/api/church/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deactivateUser(id: string): Promise<AdminUserResponse> {
  return apiFetch<AdminUserResponse>(`/api/church/admin/users/${id}/deactivate`, { method: "POST" });
}

/** Mirrors com.excellence.back.auth.admin.user.dto.ReassignUserRequest */
export interface ReassignUserRequest {
  goalRole: ModuleRole;
  /** Entité DIRIGÉE (assemblée / ville / région / nation). */
  entityId?: string | null;
  /** Multi-rattachements (villes d'un DIRIGEANT, régions d'un SENIOR) : la première est la principale. */
  entityIds?: string[];
  /**
   * Assemblée de rattachement **PERSONNEL** (RG-BQ-03) — celle où la personne déclare SES propres
   * engagements, distincte de l'entité qu'elle dirige. Omis, le rattachement actuel est CONSERVÉ
   * (il n'est plus vidé avec les rattachements de direction). Pour `MEMBRE` et `DIRIGEANT_UNITE`,
   * c'est `entityId` qui le porte — ne pas doubler le champ.
   *
   * ⚠ Un compte portant un `goalRole` sans assemblée est refusé : `GOAL_UNIT_REQUIRED` (422).
   * Le changer déclenche la garde RG-BQ-09 côté serveur (`superAdmin` ou SECRETARIAT du ministère).
   */
  goalUnitId?: string;
  supervisorId?: string | null;
}

/** Réaffecte un utilisateur à un niveau hiérarchique (rattachement Goals posé en bloc) + superviseur. */
export function reassignUser(id: string, body: ReassignUserRequest): Promise<AdminUserResponse> {
  return apiFetch<AdminUserResponse>(`/api/church/admin/users/${id}/reassign`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Modifie les informations d'un utilisateur (nom, email, actif). */
export function updateUserInfo(id: string, body: UpdateUserRequest): Promise<AdminUserResponse> {
  return apiFetch<AdminUserResponse>(`/api/church/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Régénère le code/lien d'invitation d'un compte non activé (l'ancien est invalidé). */
export function regenerateInvitation(id: string): Promise<InviteUserResponse> {
  return apiFetch<InviteUserResponse>(`/api/church/admin/users/${id}/regenerate-invitation`, { method: "POST" });
}

/** Définit un nouveau mot de passe. */
export function setUserPassword(id: string, password: string): Promise<AdminUserResponse> {
  return apiFetch<AdminUserResponse>(`/api/church/admin/users/${id}/set-password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

/** Supprime définitivement un utilisateur (refusé par le backend si un poste resterait sans responsable). */
export function deleteUser(id: string): Promise<void> {
  return apiFetch<void>(`/api/church/admin/users/${id}`, { method: "DELETE" });
}
