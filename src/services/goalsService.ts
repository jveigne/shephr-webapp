import { apiFetch } from "./api";

/**
 * But Quinquennal — la SEULE portion du module Objectifs que le back-office consomme.
 *
 * <p>Depuis RG-BQ-01 (16/08), un engagement est strictement personnel : `level` vaut toujours
 * `MEMBER` et `targetEntityId` toujours le `userId` du déclarant. Il n'existe plus d'engagement
 * d'assemblée, plus d'engagement de foi, plus de notion de « source » — un niveau de l'arbre n'est
 * qu'une somme. Ne pas réintroduire ces concepts ici.
 *
 * <p>Le back-office porte les DEUX recours de RG-BQ-08, qui ne se confondent pas :
 * <ul>
 *   <li><b>rouvrir</b> (`POST /member/{memberId}/unlock`) — la personne corrige elle-même ;</li>
 *   <li><b>corriger</b> (`POST /member/{memberId}/pledges`, palier G4) — le secrétariat écrit à sa
 *       place, sans attendre qu'elle soit joignable. L'écriture aboutit MÊME verrouillée et ne lève
 *       PAS le verrou : la réponse revient avec `locked: true`.</li>
 * </ul>
 *
 * <p>La date limite ne bloque pas la correction — non par exception codée, mais parce que les seuls
 * profils admis (superAdmin / SECRETARIAT) en sont déjà exemptés. `DEADLINE_PASSED` (422) continue
 * de frapper la personne sur `/me/pledges` : c'est précisément ce qui déclenche le recours.
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
 * (RG-BQ-08). L'autre branche du même besoin est {@link createMemberPledge}, qui écrit à sa place.
 */
export function unlockMember(memberId: string, year?: number): Promise<void> {
  const q = year ? `?year=${year}` : "";
  return apiFetch<void>(`/api/church/goals/member/${memberId}/unlock${q}`, { method: "POST" });
}

/** Mirrors com.excellence.back.goals.query.dto.GoalCategoryResponse */
export interface GoalCategoryResponse {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  unitType: PledgeUnitType;
  /** Libellé de l'unité (« âmes », « € »…), tel que défini avec la catégorie. */
  unitLabel: string | null;
  displayOrder: number;
  iconCode: string | null;
}

/** Mirrors com.excellence.back.goals.query.dto.QuinquennatResponse */
export interface QuinquennatResponse {
  year: number;
  /** LocalDate ISO. */
  date: string | null;
}

/**
 * Mirrors com.excellence.back.goals.query.dto.ActiveGoalResponse
 *
 * <p>Consommé ici pour UNE seule raison : connaître les catégories et les années OUVERTES, sans
 * lesquelles le formulaire de correction ne peut rien proposer. `YEAR_NOT_OPEN` (422) n'est
 * contournable par personne, secrétariat compris — mieux vaut ne proposer que `openYears`.
 */
export interface ActiveGoalResponse {
  goalId: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  /** LocalDate ISO. */
  startDate: string | null;
  endDate: string | null;
  /** LocalDateTime ISO. */
  submissionDeadline: string | null;
  defaultCurrency: string | null;
  categories: GoalCategoryResponse[];
  currentYear: number;
  /** Années ouvertes à l'écriture, croissantes. */
  openYears: number[];
  /** Années visibles dans les sélecteurs (orthogonal à `openYears`), croissantes. */
  visibleYears: number[];
  quinquennat: QuinquennatResponse | null;
  /** Deadline effective par année (clé = année) — absente si l'année n'en porte aucune. */
  yearDeadlines: Record<string, string> | null;
}

/** Goal actif, ses catégories et ses années. 404 `RESOURCE_NOT_FOUND` si aucun Goal actif. */
export function getActiveGoal(): Promise<ActiveGoalResponse> {
  return apiFetch<ActiveGoalResponse>("/api/church/goals/active");
}

/** Mirrors com.excellence.back.goals.pledge.dto.CreatePledgeRequest */
export interface CreatePledgeRequest {
  categoryId: string;
  /** Absente = année courante ouverte. */
  year?: number;
  /** Catégorie CURRENCY. */
  targetAmount?: number;
  /** Catégorie COUNT. */
  targetCount?: number;
}

/**
 * Palier G4 — CORRIGE l'engagement d'une personne à sa place (upsert par catégorie + année).
 *
 * <p>Même corps et même réponse que la saisie personnelle : c'est le même geste, fait pour
 * quelqu'un d'autre. Deux conséquences à porter à l'écran :
 * <ul>
 *   <li>corriger ne DÉVERROUILLE pas — la réponse revient `locked: true` si elle l'était ;</li>
 *   <li>`createdById` reste le déclarant d'origine : corriger ne dépossède personne.</li>
 * </ul>
 *
 * <p>Erreurs métier (422) à afficher telles quelles : `YEAR_NOT_OPEN` (rouvrir l'année d'abord),
 * `NO_ASSEMBLY_ATTACHMENT` (la CIBLE n'a pas d'assemblée — la rattacher d'abord),
 * `CATEGORY_GOAL_MISMATCH`, `TARGET_AMOUNT_REQUIRED`, `TARGET_COUNT_REQUIRED`.
 * `PLEDGE_LOCKED` ne sort jamais ici.
 */
export function createMemberPledge(memberId: string, body: CreatePledgeRequest): Promise<PledgeResponse> {
  return apiFetch<PledgeResponse>(`/api/church/goals/member/${memberId}/pledges`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
