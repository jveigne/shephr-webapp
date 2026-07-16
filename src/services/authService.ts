import { API_URL } from "./api";

// Aligné sur com.excellence.back.auth.ModuleRole (correction T1 : DIRIGEANT_LEADER n'existe plus).
export type ModuleRole =
  | "MEMBRE"
  | "DIRIGEANT_UNITE"
  | "DIRIGEANT"
  | "DIRIGEANT_SENIOR"
  | "DIRIGEANT_COORDINATEUR"
  | "LEADER"
  | "SECRETARIAT";

// Mirrors com.excellence.back.donation.auth.dto.MeResponse
export type ChurchUser = {
  id: string;
  email: string;
  fullName: string;
  superAdmin: boolean;
  donationRole?: ModuleRole | null;
  goalRole?: ModuleRole | null;
  ministryId?: string | null;
  donationUnitId?: string | null;
  donationZoneId?: string | null;
  active: boolean;
};

export async function authLogin(email: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${API_URL}/api/cmfipraise/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    let msg = "Identifiants incorrects";
    try {
      const body = await res.json();
      msg = body.message || body.detail || msg;
    } catch { /* not json */ }
    throw new Error(msg);
  }
  const data = await res.json();
  // Backend AuthResponseDTO is expected to contain a `token` field.
  const token = data?.token || data?.accessToken;
  if (!token) throw new Error("Réponse d'authentification invalide");
  return { token };
}

export async function fetchCurrentUser(token: string): Promise<ChurchUser | null> {
  const res = await fetch(`${API_URL}/api/church/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}
