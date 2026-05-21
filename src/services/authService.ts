import { API_URL } from "./api";

export type ChurchUser = {
  id: string;
  email: string;
  fullName: string;
  role: "USER" | "MEMBER" | "LEADER" | "ADMIN" | "SUPER_ADMIN";
  leaderLevel?: "JUNIOR" | "SENIOR" | null;
  ministryId?: string | null;
  unitId?: string | null;
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
