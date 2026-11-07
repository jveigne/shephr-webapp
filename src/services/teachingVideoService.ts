import { apiFetch } from "./api";

// D-FIN-16 (JP 06/11) — vidéos des parcours individuels, sur Cloudflare R2 (D-FIN-09). Contrat :
// cmfipraise-backend/docs/shephr/06_11_2026/02_Contrat_API_Enseignement.md §6. Endpoints /admin/teaching-videos
// (garde /admin/** = SUPER_ADMIN). Aucun fichier ne passe par l'API : le navigateur dépose directement au stockage,
// avec l'URL signée du ticket. Un fichier neuf repasse DRAFT : il se regarde avant d'être mis en ligne (§6.4).

// Mirrors com.excellence.back.assembly.TeachingVideo.Status
export type TeachingVideoStatus = "DRAFT" | "UPLOADING" | "PUBLISHED";

// Mirrors com.excellence.back.assembly.admin.dto.TeachingVideoAdminDtos.AdminTeachingVideo
export interface AdminTeachingVideo {
  id: string;
  ministryId: string;
  title: string;
  status: TeachingVideoStatus;
  hasFile: boolean;
  sizeBytes: number | null;
  durationSeconds: number | null;
  hasPoster: boolean;
  /** URL signée d'une heure ; null si pas de vignette ou si le stockage ne répond pas. */
  posterUrl: string | null;
  /** Un dépôt est annoncé et pas encore confirmé. */
  uploadPending: boolean;
  /** Chapitres qui l'utilisent : au moins un → suppression refusée (422 `TEACHING_VIDEO_IN_USE`). */
  chapterCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

// Mirrors com.excellence.back.assembly.admin.dto.TeachingVideoAdminDtos.TeachingVideoUploadTicket
export interface TeachingVideoUploadTicket {
  uploadUrl: string;
  /** À renvoyer tel quel avec le PUT : il est signé. */
  contentType: string;
  expiresAt: string;
  video: AdminTeachingVideo;
}

// Mirrors com.excellence.back.storage.PresignedUrl (contrat §5.13 : TeachingVideoPlay, même forme).
export interface TeachingVideoPlay {
  url: string;
  expiresAt: string;
}

const BASE = "/admin/teaching-videos";

export function listTeachingVideos(ministryId?: string): Promise<AdminTeachingVideo[]> {
  const q = ministryId ? `?ministryId=${encodeURIComponent(ministryId)}` : "";
  return apiFetch<AdminTeachingVideo[]>(`${BASE}${q}`);
}

export function createTeachingVideo(req: { ministryId: string; title: string }): Promise<AdminTeachingVideo> {
  return apiFetch<AdminTeachingVideo>(BASE, { method: "POST", body: JSON.stringify(req) });
}

export function updateTeachingVideo(id: string, req: { title: string }): Promise<AdminTeachingVideo> {
  return apiFetch<AdminTeachingVideo>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(req) });
}

/** §6.3 — `video/mp4`, 2 Go au plus : le serveur juge (422 `TEACHING_VIDEO_INVALID_TYPE` / `TEACHING_VIDEO_TOO_LARGE`). */
export function startVideoUpload(id: string, req: { contentType: string; sizeBytes: number }): Promise<TeachingVideoUploadTicket> {
  return apiFetch<TeachingVideoUploadTicket>(`${BASE}/${id}/upload`, { method: "POST", body: JSON.stringify(req) });
}

/** §6.4 — contrôle la taille reçue, recopie vers une clé neuve, repasse en `DRAFT`. */
export function completeVideoUpload(id: string, req: { durationSeconds: number | null }): Promise<AdminTeachingVideo> {
  return apiFetch<AdminTeachingVideo>(`${BASE}/${id}/upload/complete`, { method: "POST", body: JSON.stringify(req) });
}

/** §6.3 — `image/jpeg` ou `image/png`, 5 Mo au plus. */
export function startPosterUpload(id: string, req: { contentType: string; sizeBytes: number }): Promise<TeachingVideoUploadTicket> {
  return apiFetch<TeachingVideoUploadTicket>(`${BASE}/${id}/poster`, { method: "POST", body: JSON.stringify(req) });
}

export function completePosterUpload(id: string): Promise<AdminTeachingVideo> {
  return apiFetch<AdminTeachingVideo>(`${BASE}/${id}/poster/complete`, { method: "POST" });
}

/** §6.5 — lien de 15 min, tout statut, pour regarder avant de publier ; sans fichier → 404. */
export function getTeachingVideoPreview(id: string): Promise<TeachingVideoPlay> {
  return apiFetch<TeachingVideoPlay>(`${BASE}/${id}/preview`);
}

export function publishTeachingVideo(id: string): Promise<AdminTeachingVideo> {
  return apiFetch<AdminTeachingVideo>(`${BASE}/${id}/publish`, { method: "POST" });
}

/** §6.4 — retire de la ligne **ou** abandonne un dépôt : seule sortie d'un `UPLOADING` sans confirmation. */
export function unpublishTeachingVideo(id: string): Promise<AdminTeachingVideo> {
  return apiFetch<AdminTeachingVideo>(`${BASE}/${id}/unpublish`, { method: "POST" });
}

export function deleteTeachingVideo(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}`, { method: "DELETE" });
}

/** Le stockage n'a pas reçu le fichier. Pas un code du serveur : aucun appel à l'API n'a échoué. */
export class StorageUploadError extends Error {
  constructor(readonly reason: "network" | "rejected" | "aborted", readonly status: number) {
    super(`Storage upload ${reason} (HTTP ${status})`);
    this.name = "StorageUploadError";
  }
}

/**
 * Dépôt direct (contrat §6.4, §10.3), sur le modèle de The Deal Way. `XMLHttpRequest` et non `fetch` : seul
 * `upload.onprogress` donne la progression. **Sans `Authorization`** : l'URL signée suffit, et le jeton de session n'a pas
 * à partir chez le stockage. `onProgress` reçoit une fraction de 0 à 1, ou `null` si le navigateur ne connaît pas le total.
 */
export function putFileToStorage(
  ticket: TeachingVideoUploadTicket,
  file: File,
  onProgress: (fraction: number | null) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // L'écouteur `abort` ne se déclenche pas pour un signal déjà levé : l'envoi partirait quand même.
    if (signal?.aborted) {
      reject(new StorageUploadError("aborted", 0));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.uploadUrl);
    xhr.withCredentials = false;
    xhr.setRequestHeader("Content-Type", ticket.contentType);
    xhr.upload.onprogress = (e) => onProgress(e.lengthComputable && e.total > 0 ? e.loaded / e.total : null);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new StorageUploadError("rejected", xhr.status));
    };
    xhr.onerror = () => reject(new StorageUploadError("network", 0));
    xhr.ontimeout = () => reject(new StorageUploadError("network", 0));
    xhr.onabort = () => reject(new StorageUploadError("aborted", 0));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/**
 * Durée d'un MP4 lue par le navigateur (contrat §6.4, pas de `ffprobe`), avant l'envoi. `null`, jamais une erreur : la durée
 * est facultative, un codec exotique n'empêche pas le dépôt. L'URL d'objet est toujours libérée.
 */
export function readVideoDuration(file: File, timeoutMs = 10_000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}
