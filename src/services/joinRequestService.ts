import { apiFetch } from "./api";

// Demandes de rattachement à une assemblée — le back-office (SUPER_ADMIN) approuve
// (si structureRequestId non null, l'assemblée est créée automatiquement dans la foulée
// puis le demandeur est rattaché) ou refuse avec motif obligatoire.

export type JoinRequestRole = "MEMBER" | "LEADER";
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

// Mirrors com.excellence.back.org.joinrequest.dto.JoinRequestResponse (backend).
export interface JoinRequestResponse {
  id: string;
  userId: string;
  userName: string | null;
  assemblyNodeId: string | null;
  assemblyName: string | null;
  cityName: string | null;
  /** true si l'assemblée visée a déjà un dirigeant titulaire. */
  requestedRole: JoinRequestRole;
  status: JoinRequestStatus;
  /** Non null si la demande porte une assemblée à créer (chaînée à une demande de structure). */
  structureRequestId: string | null;
  newAssemblyName: string | null;
  decidedByName: string | null;
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  /**
   * RG-PAYS-12 (JP 11/11, lot conf-pays) — consentement RGPD horodaté à l'envoi (« J'accepte que mon appartenance à
   * cette assemblée soit visible par ses dirigeants. »). null pour les demandes antérieures au lot. Lecture seule.
   */
  consentAt: string | null;
}

export function fetchPendingJoinRequests(): Promise<JoinRequestResponse[]> {
  return apiFetch<JoinRequestResponse[]>("/api/church/join-requests/pending");
}

export function approveJoinRequest(id: string): Promise<JoinRequestResponse> {
  return apiFetch<JoinRequestResponse>(`/api/church/join-requests/${id}/approve`, {
    method: "POST",
  });
}

export function rejectJoinRequest(id: string, reason: string): Promise<JoinRequestResponse> {
  return apiFetch<JoinRequestResponse>(`/api/church/join-requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
