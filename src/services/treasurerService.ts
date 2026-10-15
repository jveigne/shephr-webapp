import { apiFetch } from "./api";

/**
 * Lot T3 (JP 14/09) — nomination des trésoriers depuis le back-office.
 *
 * Décision J-1 / §0.4 : **le trésorier est une AFFECTATION À UN NŒUD, pas un rang**. Aucun appel
 * d'ici ne touche `goalRole` ni `donationRole` — le rang pastoral ne confère plus rien dans le
 * module Dons, et réciproquement nommer un trésorier ne change aucun rôle Objectifs.
 *
 * Le périmètre effectif (les assemblées vues par le trésorier) n'est JAMAIS calculé ici : le
 * backend le dérive du sous-arbre du nœud à chaque requête (`TreasuryAccessService`). D'où
 * « un trésorier placé plus haut voit plus large », et « une assemblée créée après la nomination
 * y entre seule ».
 */

/**
 * Type du nœud couvert — vocabulaire de l'arbre générique (Chantier B).
 * Mirrors com.excellence.back.org.node.OrgNodeType.
 *
 * ⚠ Ce n'est PAS le vocabulaire des scopes d'abonnement (`SubscriptionScope`), qui reste sur les
 * identifiants legacy COUNTRY / ZONE / LOCALITY / UNIT. Les ids, eux, sont les mêmes des deux
 * côtés (`org_node.id` = id legacy, repris tel quel à la migration) : un id de nation/région/
 * ville/assemblée de l'arbre du back-office est directement un `nodeId` valide ici.
 */
export type TreasurerNodeType = "NATION" | "REGION" | "CITY" | "ASSEMBLY";

/** Mirrors com.excellence.back.donation.treasury.dto.TreasurerAssignmentResponse */
export interface TreasurerAssignmentResponse {
  id: string;
  userId: string;
  userFullName: string | null;
  /** Identifiant de connexion (A1) — distingue deux homonymes dans la liste. */
  userUsername: string | null;
  nodeId: string;
  nodeName: string | null;
  nodeType: TreasurerNodeType;
  ministryId: string;
  active: boolean;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
}

/** Mirrors com.excellence.back.donation.treasury.dto.TreasurerAssignmentRequest */
export interface TreasurerAssignmentRequest {
  userId: string;
  nodeId: string;
}

/**
 * Affectations : d'un nœud (`nodeId`, = les nominations posées LÀ, pas le périmètre effectif),
 * d'une personne (`userId`), ou de tout le ministère de l'appelant sans filtre.
 * `includeInactive` relit les affectations retirées — le retrait est une désactivation, la trace
 * de qui a eu accès aux finances est conservée.
 */
export function listTreasurerAssignments(params?: {
  nodeId?: string;
  userId?: string;
  includeInactive?: boolean;
}): Promise<TreasurerAssignmentResponse[]> {
  const qs = new URLSearchParams();
  if (params?.nodeId) qs.set("nodeId", params.nodeId);
  if (params?.userId) qs.set("userId", params.userId);
  if (params?.includeInactive) qs.set("includeInactive", "true");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<TreasurerAssignmentResponse[]>(`/api/church/admin/treasurers${suffix}`);
}

/**
 * Nomme une personne trésorière d'UN nœud. Idempotent côté serveur : renommer sur le même nœud
 * réactive l'affectation retirée au lieu d'en créer une seconde — on peut donc rejouer l'appel
 * sans crainte de doublon.
 *
 * Erreurs métier à traiter à l'écran : 422 `TREASURER_MINISTRY_MISMATCH` (la personne n'est pas du
 * ministère du nœud), 403 (nœud hors ministère de l'appelant, ou appelant ni SECRETARIAT ni
 * SUPER_ADMIN).
 */
export function assignTreasurer(body: TreasurerAssignmentRequest): Promise<TreasurerAssignmentResponse> {
  return apiFetch<TreasurerAssignmentResponse>("/api/church/admin/treasurers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Retire une affectation — DÉSACTIVATION, jamais suppression. L'effet est immédiat : le périmètre
 * est relu en base à chaque requête, aucun claim JWT n'est en cause, la personne n'a pas à se
 * reconnecter pour perdre l'accès.
 */
export function revokeTreasurer(id: string): Promise<void> {
  return apiFetch<void>(`/api/church/admin/treasurers/${id}`, { method: "DELETE" });
}
