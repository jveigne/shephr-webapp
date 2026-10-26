import { apiFetch, apiFetchMultipart } from "./api";

// D-DOC-07 (JP 18/10) — Back-office du module DOCUMENTS (liseuse + partage par lien universel) :
// SUPER_ADMIN uniquement, routes /admin/documents et /admin/document-categories (garde /admin/** ;
// pas de @RequiresModule : on prépare les documents avant même que le ministère souscrive).
// Contrat : cmfipraise-backend/docs/shephr/18_10_2026/02_Contrat_API_Documents.md §3.
// D-DOC-02 — on ne stocke que des PDF ; D-DOC-03 — le backend découpe l'aperçu (`freePages`
// premières pages) à l'upload ; D-DOC-06 — `freePages` et `open` sont deux champs distincts.

/** Mirrors com.excellence.back.documents.DocumentScopeLevel — D-DOC-08 : MINISTRY (« Tout le ministère », scopeId null) + les 4 niveaux d'OrgLevel. Ordre d'affichage = ordre de déclaration (§2.2). */
export type DocumentScopeLevel = "MINISTRY" | "COUNTRY" | "ZONE" | "LOCALITY" | "UNIT";
export const DOCUMENT_SCOPE_LEVELS: DocumentScopeLevel[] = ["MINISTRY", "COUNTRY", "ZONE", "LOCALITY", "UNIT"];

/** Mirrors com.excellence.back.documents.DocumentStatus — DRAFT → PUBLISHED ↔ UNPUBLISHED (§3.7). */
export type DocumentStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
export const DOCUMENT_STATUSES: DocumentStatus[] = ["DRAFT", "PUBLISHED", "UNPUBLISHED"];

/** Mirrors com.excellence.back.documents.DocumentLanguage — affichage seulement. */
export type DocumentLanguage = "FR" | "EN";
export const DOCUMENT_LANGUAGES: DocumentLanguage[] = ["FR", "EN"];

/**
 * Plafond d'upload (`documents.upload.max-bytes`, 50 Mo, §3.4) : contrôlé AVANT l'envoi pour ne
 * pas pousser 200 Mo vers un 422 `DOC_FILE_TOO_LARGE`. Le backend reste juge.
 */
export const DOCUMENT_MAX_BYTES = 52_428_800;
/** RG-DOC-01c — `freePages` par défaut à la création : min(5, pageCount), appliqué par le backend. */
export const DOCUMENT_DEFAULT_FREE_PAGES = 5;
/** Bornes de saisie du contrat (§3.2, §3.4). */
export const DOCUMENT_LIMITS = { title: 200, description: 1000, author: 120, categoryName: 120 } as const;

// ---------------------------------------------------------------------------------------------
// Catégories (RG-FOLDER-03) — catalogue par ministère, libellé = donnée (name, nameEn → repli name)
// D-DOC-16 (JP 19/10) — les catégories deviennent des DOSSIERS hiérarchiques façon Drive : 3 niveaux
// au plus, par ministère, créés et nommés par SUPER_ADMIN. Routes et types inchangés ; le GET rend
// une liste PLATE (parents avant enfants), l'arbre se construit côté front (lib/documentFolders).
// Un document est dans UN dossier (`categoryId`), à n'importe quel niveau.
// ---------------------------------------------------------------------------------------------

/** D-DOC-16 (JP 19/10) — profondeur maximale d'un dossier (1 = racine) ; au-delà, 422 DOC_FOLDER_TOO_DEEP. */
export const DOCUMENT_FOLDER_MAX_DEPTH = 3;
export type DocumentFolderDepth = 1 | 2 | 3;

