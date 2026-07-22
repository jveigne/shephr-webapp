import { apiFetch } from "./api";

// Demandes de création de structure (RDG 22/07/2026 — cmfipraise-backend/docs/shephr/22_07_2026).
// Le back-office (SUPER_ADMIN) valide/refuse ; la validation crée l'entité (legacy + org_node).

export type StructureRequestType = "REGION" | "CITY" | "ASSEMBLY";
export type StructureRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

// Mirrors com.excellence.back.org.request.dto.StructureRequestResponse
export interface StructureRequestResponse {
  id: string;
  type: StructureRequestType;
  parentId: string | null;
  /** RG-DS-08 — parent EN ATTENTE (maillon de chaîne) ; null si le parent existe déjà. */
  parentRequestId: string | null;
  /** true si le parent est lui-même une demande à valider (« à créer »). */
  parentPending: boolean;
  parentName: string | null;
  name: string;
  status: StructureRequestStatus;
  requestedById: string;
  requestedByName: string | null;
  decidedByName: string | null;
  decisionReason: string | null;
  createdEntityId: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export function listPendingRequests(): Promise<StructureRequestResponse[]> {
  return apiFetch<StructureRequestResponse[]>("/api/church/structure-requests/pending");
}

export function approveRequest(id: string): Promise<StructureRequestResponse> {
  return apiFetch<StructureRequestResponse>(`/api/church/structure-requests/${id}/approve`, {
    method: "POST",
  });
}

export function rejectRequest(id: string, reason: string): Promise<StructureRequestResponse> {
  return apiFetch<StructureRequestResponse>(`/api/church/structure-requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
