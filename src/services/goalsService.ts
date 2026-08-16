import { apiFetch } from "./api";

/**
 * But Quinquennal — la SEULE portion du module Objectifs que le back-office consomme.
 *
 * <p>Depuis RG-BQ-01 (16/08), un engagement est strictement personnel : `level` vaut toujours
 * `MEMBER` et `targetEntityId` toujours le `userId` du déclarant. Il n'existe plus d'engagement
 * d'assemblée, plus d'engagement de foi, plus de notion de « source » — un niveau de l'arbre n'est
 * qu'une somme. Ne pas réintroduire ces concepts ici.
 *
 * <p>Le back-office n'offre que le **recours** de RG-BQ-08 : consulter les engagements d'une
 * personne et les rouvrir pour qu'elle corrige elle-même. L'édition directe par le secrétariat
 * (`POST /member/{memberId}/pledges`) n'est PAS implémentée côté backend — ne pas la câbler.
 *
 * <p>Ces routes portent `@RequiresModule("GOALS")` ; un `superAdmin` a tous les modules, la 403
 * `MODULE_ACCESS_DENIED` ne devrait donc pas se produire ici (et `apiFetch` afficherait de toute
 * façon le message serveur).
 */

/** Mirrors com.excellence.back.goals.PledgeUnitType */
export type PledgeUnitType = "CURRENCY" | "COUNT";

/** Mirrors com.excellence.back.goals.pledge.dto.PledgeResponse */
export interface PledgeResponse {
  id: string;
  goalId: string;
  categoryId: string;
  categoryCode: string;
  /** Vaut TOUJOURS `MEMBER` depuis RG-BQ-01. */
  level: "MEMBER";
  /** = `userId` du déclarant (l'engagement appartient à la personne, pas au lieu). */
  targetEntityId: string;
  year: number;
  targetAmount: number | null;
  targetCount: number | null;
  locked: boolean;
  /** Instant ISO. */
  lockedAt: string | null;
  createdById: string | null;
  createdByName: string | null;
  /** LocalDateTime ISO — date limite d'écriture de l'année. */
  editableUntil: string | null;
  /** Server-driven : `!locked && (secretariat || !deadlinePassed)`. Ne PAS recalculer la règle ici. */
  editable: boolean | null;
}

/** Mirrors com.excellence.back.goals.member.dto.MemberGoalsResponse */
export interface MemberGoalsResponse {
  memberId: string;
  fullName: string;
  year: number;
  /** Liste vide = « aucun engagement déclaré » — à dire explicitement, pas un écran vide. */
  memberPledges: PledgeResponse[];
}

/** Engagements personnels d'une personne pour une année (année courante si absente). */
export function getMemberGoals(memberId: string, year?: number): Promise<MemberGoalsResponse> {
  const q = year ? `?year=${year}` : "";
  return apiFetch<MemberGoalsResponse>(`/api/church/goals/member/${memberId}/goals${q}`);
}

/**
 * Rouvre les engagements d'une personne pour une année : elle peut alors corriger elle-même
 * (RG-BQ-08). C'est l'unique recours du back-office face à un engagement soumis.
 */
export function unlockMember(memberId: string, year?: number): Promise<void> {
  const q = year ? `?year=${year}` : "";
  return apiFetch<void>(`/api/church/goals/member/${memberId}/unlock${q}`, { method: "POST" });
}
