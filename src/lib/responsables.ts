import type { NodeLevel } from "./orgTree";
import type { AdminUserResponse, ModuleRole } from "@/services/userService";

// Rôle naturel par niveau (Lot 3.5 + Lot Team). LOCALITY n'est pas un niveau de rattachement.
// Mapping cible : Team→DIRIGEANT (team leader), Unité→DIRIGEANT_UNITE/MEMBRE.
export const RESP_ROLES_BY_LEVEL: Record<NodeLevel, ModuleRole[]> = {
  MINISTRY: ["LEADER", "SECRETARIAT"],
  COUNTRY: ["DIRIGEANT_COORDINATEUR"],
  ZONE: ["DIRIGEANT_SENIOR"],
  TEAM: ["DIRIGEANT"],
  LOCALITY: [],
  UNIT: ["DIRIGEANT_UNITE", "MEMBRE"],
};

export function canHaveResponsables(level: NodeLevel): boolean {
  return RESP_ROLES_BY_LEVEL[level].length > 0;
}

/** Un user est « responsable » d'un nœud si son rattachement (Goals ou Dons) pointe vers ce nœud. */
export function isResponsableOf(u: AdminUserResponse, level: NodeLevel, nodeId: string): boolean {
  const has = (arr: string[] | undefined, id: string) => (arr ?? []).includes(id);
  switch (level) {
    case "UNIT":
      return u.goalUnitId === nodeId || has(u.goalUnitIds, nodeId) || u.donationUnitId === nodeId || has(u.donationUnitIds, nodeId);
    case "TEAM":
      return u.goalTeamId === nodeId || u.donationTeamId === nodeId;
    case "ZONE":
      return u.goalZoneId === nodeId || u.donationZoneId === nodeId;
    case "COUNTRY":
      return has(u.goalCountryIds, nodeId) || has(u.donationCountryIds, nodeId) || has(u.coordinatedCountryIds, nodeId);
    case "MINISTRY":
      return ["LEADER", "SECRETARIAT"].includes(u.goalRole ?? "") || ["LEADER", "SECRETARIAT"].includes(u.donationRole ?? "");
    default:
      return false;
  }
}

/** Rattachement Goals dérivé du nœud + rôle (les autres modules ne sont pas touchés). */
export function buildGoalAttachment(level: NodeLevel, nodeId: string, role: ModuleRole) {
  const base: { goalRole: ModuleRole; goalUnitId?: string; goalUnitIds?: string[]; goalTeamId?: string; goalZoneId?: string; goalCountryIds?: string[] } = { goalRole: role };
  if (level === "UNIT") {
    base.goalUnitId = nodeId;
  } else if (level === "TEAM") {
    base.goalTeamId = nodeId;
  } else if (level === "ZONE") {
    base.goalZoneId = nodeId;
  } else if (level === "COUNTRY") {
    base.goalCountryIds = [nodeId];
  }
  // MINISTRY (LEADER/SECRETARIAT) : pas de rattachement géo.
  return base;
}
