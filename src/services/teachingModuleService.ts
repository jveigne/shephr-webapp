import { apiFetch } from "./api";

// D-ASM-10 (JP 23/09) — Modules d'enseignement propres à chaque ministère, gérés par SUPER_ADMIN
// uniquement (RG-ASM-01). Endpoints /admin/teaching-modules (garde /admin/** = SUPER_ADMIN).

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
  active: boolean;
  orderIndex: number;
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
} & TeachingContent;

// Mirrors com.excellence.back.assembly.admin.dto.TeachingModuleAdminDtos.UpdateTeachingModuleRequest
export interface UpdateTeachingModuleRequest {
  name?: string;
  bookTitle?: string;
  active?: boolean;
  orderIndex?: number;
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
 * 422 `CHAPTER_ALREADY_READ` si on retire un chapitre déjà lu (RG-ASM-02).
 */
export function replaceTeachingContent(id: string, content: TeachingContent): Promise<TeachingModuleResponse> {
  return apiFetch<TeachingModuleResponse>(`/admin/teaching-modules/${id}/chapters`, {
    method: "PUT",
    body: JSON.stringify(content),
  });
}
