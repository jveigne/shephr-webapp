import type { NodeLevel } from "./orgTree";
import type { AdminUserResponse, ModuleRole } from "@/services/userService";

// Rôle naturel par niveau (Chantier B, décision #7) : COORDINATEUR=Nation · SENIOR=Région/État ·
// DIRIGEANT=Ville (ex-team leader) · DIRIGEANT_UNITE=Assemblée de maison.
export const RESP_ROLES_BY_LEVEL: Record<NodeLevel, ModuleRole[]> = {
  MINISTRY: ["LEADER", "SECRETARIAT"],
  COUNTRY: ["DIRIGEANT_COORDINATEUR"],
  ZONE: ["DIRIGEANT_SENIOR"],
  LOCALITY: ["DIRIGEANT"],
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
    case "LOCALITY":
      return u.goalCityId === nodeId || u.donationCityId === nodeId;
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
  const base: { goalRole: ModuleRole; goalUnitId?: string; goalUnitIds?: string[]; goalCityId?: string; goalZoneId?: string; goalCountryIds?: string[] } = { goalRole: role };
  if (level === "UNIT") {
    base.goalUnitId = nodeId;
  } else if (level === "LOCALITY") {
    base.goalCityId = nodeId;
  } else if (level === "ZONE") {
    base.goalZoneId = nodeId;
  } else if (level === "COUNTRY") {
    base.goalCountryIds = [nodeId];
  }
  // MINISTRY (LEADER/SECRETARIAT) : pas de rattachement géo.
  return base;
}
