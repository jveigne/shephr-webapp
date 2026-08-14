import type { NodeLevel } from "./orgTree";
import type { ModuleRole } from "@/services/userService";

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

/**
 * Rôles dont le rattachement est un SET (home + autres), et non une entité unique.
 * <p>Palier A2 (JP 14/08) : le DIRIGEANT_UNITE rejoint le DIRIGEANT (villes) et le SENIOR
 * (régions) — un dirigeant peut tenir plusieurs assemblées de maison. Le MEMBRE en est exclu :
 * il appartient à une seule assemblée. Règle partagée par la page Utilisateurs et le drawer
 * Responsables, qui écrivent tous deux `reassign { entityId, entityIds }`.
 */
export function isMultiAttachmentRole(role: ModuleRole): boolean {
  return role === "DIRIGEANT_UNITE" || role === "DIRIGEANT" || role === "DIRIGEANT_SENIOR";
}

// La règle « responsable d'un nœud » (rattachement Objectifs OU Dons, home ou multiple) vit
// désormais CÔTÉ SERVEUR — endpoints /api/church/admin/users/responsables et /responsable-counts.
// Elle ne peut plus être évaluée ici : le back-office ne charge plus l'annuaire complet, et une
// seconde copie de la règle dériverait de la première.

/** Rattachement Goals dérivé du nœud + rôle (les autres modules ne sont pas touchés). */
export function buildGoalAttachment(level: NodeLevel, nodeId: string, role: ModuleRole) {
  const base: { goalRole: ModuleRole; goalUnitId?: string; goalUnitIds?: string[]; goalCityId?: string; goalZoneId?: string; goalCountryIds?: string[] } = { goalRole: role };
  if (level === "UNIT") {
    base.goalUnitId = nodeId;
    // Palier A2 (JP 14/08) : un dirigeant d'unité porte un SET d'assemblées (home comprise).
    // Sans `goalUnitIds`, un rattachement posé ici restait invisible du multi-assemblées.
    // Un MEMBRE, lui, n'appartient qu'à une seule assemblée : on ne lui pose pas de set.
    if (role === "DIRIGEANT_UNITE") base.goalUnitIds = [nodeId];
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