/** Mirrors com.excellence.back.documents.admin.dto.DocumentAdminDtos.DocumentCategoryResponse */
export interface DocumentCategory {
  id: string;
  ministryId: string;
  /** Libellé FR (donnée, pas une clé i18n). */
  name: string;
  /** null → afficher `name`. */
  nameEn: string | null;
  displayOrder: number;
  active: boolean;
  /** ≥ 1 document (même supprimé) la référence : DELETE → 422 DOC_CATEGORY_IN_USE, la désactiver. */
  inUse: boolean;
  /** D-DOC-16 — dossier parent ; null = premier niveau du ministère. */
  parentId: string | null;
  /** D-DOC-16 — 1 (racine) à 3. */
  depth: DocumentFolderDepth;
  /** D-DOC-16 — documents rangés DIRECTEMENT dans ce dossier (hors sous-dossiers). */
  documentCount: number;
  /** D-DOC-16 — sous-dossiers directs ; > 0 → DELETE 422 DOC_FOLDER_NOT_EMPTY. */
  childCount: number;
  createdAt: string;
  updatedAt: string | null;
}

/** Mirrors com.excellence.back.documents.admin.dto.DocumentAdminDtos.CreateDocumentCategoryRequest */
export interface DocumentCategoryCreateRequest {
  ministryId: string;
  name: string;
  nameEn?: string;
  /** Absent = après les catégories existantes du ministère. */
  displayOrder?: number;
  /** D-DOC-16 — absent / null = premier niveau ; sinon dossier du même ministère (422 DOC_FOLDER_TOO_DEEP au-delà de 3 niveaux). */
  parentId?: string | null;
}

/**
 * Mirrors com.excellence.back.documents.admin.dto.DocumentAdminDtos.UpdateDocumentCategoryRequest —
 * PATCH : champs absents = inchangés ; `nameEn: ""` = plus de libellé anglais. Ministère non modifiable.
 */
export interface DocumentCategoryUpdateRequest {
  name?: string;
  nameEn?: string;
  displayOrder?: number;
  /** false : disparaît de l'espace Documents de l'app ; les documents la gardent. */
  active?: boolean;
  /**
   * D-DOC-16 — présent = déplacement (`null` = vers la racine). 422 DOC_FOLDER_CYCLE (sous soi-même
   * ou un descendant), DOC_FOLDER_TOO_DEEP (> 3 niveaux), DOC_CATEGORY_NAME_EXISTS (nom pris parmi les frères).
   */
  parentId?: string | null;
}

export function listDocumentCategories(ministryId?: string): Promise<DocumentCategory[]> {
  const q = ministryId ? `?ministryId=${encodeURIComponent(ministryId)}` : "";
  return apiFetch<DocumentCategory[]>(`/admin/document-categories${q}`);
}

/** 422 `DOC_CATEGORY_NAME_EXISTS` si le nom existe déjà (insensible à la casse) parmi les dossiers frères (D-DOC-16). */
export function createDocumentCategory(req: DocumentCategoryCreateRequest): Promise<DocumentCategory> {
  return apiFetch<DocumentCategory>("/admin/document-categories", { method: "POST", body: JSON.stringify(req) });
}

