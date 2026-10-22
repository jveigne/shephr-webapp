import { apiFetch } from "./api";
import type { Language } from "./orgService";

// D-ASM-10 (JP 23/09) — Modules d'enseignement propres à chaque ministère, gérés par SUPER_ADMIN
// uniquement (RG-ASM-01). Endpoints /admin/teaching-modules (garde /admin/** = SUPER_ADMIN).
// D-ETU-01 / D-ETU-02 (JP 21/10) — Étude de l'assemblée : un module est une « unité » d'étude
// (`code`, prérequis), un chapitre une « leçon » (`portion`, questions). Contrat figé :
// cmfipraise-backend/docs/shephr/21_10_2026/02_Contrat_API_Etude.md §3 (D-ETU-15 : pas de page à part).

// Mirrors com.excellence.back.assembly.StudyQuestion.Type (RG-ETU-20) — mêmes noms dans les trois fronts (§8).
export type StudyQuestionType = "VRAI_FAUX" | "OUI_NON" | "CHOIX_UNIQUE" | "CHOIX_MULTIPLE"
  | "OUVERTE" | "PERSONNELLE" | "EXERCICE" | "CONSIGNE";
// Mirrors com.excellence.back.assembly.StudyQuestion.AnswerFormat — PERSONNELLE seulement.
export type StudyAnswerFormat = "TEXT" | "YES_NO";
// Mirrors com.excellence.back.assembly.StudyQuestion.Option
export interface StudyOption { key: string; label: string }
// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.StudyOptionDto
export type StudyOptionDto = StudyOption;

// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.TeachingChapterResponse
export interface TeachingChapterResponse {
  id: string;
  /** Partie du chapitre ; null si le module n'a pas de parties. */
  partId: string | null;
  /** Unique dans la partie (JP 24/09 : la numérotation repart à 1 dans chaque partie), ou dans le module sans parties. */
  number: number;
  title: string | null;
  orderIndex: number;
  /** RG-ASM-02 — lu dans au moins une réunion : ne peut plus être retiré (seulement renommé). */
  read: boolean;
  /** D-ETU-02 — portion du livre lue avant la leçon (« Préface et chapitre 1 »). */
  portion: string | null;
  /** Nombre de questions de la leçon (0 = chapitre de lecture seule, hors catalogue d'étude). */
  questionCount: number;
  /** RG-ETU-23 — a au moins une séance d'étude : comme `read`, interdit de retirer le chapitre. */
  studied: boolean;
}

// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.TeachingPartResponse
export interface TeachingPartResponse {
  id: string;
  number: number;
  title: string | null;
  orderIndex: number;
  /** Au moins un de ses chapitres a été lu : la partie ne peut plus être retirée. */
  read: boolean;
}

// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.TeachingModuleResponse
export interface TeachingModuleResponse {
  id: string;
  ministryId: string;
  name: string;
  bookTitle: string;
  /** D-ETU-17 — publication de l'unité d'étude ; activer exige un contenu cohérent (RG-ETU-22). */
  active: boolean;
  orderIndex: number;
  /**
   * D-ETU-01 — ex. « UEMB002 » ; null pour un module de lecture seule. D-ETU-25 (JP 21/10) : unique
   * par (ministère, code, langue) — les versions FR / EN d'une unité portent le même code.
   */
  code: string | null;
  /** D-ETU-25 (JP 21/10) — langue de cette version de l'unité (défaut `FR`). */
  language: Language;
  /** D-ETU-19 — unité à terminer (dans l'assemblée) avant d'ouvrir une leçon de celle-ci. */
  prerequisiteModuleId: string | null;
  /** Vide = module sans parties ; sinon chaque chapitre porte son partId. */
  parts: TeachingPartResponse[];
  /** Tous les chapitres du module, triés par orderIndex (rang dans le module entier). */
  chapters: TeachingChapterResponse[];
  createdAt: string | null;
  updatedAt: string | null;
}

// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.ChapterInput
export interface ChapterInput {
  number: number;
  title?: string | null;
  /** D-ETU-02 — portion du livre (≤ 300). */
  portion?: string | null;
}

// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.PartInput
export interface PartInput {
  number: number;
  title?: string | null;
  chapters: ChapterInput[];
}

/**
 * Contenu d'un module (RG-ASM-01 v2, JP 24/09) : `chapters` (module sans parties) OU `parts` —
 * exactement l'un des deux, sinon 422 `CHAPTERS_OR_PARTS_REQUIRED`.
 */
export type TeachingContent = { chapters: ChapterInput[]; parts?: undefined } | { parts: PartInput[]; chapters?: undefined };

// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.CreateTeachingModuleRequest
export type CreateTeachingModuleRequest = {
  ministryId: string;
  name: string;
  bookTitle: string;
  /** ≤ 20 ; doublon (code, langue) dans le ministère → 422 `TEACHING_MODULE_CODE_EXISTS`. */
  code?: string | null;
  /** D-ETU-25 (JP 21/10) — facultatif, défaut `FR`. */
  language?: Language | null;
  /** RG-ETU-24 — même ministère, pas soi-même, pas de cycle (422 `STUDY_PREREQUISITE_INVALID`). */
  prerequisiteModuleId?: string | null;
} & TeachingContent;

// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.UpdateTeachingModuleRequest
export interface UpdateTeachingModuleRequest {
  name?: string;
  bookTitle?: string;
  /** `true` : contrôle complet RG-ETU-22 → 422 `STUDY_CONTENT_INVALID` (message = liste des questions fautives). */
  active?: boolean;
  orderIndex?: number;
  /** PATCH : absent = inchangé ; pour remettre à null, `clearCode` / `clearPrerequisite = true`. */
  code?: string;
  prerequisiteModuleId?: string;
  clearCode?: boolean;
  clearPrerequisite?: boolean;
  /** D-ETU-25 (JP 21/10) — absent = inchangé ; (code, langue) déjà pris → 422 `TEACHING_MODULE_CODE_EXISTS`. */
  language?: Language;
}

// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.StudyQuestionInput
export interface StudyQuestionInput {
  /** ≤ 10, unique dans la leçon (`"6.b"`) — 422 `DUPLICATE_QUESTION_NUMBER`. */
  number: string;
  /** Sous-question : numéro du parent (même leçon, un seul niveau) — 422 `STUDY_QUESTION_INVALID`. */
  parentNumber?: string | null;
  statement: string;
  type: StudyQuestionType;
  /** Ignoré hors `PERSONNELLE`. */
  answerFormat?: StudyAnswerFormat | null;
  /** Ignorées hors choix (`CHOIX_UNIQUE` / `CHOIX_MULTIPLE`). */
  options?: StudyOptionDto[] | null;
  /** `["VRAI"]` · `["OUI"]` · `["d"]` · `["b","c","f","g"]`. */
  answerKey?: string[] | null;
  /** Réponse du manuel (montrée à la correction, RG-ETU-12). */
  expectedAnswer?: string | null;
  /** ≥ 0, 2 décimales au plus ; remis à 0 pour `EXERCICE` / `CONSIGNE` (RG-ETU-09). */
  points: number;
  /** ≤ 200. */
  bibleReference?: string | null;
}

// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.StudyQuestionAdmin
export interface StudyQuestionAdmin {
  id: string;
  number: string;
  parentId: string | null;
  parentNumber: string | null;
  statement: string;
  type: StudyQuestionType;
  answerFormat: StudyAnswerFormat | null;
  options: StudyOptionDto[] | null;
  answerKey: string[] | null;
  expectedAnswer: string | null;
  points: number;
  bibleReference: string | null;
  orderIndex: number;
  /** RG-ETU-23 — a des réponses : non supprimable (reste modifiable). */
  answered: boolean;
  /** Défauts RG-ETU-22, toujours calculés (même module inactif) ; vide = cohérente. */
  issues: string[];
}

// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.StudyImportLesson
export interface StudyImportLesson {
  number: number;
  title?: string | null;
  portion?: string | null;
  questions?: StudyQuestionInput[] | null;
}

// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.StudyImportRequest
export interface StudyImportRequest {
  ministryId: string;
  code: string;
  name: string;
  bookTitle: string;
  /** D-ETU-25 (JP 21/10) — facultatif, défaut `FR` ; lu dans le fichier s'il y figure. */
  language?: Language | null;
  prerequisiteModuleId?: string | null;
  lessons: StudyImportLesson[];
}

export function listTeachingModules(ministryId?: string): Promise<TeachingModuleResponse[]> {
  const q = ministryId ? `?ministryId=${encodeURIComponent(ministryId)}` : "";
  return apiFetch<TeachingModuleResponse[]>(`/admin/teaching-modules${q}`);
}

export function createTeachingModule(req: CreateTeachingModuleRequest): Promise<TeachingModuleResponse> {
  return apiFetch<TeachingModuleResponse>("/admin/teaching-modules", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function updateTeachingModule(id: string, patch: UpdateTeachingModuleRequest): Promise<TeachingModuleResponse> {
  return apiFetch<TeachingModuleResponse>(`/admin/teaching-modules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/**
 * Remplace le contenu complet (et ordonné) du module — corps `ReplaceChaptersRequest { chapters }`
 * ou `{ parts }`. Un chapitre est identifié par (numéro de partie, numéro).
 * 422 `CHAPTER_ALREADY_READ` si on retire un chapitre déjà lu (RG-ASM-02) ou étudié (RG-ETU-23).
 */
export function replaceTeachingContent(id: string, content: TeachingContent): Promise<TeachingModuleResponse> {
  return apiFetch<TeachingModuleResponse>(`/admin/teaching-modules/${id}/chapters`, {
    method: "PUT",
    body: JSON.stringify(content),
  });
}

/** Questions d'une leçon, par `orderIndex`, avec leurs `issues` (RG-ETU-22) pour la relecture. */
export function listChapterQuestions(moduleId: string, chapterId: string): Promise<StudyQuestionAdmin[]> {
  return apiFetch<StudyQuestionAdmin[]>(`/admin/teaching-modules/${moduleId}/chapters/${chapterId}/questions`);
}

/**
 * Remplace la liste **complète** des questions d'une leçon, dans l'ordre d'affichage (un parent
 * précède ses sous-questions). Rapprochement par `number` : les ids des questions gardées restent
 * stables. RG-ETU-21 — structure seule contrôlée sur un module inactif ; module actif : contrôle
 * complet RG-ETU-22 (422 `STUDY_CONTENT_INVALID`). Retirer une question répondue → 422
 * `STUDY_QUESTION_ANSWERED` (RG-ETU-23).
 */
export function replaceChapterQuestions(moduleId: string, chapterId: string, questions: StudyQuestionInput[]): Promise<StudyQuestionAdmin[]> {
  return apiFetch<StudyQuestionAdmin[]>(`/admin/teaching-modules/${moduleId}/chapters/${chapterId}/questions`, {
    method: "PUT",
    body: JSON.stringify({ questions }),
  });
}

/**
 * D-ETU-16 / RG-ETU-25 — import JSON d'une unité : crée un module **inactif** (D-ETU-17), sans
 * parties, une leçon par entrée. Transaction unique ; (code, langue) déjà pris → 422
 * `TEACHING_MODULE_CODE_EXISTS` (D-ETU-25).
 */
export function importStudyModule(req: StudyImportRequest): Promise<TeachingModuleResponse> {
  return apiFetch<TeachingModuleResponse>("/admin/teaching-modules/import", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
