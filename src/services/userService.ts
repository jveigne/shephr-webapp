import { apiFetch } from "./api";

// Rôles par module (Lot 3.5 — organigramme de personnes).
export type ModuleRole =
  | "MEMBRE" | "DIRIGEANT_UNITE" | "DIRIGEANT" | "DIRIGEANT_SENIOR"
  | "DIRIGEANT_COORDINATEUR" | "LEADER" | "SECRETARIAT";

export interface AdminUserResponse {
  id: string;
  email: string;
  fullName: string;
  superAdmin: boolean;
  ministryId: string | null;
  supervisorId: string | null;
  donationRole: ModuleRole | null;
  donationUnitId: string | null;
  donationZoneId: string | null;
  donationTeamId: string | null;
  donationUnitIds: string[];
  donationCountryIds: string[];
  goalRole: ModuleRole | null;
  goalUnitId: string | null;
  goalZoneId: string | null;
  goalTeamId: string | null;
  goalUnitIds: string[];
  goalCountryIds: string[];
  coordinatedCountryIds: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string | null;
}

interface PageResponse<T> { content: T[]; totalElements: number; }

export interface InviteUserRequest {
  email: string;
  fullName: string;
  ministryId?: string;
  supervisorId?: string | null;
  goalRole?: ModuleRole;
  goalUnitId?: string;
  goalZoneId?: string;
  goalTeamId?: string;
  goalUnitIds?: string[];
  goalCountryIds?: string[];
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
  supervisorId?: string | null;
  goalRole?: ModuleRole;
  goalUnitId?: string;
  goalZoneId?: string;
  goalTeamId?: string;
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

export interface ReassignUserRequest {
  goalRole: ModuleRole;
  entityId?: string | null;
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
