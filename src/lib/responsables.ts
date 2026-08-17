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

/**
 * Ce rôle exige-t-il de choisir une assemblée de rattachement PERSONNEL à part de l'entité dirigée ?
 *
 * <p>RG-BQ-03 : tout compte du module Objectifs déclare ses propres engagements dans une assemblée,
 * quel que soit son rang — un coordinateur de nation ou un SECRETARIAT y est astreint comme un
 * membre. Pour `MEMBRE` et `DIRIGEANT_UNITE`, l'entité dirigée EST l'assemblée : le champ ferait
 * doublon, le backend la déduit de `entityId`. Pour tous les autres, sans ce champ l'écriture part
 * sans `goalUnitId` et le backend répond `GOAL_UNIT_REQUIRED` (422).
 */
export function needsHomeAssembly(role: ModuleRole): boolean {
  return role !== "MEMBRE" && role !== "DIRIGEANT_UNITE";
}

// La règle « responsable d'un nœud » (rattachement Objectifs OU Dons, home ou multiple) vit
// désormais CÔTÉ SERVEUR — endpoints /api/church/admin/users/responsables et /responsable-counts.
// Elle ne peut plus être évaluée ici : le back-office ne charge plus l'annuaire complet, et une
// seconde copie de la règle dériverait de la première.

/**
 * Rattachement Goals dérivé du nœud + rôle (les autres modules ne sont pas touchés).
 *
 * <p>Deux rattachements DISTINCTS y cohabitent depuis RG-BQ-03 (16/08) :
 * <ul>
 *   <li>l'entité <b>dirigée</b>, dérivée du nœud (`goalCityId`, `goalZoneId`, `goalCountryIds`) ;</li>
 *   <li>l'assemblée de rattachement <b>personnel</b> (`goalUnitId`), où la personne déclare SES
 *       propres engagements — obligatoire pour TOUT compte du module Objectifs, coordinateur,
 *       LEADER et SECRETARIAT compris, sous peine de `GOAL_UNIT_REQUIRED` (422).</li>
 * </ul>
 *
 * <p>Au niveau `UNIT`, le nœud EST l'assemblée personnelle : `homeUnitId` y est superflu et ignoré.
 * Aux autres niveaux, il faut le passer explicitement — sinon le compte part sans assemblée.
 *
 * @param homeUnitId assemblée personnelle ; omis, aucun `goalUnitId` n'est envoyé (le backend
 *                   conserve alors l'existant sur `reassign`, mais REFUSE une invitation).
 */
export function buildGoalAttachment(level: NodeLevel, nodeId: string, role: ModuleRole, homeUnitId?: string) {
  const base: { goalRole: ModuleRole; goalUnitId?: string; goalUnitIds?: string[]; goalCityId?: string; goalZoneId?: string; goalCountryIds?: string[] } = { goalRole: role };
  if (level === "UNIT") {
    base.goalUnitId = nodeId;
    // Palier A2 (JP 14/08) : un dirigeant d'unité porte un SET d'assemblées (home comprise).
    // Sans `goalUnitIds`, un rattachement posé ici restait invisible du multi-assemblées.
    // Un MEMBRE, lui, n'appartient qu'à une seule assemblée : on ne lui pose pas de set.
    if (role === "DIRIGEANT_UNITE") base.goalUnitIds = [nodeId];
    return base;
  }
  // Niveaux au-dessus de l'assemblée : le nœud est l'entité DIRIGÉE, l'appartenance se pose à part.
  if (homeUnitId) base.goalUnitId = homeUnitId;
  if (level === "LOCALITY") {
    base.goalCityId = nodeId;
  } else if (level === "ZONE") {
    base.goalZoneId = nodeId;
  } else if (level === "COUNTRY") {
    base.goalCountryIds = [nodeId];
  }
  // MINISTRY (LEADER/SECRETARIAT) : pas de rattachement géo.
  return base;
}
