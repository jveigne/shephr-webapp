import { API_URL, apiFetch } from "./api";

// Mirrors com.excellence.back.org.admin.ministry.dto.MinistryResponse
export interface MinistryResponse {
  id: string;
  name: string;
  defaultCurrency: string;
  country: string | null;
  createdAt: string;
  updatedAt: string | null;
}

// Mirrors com.excellence.back.org.admin.bootstrap.dto.MinistryBootstrapRequest
export interface MinistryBootstrapRequest {
  ministryName: string;
  defaultCurrency: string;
  ministryCountry?: string;
  localityName: string;
  localityCountry?: string;
  adminEmail: string;
  adminFullName: string;
}

// Mirrors com.excellence.back.org.admin.bootstrap.dto.MinistryBootstrapResponse
export interface MinistryBootstrapResponse {
  ministryId: string;
  localityId: string;
  adminUserId: string;
  adminEmail: string;
  invitationToken: string;
}

/** Liste des ministères (SUPER_ADMIN). */
export function listMinistries(): Promise<MinistryResponse[]> {
  return apiFetch<MinistryResponse[]>("/api/org/admin/ministries");
}

/** Onboarding d'un nouveau ministère : crée Ministry + Localité + 1er contact (SECRETARIAT, inactif) + invitation. */
export function bootstrapMinistry(
  payload: MinistryBootstrapRequest,
): Promise<MinistryBootstrapResponse> {
  return apiFetch<MinistryBootstrapResponse>("/admin/ministries/bootstrap", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** URL de la page d'acceptation d'invitation (Espace ministère, servi à la même URL que l'API). */
export function invitationLink(token: string): string {
  return `${API_URL.replace(/\/$/, "")}/invitation/${token}`;
}