export function updateDocumentCategory(id: string, patch: DocumentCategoryUpdateRequest): Promise<DocumentCategory> {
  return apiFetch<DocumentCategory>(`/admin/document-categories/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/**
 * 422 `DOC_CATEGORY_IN_USE` si un document (même supprimé) la référence : la désactiver à la place ;
 * 422 `DOC_FOLDER_NOT_EMPTY` si elle a des sous-dossiers (D-DOC-16).
 */
export function deleteDocumentCategory(id: string): Promise<void> {
  return apiFetch<void>(`/admin/document-categories/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------

/** Mirrors com.excellence.back.documents.admin.dto.DocumentAdminDtos.DocumentStats — §5.1 bis du plan : totaux, toutes périodes, toutes versions et tous slugs. */
export interface AdminDocumentStats {
  opens: number;
  walls: number;
  installClicks: number;
  openApp: number;
  shares: number;
  /** D-DOC-16 (JP 26/10) — D-DOC-18 : événements `DOWNLOAD` (« Enregistrer / Envoyer le PDF » de l'app). */
  downloads: number;
  /** COUNT(DISTINCT visitor_id), tous événements (D-DOC-15 : identifiant aléatoire, jamais d'IP). */
  uniqueVisitors: number;
}

/** Mirrors com.excellence.back.documents.admin.dto.DocumentAdminDtos.AdminDocumentResponse */
export interface AdminDocument {
  id: string;
  ministryId: string;
  ministryName: string | null;
  title: string;
  description: string | null;
  author: string | null;
  language: DocumentLanguage | null;
  scopeLevel: DocumentScopeLevel;
  /** null ⇔ MINISTRY. */
  scopeId: string | null;
  /** Nom du nœud ; nom du ministère pour MINISTRY. */
  scopeName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryNameEn: string | null;
  status: DocumentStatus;
  /** RG-DOC-07 — null tant que jamais publié. */
  shareSlug: string | null;
  /** "https://<SHARE_DOMAIN>/d/{shareSlug}" (sans ?r) ; null sans slug. Le front ne compose jamais le lien. */
  shareUrl: string | null;
  /** §2.4 — le lien sert-il le document en ce moment ? (false : dépublié, expiré, ou ministère sans DOCUMENTS). */
  available: boolean;
  freePages: number;
  open: boolean;
  /**
   * D-DOC-16 (JP 26/10) — l'app propose « Enregistrer / Envoyer le PDF » quand elle affiche le PDF
   * complet (D-DOC-17). Vrai par défaut (migration : TRUE pour tous les documents existants) ;
   * n'ouvre aucun accès de plus (D-DOC-05, RG-DOC-01b inchangés).
   */
  downloadable: boolean;
  pageCount: number;
  /** RG-DOC-08 — 1 à la création, +1 à chaque remplacement du fichier. */
  version: number;
  fileSize: number;
  fileSha256: string;
  expiresAt: string | null;
  publishedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedById: string | null;
  updatedAt: string | null;
  stats: AdminDocumentStats;
}

/** Mirrors com.excellence.back.documents.admin.dto.DocumentAdminDtos.CreateDocumentRequest — partie `data` du multipart. */
export interface AdminDocumentCreateRequest {
  ministryId: string;
  title: string;
  description?: string;
  author?: string;
  language?: DocumentLanguage;
  scopeLevel: DocumentScopeLevel;
  /** null ⇔ MINISTRY ; sinon nœud existant DU ministère (422 DOC_INVALID_SCOPE). */
  scopeId?: string;
  categoryId?: string;
  /** ≥ 1, ≤ pageCount (422 DOC_FREE_PAGES_OUT_OF_RANGE) ; absent → min(5, pageCount). */
  freePages?: number;
  open?: boolean;
  /** D-DOC-16 (JP 26/10) — absent = true (case « Téléchargeable » cochée par défaut). */
  downloadable?: boolean;
  expiresAt?: string;
}

/**
 * Mirrors com.excellence.back.documents.admin.dto.DocumentAdminDtos.UpdateDocumentRequest —
 * REMPLACEMENT COMPLET (§3.5) : un champ facultatif absent ou null est effacé ; on renvoie donc
 * toujours le formulaire entier. Changer `freePages` recalcule l'aperçu (même version).
 */
export interface AdminDocumentUpdateRequest {
  title: string;
  description?: string;
  author?: string;
  language?: DocumentLanguage;
  scopeLevel: DocumentScopeLevel;
  scopeId?: string;
  categoryId?: string;
  freePages: number;
  open: boolean;
  /** D-DOC-16 (JP 26/10) — facultatif : absent = inchangé (exception au remplacement complet) ; le formulaire l'envoie toujours. */
  downloadable?: boolean;
  /** Absent = n'expire plus. */
  expiresAt?: string;
}

export interface AdminDocumentFilters {
  ministryId?: string;
  /** Avec `scopeId` (sauf MINISTRY, sans) — sinon 400 INVALID_SCOPE. Filtre exact sur le nœud. */
  scopeLevel?: DocumentScopeLevel;
  scopeId?: string;
  categoryId?: string;
  status?: DocumentStatus;
  q?: string;
}

/** Documents non supprimés, triés updatedAt ↓, non paginés (§3.3), compteurs inclus. */
export function listDocuments(f: AdminDocumentFilters = {}): Promise<AdminDocument[]> {
  const p = new URLSearchParams();
  if (f.ministryId) p.set("ministryId", f.ministryId);
  if (f.scopeLevel) p.set("scopeLevel", f.scopeLevel);
  if (f.scopeId) p.set("scopeId", f.scopeId);
  if (f.categoryId) p.set("categoryId", f.categoryId);
  if (f.status) p.set("status", f.status);
  if (f.q && f.q.trim()) p.set("q", f.q.trim());
  const qs = p.toString();
  return apiFetch<AdminDocument[]>(`/admin/documents${qs ? `?${qs}` : ""}`);
}

/**
 * Création (§3.4) — multipart `file` (PDF) + `data` typée `application/json` (obligatoire côté
 * Spring). 201 `status = DRAFT`, `version = 1`, sans slug. 422 DOC_FILE_TOO_LARGE, DOC_NOT_A_PDF,
 * DOC_PDF_ENCRYPTED, DOC_PDF_UNREADABLE, DOC_INVALID_SCOPE, DOC_CATEGORY_MINISTRY_MISMATCH,
 * DOC_FREE_PAGES_OUT_OF_RANGE.
 */
export function createDocument(file: File, data: AdminDocumentCreateRequest): Promise<AdminDocument> {
  const form = new FormData();
  form.append("file", file);
  form.append("data", new Blob([JSON.stringify(data)], { type: "application/json" }));
  return apiFetchMultipart<AdminDocument>("/admin/documents", form, "POST");
}

export function updateDocument(id: string, req: AdminDocumentUpdateRequest): Promise<AdminDocument> {
  return apiFetch<AdminDocument>(`/admin/documents/${id}`, { method: "PATCH", body: JSON.stringify(req) });
}

/** RG-DOC-08 — remplace le PDF : même slug (le lien reste valable), `version + 1`, aperçu et vignette recalculés. */
export function replaceDocumentFile(id: string, file: File): Promise<AdminDocument> {
  const form = new FormData();
  form.append("file", file);
  return apiFetchMultipart<AdminDocument>(`/admin/documents/${id}/file`, form, "PUT");
}

/** DRAFT → PUBLISHED (attribue le slug) ; UNPUBLISHED → PUBLISHED (même slug) ; idempotent. */
export function publishDocument(id: string): Promise<AdminDocument> {
  return apiFetch<AdminDocument>(`/admin/documents/${id}/publish`, { method: "POST" });
}

/** PUBLISHED → UNPUBLISHED (le lien répond « plus disponible ») ; 422 DOC_INVALID_TRANSITION depuis DRAFT. */
export function unpublishDocument(id: string): Promise<AdminDocument> {
  return apiFetch<AdminDocument>(`/admin/documents/${id}/unpublish`, { method: "POST" });
}

/** RG-DOC-07 — nouveau slug, l'ancien lien ne marche plus ; 422 DOC_INVALID_TRANSITION sans slug. */
export function regenerateDocumentLink(id: string): Promise<AdminDocument> {
  return apiFetch<AdminDocument>(`/admin/documents/${id}/regenerate-link`, { method: "POST" });
}

/** Suppression logique (§3.8) : le lien répond « plus disponible », le journal est conservé. */
export function deleteDocument(id: string): Promise<void> {
  return apiFetch<void>(`/admin/documents/${id}`, { method: "DELETE" });
}
