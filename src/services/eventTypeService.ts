import { apiFetch } from "./api";

// RG-EVT-01 (JP 14/10) — Types d'évènement : catalogue propre à chaque ministère, géré par
// SUPER_ADMIN uniquement. Endpoints /admin/event-types (garde /admin/** = SUPER_ADMIN, pas de
// @RequiresModule : le catalogue se prépare avant même qu'un ministère souscrive à EVENTS).
// D-EVT-01 — une « action d'évangélisation » est un évènement dont le type porte `evangelism`.

// Mirrors com.excellence.back.events.admin.dto.EventTypeAdminDtos.EventTypeResponse
export interface EventTypeResponse {
  id: string;
  ministryId: string;
  /** Clé technique : majuscules, chiffres, « _ » (ex. `CULTE_REGIONAL`), unique dans le ministère. */
  code: string;
  name: string;
  /** null = pas de libellé anglais : les clients retombent sur `name`. */
  nameEn: string | null;
  /** D-EVT-03 — seuls les évènements DONE d'un type évangélique entrent dans les statistiques. */
  evangelism: boolean;
  /** RG-EVT-01 — type « Autre » : libellé libre obligatoire à la saisie. */
  requiresLabel: boolean;
  /** Désactivé = retiré de la saisie, jamais des évènements passés. */
  active: boolean;
  orderIndex: number;
  /** Au moins un évènement (même supprimé) référence le type : il ne se supprime plus, il se désactive. */
  inUse: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

// Mirrors com.excellence.back.events.admin.dto.EventTypeAdminDtos.CreateEventTypeRequest
export interface CreateEventTypeRequest {
  ministryId: string;
  code: string;
  name: string;
  nameEn?: string | null;
  evangelism: boolean;
  requiresLabel: boolean;
  /** Absent = rangé après les types existants du ministère. */
  orderIndex?: number | null;
}

/**
 * Mirrors com.excellence.back.events.admin.dto.EventTypeAdminDtos.UpdateEventTypeRequest —
 * PATCH : champs absents = inchangés ; `nameEn: ""` = retirer le libellé anglais.
 * Le ministère n'est pas modifiable (un type ne change pas de catalogue).
 */
export interface UpdateEventTypeRequest {
  code?: string;
  name?: string;
  nameEn?: string;
  evangelism?: boolean;
  requiresLabel?: boolean;
  orderIndex?: number;
  active?: boolean;
}

export function listEventTypes(ministryId?: string): Promise<EventTypeResponse[]> {
  const q = ministryId ? `?ministryId=${encodeURIComponent(ministryId)}` : "";
  return apiFetch<EventTypeResponse[]>(`/admin/event-types${q}`);
}

/** 422 `EVENT_TYPE_CODE_EXISTS` si le code est déjà pris dans le ministère, `INVALID_EVENT_TYPE_CODE` s'il est mal formé. */
export function createEventType(req: CreateEventTypeRequest): Promise<EventTypeResponse> {
  return apiFetch<EventTypeResponse>("/admin/event-types", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function updateEventType(id: string, patch: UpdateEventTypeRequest): Promise<EventTypeResponse> {
  return apiFetch<EventTypeResponse>(`/admin/event-types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** RG-EVT-01 — 422 `EVENT_TYPE_IN_USE` si un évènement référence le type : le désactiver à la place. */
export function deleteEventType(id: string): Promise<void> {
  return apiFetch<void>(`/admin/event-types/${id}`, { method: "DELETE" });
}
