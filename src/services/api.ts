import { getStoredToken } from "@/context/AuthContext";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getStoredToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

/**
 * Erreur d'API. Reste un `Error` — le pattern d'affichage `e instanceof Error ? e.message` marche
 * inchangé partout — mais porte en plus le **code métier** du backend (champ `error` d'`ApiError`,
 * ex. `UNIT_HAS_MEMBERS`). Un écran qui doit RÉAGIR à un motif précis teste `code`, jamais le
 * texte du message : celui-ci est traduit et reformulé, il ne fait pas contrat.
 */
export class ApiRequestError extends Error {
  constructor(message: string, readonly code: string | null, readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Code métier d'une erreur d'API, ou `null` si l'échec n'en portait pas. */
export function apiErrorCode(e: unknown): string | null {
  return e instanceof ApiRequestError ? e.code : null;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: authHeaders(init?.headers),
  });
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { /* not json */ }
    const message = body?.message || body?.detail || `HTTP ${res.status}`;
    throw new ApiRequestError(message, body?.error ?? null, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
