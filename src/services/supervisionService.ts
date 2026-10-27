import { apiFetch } from "./api";

// D-HIE-08 (JP 28/10, lot HIE) — back-office « Supervision » : HISTORIQUE des demandes de supervision
// DESCENDANTES (un dirigeant désigne un dirigeant qu'il suivra, validées par le désigné — D-HIE-02) et vue
// « Dirigeants » (repérer qui pourrait avoir besoin de l'offre Caleb `HIERARCHIE_SUIVI`). Routes
// `/admin/supervision-requests/**` (garde `/admin/**` = SUPER_ADMIN), LECTURE SEULE (RG-HIE-34) : aucune
// fonction d'écriture ici. Contrat : cmfipraise-backend docs/shephr/28_10_2026/01_Plan_Hierarchie_3_Pages.md §5, §6.
// ⚠ Axe CHAÎNE de leadership (`supervisor_id`), jamais la géographie (D-ABO-31).

/**
 * Mirrors com.excellence.back.org.leaders.supervision.SupervisionRequestStatus — RG-HIE-09 :
 * `PENDING → ACCEPTED | REFUSED | CANCELED` ; `ACCEPTED → REVOKED | REPLACED`.
 */
export type SupervisionRequestStatus = "PENDING" | "ACCEPTED" | "REFUSED" | "CANCELED" | "REVOKED" | "REPLACED";

export const SUPERVISION_STATUSES: SupervisionRequestStatus[] = [
  "PENDING", "ACCEPTED", "REFUSED", "CANCELED", "REVOKED", "REPLACED",
];

/** Mirrors com.excellence.back.org.leaders.supervision.SupervisionDtos.AdminSupervisionRequestRow (RG-HIE-30). */
export interface AdminSupervisionRequestRow {
  id: string;
  ministryId: string;
  ministryName: string | null;
  status: SupervisionRequestStatus;
  requesterId: string;
  requesterName: string | null;
  requesterEmail: string | null;
  designeeId: string;
  designeeName: string | null;
  designeeEmail: string | null;
  /** Superviseur du désigné écarté à la validation (D-HIE-03), null sinon. */
  previousSupervisorName: string | null;
  /** Auteur de la transition finale (refus, annulation, retrait, remplacement), null sinon. */
  endedByName: string | null;
  /** Instants ISO. */
  createdAt: string;
  decidedAt: string | null;
  closedAt: string | null;
}

/** Mirrors com.excellence.back.org.leaders.supervision.SupervisionDtos.AdminSupervisionLeaderRow. */
export interface AdminSupervisionLeaderRow {
  userId: string;
  fullName: string | null;
  email: string | null;
  ministryId: string | null;
  ministryName: string | null;
  /** Comptes dont `supervisor_id` = lui, quelle que soit l'origine du lien (P-HIE-b). */
  followedCount: number;
  /** Ses demandes ACCEPTED (en cours). */
  acceptedCount: number;
  /** Ses demandes PENDING. */
  pendingCount: number;
  /** Ses demandes REFUSED. */
  refusedCount: number;
  /** `EntitlementService.hasPersonalCode(user, HIERARCHIE_SUIVI)` — calculé par le serveur. */
  hasHierarchySuivi: boolean;
}

/** Page Spring (même forme que `BillingPage<T>`), `page` 0-based. */
export interface SupervisionPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
}

export interface SupervisionRequestQuery {
  ministryId?: string;
  status?: SupervisionRequestStatus;
  /** Nom / email / identifiant du demandeur OU du désigné. */
  search?: string;
  /** `YYYY-MM-DD`, sur `created_at`, Europe/Paris, bornes incluses. */
  from?: string;
  to?: string;
  page?: number;
  /** Défaut 25, max 100 (serveur). */
  size?: number;
}

export interface SupervisionLeaderQuery {
  ministryId?: string;
  search?: string;
  /** Absent = tous. */
  hasHierarchySuivi?: boolean;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

const BASE = "/admin/supervision-requests";

/** Historique, tri `createdAt` décroissant (serveur). */
export function listSupervisionRequests(q: SupervisionRequestQuery): Promise<SupervisionPage<AdminSupervisionRequestRow>> {
  return apiFetch<SupervisionPage<AdminSupervisionRequestRow>>(
    `${BASE}${qs({
      ministryId: q.ministryId, status: q.status, search: q.search?.trim(),
      from: q.from, to: q.to, page: q.page ?? 0, size: q.size ?? 25,
    })}`,
  );
}

/** ≤ 500 lignes, tri `followedCount` décroissant puis nom (serveur). */
export function listSupervisionLeaders(q: SupervisionLeaderQuery): Promise<AdminSupervisionLeaderRow[]> {
  return apiFetch<AdminSupervisionLeaderRow[]>(
    `${BASE}/leaders${qs({ ministryId: q.ministryId, search: q.search?.trim(), hasHierarchySuivi: q.hasHierarchySuivi })}`,
  );
}
