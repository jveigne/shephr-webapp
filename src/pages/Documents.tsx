import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Checkbox, Drawer, Field, IconButton, Input, Modal, Select, Table, Toggle, TopBar } from "@/components/primitives";
import { ScopeTreePicker, type ScopeValue } from "@/components/ScopeTreePicker";
import { FolderEntry, FolderTreeList, FolderTreePicker } from "@/components/FolderTree";
import { buildFolderIndex, folderPath, folderPathLabel, moveBlock, subtreeIds, useFolderLabel, type FolderIndex, type FolderNode } from "@/lib/documentFolders";
import { useMinistryTree } from "@/hooks/useMinistryTree";
import { flattenTree } from "@/lib/orgTree";
import { useToasts } from "@/context/ToastContext";
import { useDebounced } from "@/hooks/useDebounced";
import { apiErrorCode } from "@/services/api";
import { listMinistries } from "@/services/ministryService";
import {
  DOCUMENT_FOLDER_MAX_DEPTH,
  DOCUMENT_LANGUAGES,
  DOCUMENT_LIMITS,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_STATUSES,
  createDocument,
  createDocumentCategory,
  deleteDocument,
  deleteDocumentCategory,
  listDocumentCategories,
  listDocuments,
  publishDocument,
  regenerateDocumentLink,
  replaceDocumentFile,
  unpublishDocument,
  updateDocument,
  updateDocumentCategory,
  type AdminDocument,
  type AdminDocumentUpdateRequest,
  type DocumentCategory,
  type DocumentCategoryUpdateRequest,
  type DocumentLanguage,
  type DocumentScopeLevel,
  type DocumentStatus,
} from "@/services/documentService";

// D-DOC-07 (JP 18/10) — Back-office du module DOCUMENTS (§6.1 du plan Liseuse & partage, lot D3) :
// SUPER_ADMIN dépose un PDF (D-DOC-02 : PDF seulement), le place à un nœud (D-DOC-08, « Tout le
// ministère » ou un nœud de l'arbre), choisit sa catégorie (RG-FOLDER-03), l'aperçu offert
// (`freePages`, borné par le nombre de pages lu par le backend) et s'il est libre (`open`,
// D-DOC-06), puis publie : le lien universel `/d/{slug}` s'affiche avec « Copier ». Le front ne
// compose jamais le lien : il affiche `shareUrl` tel que le backend le rend (§7.3 du contrat).
//
// D-DOC-16 (JP 19/10) — les catégories deviennent des DOSSIERS hiérarchiques façon Drive (3 niveaux
// au plus, par ministère) : l'onglet « Catégories » disparaît au profit d'une vue intégrée — arbre
// des dossiers à gauche (« Tous les documents », « Sans dossier », puis l'arbre), documents du
// dossier sélectionné à droite sous un fil d'Ariane. Déplacer un document = changer son dossier
// dans le formulaire (pas de glisser-déposer).

/** D-DOC-16 — sélection de la colonne de gauche : tout, les documents sans dossier, ou un dossier (id). */
type FolderSel = "ALL" | "NONE" | string;
const errorStyle = { color: "var(--err)", fontSize: 13 } as const;
/** Ordre d'affichage des catégories : le backend le lit en `Integer` ; borne réaliste (cf. TypesEvenement). */
const ORDER_MAX = 9999;
/** Tous les codes propres au module (§1.5 et §8 du contrat) ont une traduction `documents.errors.<CODE>`. */
const errKey = (code: string) => `documents.errors.${code}`;

// ---------------------------------------------------------------------------------------------
// Formulaires
// ---------------------------------------------------------------------------------------------

interface MetaForm {
  title: string;
  description: string;
  author: string;
  language: "" | DocumentLanguage;
  scope: ScopeValue | null;
  categoryId: string;
}

interface PreviewForm {
  /** Texte libre pour laisser l'input éditable ; borné [1, pageCount] avant envoi (RG-DOC-01c). */
  freePages: string;
  open: boolean;
  /** `datetime-local` (heure locale du navigateur) ; vide = n'expire pas (RG-DOC-05). */
  expiresAt: string;
}

const emptyMeta = (): MetaForm => ({
  title: "", description: "", author: "", language: "", scope: { level: "MINISTRY", id: null }, categoryId: "",
});

const metaOf = (d: AdminDocument): MetaForm => ({
  title: d.title,
  description: d.description ?? "",
  author: d.author ?? "",
  language: d.language ?? "",
  scope: { level: d.scopeLevel, id: d.scopeId },
  categoryId: d.categoryId ?? "",
});

const previewOf = (d: AdminDocument): PreviewForm => ({
  freePages: String(d.freePages),
  open: d.open,
  expiresAt: d.expiresAt ? toLocalInput(d.expiresAt) : "",
});

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromLocalInput(s: string): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const opt = (s: string): string | undefined => (s.trim() ? s.trim() : undefined);

function parseFreePages(s: string, pageCount: number): number | null {
  const n = Number(s.trim());
  return s.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= pageCount ? n : null;
}

function parseOrder(s: string): number | null {
  const n = Number(s.trim());
  return s.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= ORDER_MAX ? n : null;
}

/** §3.5 — PATCH = remplacement complet : on renvoie toujours tout le formulaire. */
function updateRequestOf(meta: MetaForm, preview: PreviewForm, pageCount: number): AdminDocumentUpdateRequest {
  const scope = meta.scope ?? { level: "MINISTRY" as DocumentScopeLevel, id: null };
  return {
    title: meta.title.trim(),
    description: opt(meta.description),
    author: opt(meta.author),
    language: meta.language || undefined,
    scopeLevel: scope.level,
    scopeId: scope.level === "MINISTRY" ? undefined : scope.id ?? undefined,
    categoryId: meta.categoryId || undefined,
    freePages: parseFreePages(preview.freePages, pageCount) ?? 1,
    open: preview.open,
    expiresAt: fromLocalInput(preview.expiresAt),
  };
}

const metaValid = (m: MetaForm) => !!m.title.trim() && !!m.scope && (m.scope.level === "MINISTRY" || !!m.scope.id);

/**
 * Contrôles avant envoi (le backend reste juge, §3.4) : taille ≤ 50 Mo et signature `%PDF-` —
 * le type MIME annoncé par le navigateur n'est pas cru, comme côté serveur.
 */
async function checkPdf(file: File): Promise<string | null> {
  if (file.size === 0) return "DOC_NOT_A_PDF";
  if (file.size > DOCUMENT_MAX_BYTES) return "DOC_FILE_TOO_LARGE";
  try {
    const head = await file.slice(0, 5).text();
    if (head !== "%PDF-") return "DOC_NOT_A_PDF";
  } catch {
    /* lecture locale impossible : le serveur tranchera */
  }
  return null;
}

const isExpired = (d: AdminDocument) => !!d.expiresAt && new Date(d.expiresAt).getTime() <= Date.now();

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

export default function DocumentsPage() {
  const { t, i18n } = useTranslation();
  const { push } = useToasts();
  const qc = useQueryClient();
  const lang = (i18n.resolvedLanguage || i18n.language) === "en" ? "en" : "fr";
  const dateLocale = lang === "en" ? "en-GB" : "fr-FR";

  const [ministryId, setMinistryId] = useState("");
  const [scopeKey, setScopeKey] = useState("");
  const [folderSel, setFolderSel] = useState<FolderSel>("ALL");
  /** D-DOC-16 — un dossier sélectionné montre ses documents directs ; coché, aussi ceux de ses sous-dossiers. */
  const [includeSub, setIncludeSub] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"" | DocumentStatus>("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const ministries = useMemo(
    () => [...(ministriesQ.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" })),
    [ministriesQ.data],
  );
  const ministryName = useMemo(() => {
    const map = new Map((ministriesQ.data ?? []).map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [ministriesQ.data]);

  // Filtre de portée : exact sur le nœud (§3.3) — n'a de sens qu'un ministère choisi.
  const { tree } = useMinistryTree(ministryId, ministryId ? ministryName(ministryId) : "");
  const scopeOptions = useMemo(() => flattenTree(tree), [tree]);
  const scopeFilter = useMemo((): { scopeLevel?: DocumentScopeLevel; scopeId?: string } => {
    if (!scopeKey) return {};
    if (scopeKey === "MINISTRY") return { scopeLevel: "MINISTRY" };
    const [level, id] = scopeKey.split(":");
    return { scopeLevel: level as DocumentScopeLevel, scopeId: id };
  }, [scopeKey]);

  const categoriesQ = useQuery({
    queryKey: ["document-categories", ministryId],
    queryFn: () => listDocumentCategories(ministryId || undefined),
  });
  // D-DOC-16 — le filtre par dossier est appliqué côté front sur la liste (non paginée, §3.3) :
  // le backend ne filtre que le dossier exact, or il faut aussi « Sans dossier » et « inclure les
  // sous-dossiers ». Changer de dossier ne recharge donc rien.
  const docsQ = useQuery({
    queryKey: ["documents", ministryId, scopeKey, statusFilter, q],
    queryFn: () => listDocuments({
      ministryId: ministryId || undefined,
      ...scopeFilter,
      status: statusFilter || undefined,
      q,
    }),
  });
  const folderIndex = useMemo(() => buildFolderIndex(categoriesQ.data ?? []), [categoriesQ.data]);
  /** Dossier sélectionné, s'il existe encore (supprimé ailleurs → retour à « Tous les documents »). */
  const selectedNode: FolderNode | undefined =
    folderSel !== "ALL" && folderSel !== "NONE" && ministryId ? folderIndex.byId.get(folderSel) : undefined;
  const effectiveSel: FolderSel = selectedNode ? selectedNode.folder.id : folderSel === "NONE" ? "NONE" : "ALL";

  const errText = (e: unknown): string => {
    const code = apiErrorCode(e);
    if (code && i18n.exists(errKey(code))) return t(errKey(code));
    return e instanceof Error ? e.message : t("common.error");
  };
  const folderLabel = useFolderLabel();
  /** D-DOC-16 — chemin complet du dossier d'un document ; repli sur le libellé recopié dans le document. */
  const docFolderLabel = (d: AdminDocument) => {
    if (!d.categoryId) return t("documents.folders.noFolder");
    if (folderIndex.byId.has(d.categoryId)) return folderPathLabel(folderIndex, d.categoryId, folderLabel);
    return d.categoryName ? folderLabel({ name: d.categoryName, nameEn: d.categoryNameEn }) : t("common.dash");
  };
  const scopeLabel = (level: DocumentScopeLevel, name: string | null) =>
    level === "MINISTRY" ? t("documents.scopeWholeMinistry") : name ?? t("common.dash");
  const fmtDateTime = (iso: string | null) => {
    if (!iso) return t("common.dash");
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? t("common.dash")
      : d.toLocaleString(dateLocale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const changeMinistry = (id: string) => {
    setMinistryId(id);
    setScopeKey("");
    setFolderSel("ALL");
    setIncludeSub(false);
  };

  const copy = (url: string) => {
    if (!navigator.clipboard) {
      push({ kind: "error", title: t("documents.copyFailTitle"), msg: url });
      return;
    }
    navigator.clipboard.writeText(url).then(
      () => push({ kind: "ok", title: t("documents.linkCopied"), msg: url }),
      () => push({ kind: "error", title: t("documents.copyFailTitle"), msg: url }),
    );
  };

  const invalidateDocs = () => qc.invalidateQueries({ queryKey: ["documents"] });
  const invalidateCategories = () => qc.invalidateQueries({ queryKey: ["document-categories"] });

  // -------------------------------------------------------------------------------------------
  // Détail (tiroir) — l'objet affiché est remplacé par chaque réponse de mutation (AdminDocument)
  // -------------------------------------------------------------------------------------------
  const [detail, setDetail] = useState<AdminDocument | null>(null);
  /** Après une action, le document reste affiché à jour même s'il sort des filtres de la liste. */
  const refresh = (d: AdminDocument) => {
    setDetail((cur) => (cur && cur.id === d.id ? d : cur));
    invalidateDocs();
  };

  // ---- Création (3 temps : dépôt + rangement → aperçu → lien) ----
  type CreateStep = "upload" | "preview" | "published";
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>("upload");
  const [createMinistry, setCreateMinistry] = useState("");
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaForm>(emptyMeta);
  const [preview, setPreview] = useState<PreviewForm>({ freePages: "", open: false, expiresAt: "" });
  const [created, setCreated] = useState<AdminDocument | null>(null);

  const formCategoriesQ = useQuery({
    queryKey: ["document-categories", createMinistry],
    queryFn: () => listDocumentCategories(createMinistry),
    enabled: !!createMinistry,
  });

  const openCreate = () => {
    setCreateStep("upload");
    setCreateMinistry(ministryId);
    setCreateFile(null);
    setFileError(null);
    // D-DOC-16 (JP 19/10) — déposer depuis un dossier sélectionné le range dans ce dossier.
    setMeta({ ...emptyMeta(), categoryId: selectedNode ? selectedNode.folder.id : "" });
    setPreview({ freePages: "", open: false, expiresAt: "" });
    setCreated(null);
    setCreateOpen(true);
  };

  const pickFile = async (file: File | null, onOk: (f: File) => void, setErr: (e: string | null) => void) => {
    setErr(null);
    if (!file) return;
    const code = await checkPdf(file);
    if (code) {
      setErr(t(errKey(code)));
      return;
    }
    onOk(file);
  };

  const uploadM = useMutation({
    mutationFn: (v: { file: File; ministryId: string; meta: MetaForm }) => {
      const scope = v.meta.scope!;
      return createDocument(v.file, {
        ministryId: v.ministryId,
        title: v.meta.title.trim(),
        description: opt(v.meta.description),
        author: opt(v.meta.author),
        language: v.meta.language || undefined,
        scopeLevel: scope.level,
        scopeId: scope.level === "MINISTRY" ? undefined : scope.id ?? undefined,
        categoryId: v.meta.categoryId || undefined,
        // freePages absent : le backend prend min(5, pageCount) (RG-DOC-01c) ; on l'ajuste à l'étape suivante.
      });
    },
    onSuccess: (d) => {
      invalidateDocs();
      setCreated(d);
      setPreview(previewOf(d));
      setCreateStep("preview");
    },
    onError: (e: unknown) => push({ kind: "error", title: t("documents.uploadFailToast"), msg: errText(e) }),
  });

  /** Étape « aperçu » : enregistre l'aperçu / l'échéance, puis publie si demandé. */
  const finishM = useMutation({
    mutationFn: async (v: { doc: AdminDocument; meta: MetaForm; preview: PreviewForm; publish: boolean }) => {
      const saved = await updateDocument(v.doc.id, updateRequestOf(v.meta, v.preview, v.doc.pageCount));
      return v.publish ? publishDocument(saved.id) : saved;
    },
    onSuccess: (d, v) => {
      invalidateDocs();
      setCreated(d);
      if (v.publish) {
        setCreateStep("published");
        push({ kind: "ok", title: t("documents.publishedToast"), msg: d.title });
      } else {
        push({ kind: "ok", title: t("documents.draftSavedToast"), msg: d.title });
        setCreateOpen(false);
      }
    },
    onError: (e: unknown) => {
      invalidateDocs();
      push({ kind: "error", title: t("documents.saveFailToast"), msg: errText(e) });
    },
  });

  const createBusy = uploadM.isPending || finishM.isPending;
  const closeCreate = () => { if (!createBusy) setCreateOpen(false); };

  // ---- Modification des métadonnées (PATCH complet) ----
  const [editing, setEditing] = useState<AdminDocument | null>(null);
  const [editMeta, setEditMeta] = useState<MetaForm>(emptyMeta);
  const [editPreview, setEditPreview] = useState<PreviewForm>({ freePages: "", open: false, expiresAt: "" });
  const editCategoriesQ = useQuery({
    queryKey: ["document-categories", editing?.ministryId ?? ""],
    queryFn: () => listDocumentCategories(editing!.ministryId),
    enabled: !!editing,
  });
  const createFolderIndex = useMemo(() => buildFolderIndex(formCategoriesQ.data ?? []), [formCategoriesQ.data]);
  const editFolderIndex = useMemo(() => buildFolderIndex(editCategoriesQ.data ?? []), [editCategoriesQ.data]);
  const openEdit = (d: AdminDocument) => {
    setEditing(d);
    setEditMeta(metaOf(d));
    setEditPreview(previewOf(d));
  };
  const editM = useMutation({
    mutationFn: (v: { doc: AdminDocument; meta: MetaForm; preview: PreviewForm }) =>
      updateDocument(v.doc.id, updateRequestOf(v.meta, v.preview, v.doc.pageCount)),
    onSuccess: (d) => {
      refresh(d);
      setEditing(null);
      push({ kind: "ok", title: t("documents.updatedToast"), msg: d.title });
    },
    onError: (e: unknown, v) => {
      invalidateDocs();
      push({ kind: "error", title: t("documents.saveFailToast"), msg: errText(e) });
      // Supprimé ailleurs entre-temps : le formulaire porte un instantané périmé.
      if (apiErrorCode(e) === "RESOURCE_NOT_FOUND") {
        setEditing(null);
        setDetail((cur) => (cur?.id === v.doc.id ? null : cur));
      }
    },
  });

  // ---- Remplacement du fichier (RG-DOC-08) ----
  const [replacing, setReplacing] = useState<AdminDocument | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const openReplace = (d: AdminDocument) => { setReplacing(d); setReplaceFile(null); setReplaceError(null); };
  const replaceM = useMutation({
    mutationFn: (v: { doc: AdminDocument; file: File }) => replaceDocumentFile(v.doc.id, v.file),
    onSuccess: (d) => {
      refresh(d);
      setReplacing(null);
      push({ kind: "ok", title: t("documents.replacedToast"), msg: t("documents.replacedToastMsg", { version: d.version, pages: d.pageCount }) });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("documents.replaceFailToast"), msg: errText(e) }),
  });

  // ---- Publication / dépublication / lien / suppression ----
  type Confirm = { kind: "unpublish" | "regenerate" | "delete"; doc: AdminDocument };
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const publishM = useMutation({
    mutationFn: (d: AdminDocument) => publishDocument(d.id),
    onSuccess: (d) => { refresh(d); push({ kind: "ok", title: t("documents.publishedToast"), msg: d.shareUrl ?? d.title }); },
    onError: (e: unknown) => { invalidateDocs(); push({ kind: "error", title: t("common.failure"), msg: errText(e) }); },
  });

  const confirmM = useMutation({
    mutationFn: async (c: Confirm): Promise<AdminDocument | null> => {
      if (c.kind === "unpublish") return unpublishDocument(c.doc.id);
      if (c.kind === "regenerate") return regenerateDocumentLink(c.doc.id);
      await deleteDocument(c.doc.id);
      return null;
    },
    onSuccess: (d, c) => {
      setConfirm(null);
      if (d) {
        refresh(d);
        push({
          kind: "ok",
          title: c.kind === "unpublish" ? t("documents.unpublishedToast") : t("documents.regeneratedToast"),
          msg: c.kind === "regenerate" ? d.shareUrl ?? d.title : d.title,
        });
      } else {
        invalidateDocs();
        setDetail((cur) => (cur?.id === c.doc.id ? null : cur));
        push({ kind: "ok", title: t("documents.deletedToast"), msg: c.doc.title });
      }
    },
    onError: (e: unknown, c) => {
      invalidateDocs();
      push({ kind: "error", title: t("common.failure"), msg: errText(e) });
      if (apiErrorCode(e) === "RESOURCE_NOT_FOUND") {
        setConfirm(null);
        setDetail((cur) => (cur?.id === c.doc.id ? null : cur));
      }
    },
  });

  // -------------------------------------------------------------------------------------------
  // Rendu — liste des documents
  // -------------------------------------------------------------------------------------------
  const allDocs = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const docs = useMemo(() => {
    if (effectiveSel === "ALL") return allDocs;
    if (effectiveSel === "NONE" || !selectedNode) return allDocs.filter((d) => !d.categoryId);
    const ids = includeSub ? subtreeIds(selectedNode) : new Set([selectedNode.folder.id]);
    return allDocs.filter((d) => !!d.categoryId && ids.has(d.categoryId));
  }, [allDocs, effectiveSel, selectedNode, includeSub]);
  const totals = useMemo(() => docs.reduce(
    (acc, d) => ({
      opens: acc.opens + d.stats.opens,
      walls: acc.walls + d.stats.walls,
      installClicks: acc.installClicks + d.stats.installClicks,
      shares: acc.shares + d.stats.shares,
    }),
    { opens: 0, walls: 0, installClicks: 0, shares: 0 },
  ), [docs]);

  const statusBadges = (d: AdminDocument) => (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {d.status === "PUBLISHED" && <Badge tone="ok" dot>{t("documents.status.PUBLISHED")}</Badge>}
      {d.status === "DRAFT" && <Badge tone="gray" dot>{t("documents.status.DRAFT")}</Badge>}
      {d.status === "UNPUBLISHED" && <Badge tone="warn" dot>{t("documents.status.UNPUBLISHED")}</Badge>}
      {isExpired(d) && <Badge tone="err">{t("documents.expiredBadge")}</Badge>}
      {d.status === "PUBLISHED" && !d.available && !isExpired(d) && (
        <span title={t("documents.unavailableModuleHint")}><Badge tone="err">{t("documents.unavailableBadge")}</Badge></span>
      )}
    </div>
  );

  const cols = [
    {
      label: t("documents.colDocument"),
      render: (d: AdminDocument) => (
        <div style={{ minWidth: 200 }}>
          <div style={{ fontWeight: 500, color: "var(--ink-900)" }}>{d.title}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
            {[d.author, t("documents.pagesCount", { count: d.pageCount }), `v${d.version}`].filter(Boolean).join(" · ")}
          </div>
        </div>
      ),
    },
    ...(ministryId
      ? []
      : [{ label: t("documents.colMinistry"), render: (d: AdminDocument) => <span style={{ color: "var(--ink-700)" }}>{d.ministryName ?? ministryName(d.ministryId)}</span> }]),
    {
      label: t("documents.colScope"),
      render: (d: AdminDocument) => (
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--ink-400)" }}>{t(`subscriptions.level.${d.scopeLevel}`)}</div>
          <div style={{ color: "var(--ink-700)" }}>{scopeLabel(d.scopeLevel, d.scopeName)}</div>
        </div>
      ),
    },
    { label: t("documents.folders.col"), render: (d: AdminDocument) => <span style={{ color: "var(--ink-700)" }}>{docFolderLabel(d)}</span> },
    {
      label: t("documents.colPreview"),
      cellStyle: { whiteSpace: "nowrap" as const },
      render: (d: AdminDocument) =>
        d.open
          ? <Badge tone="green">{t("documents.openBadge")}</Badge>
          : <span className="mono" style={{ color: "var(--ink-700)" }}>{t("documents.previewPages", { free: Math.min(d.freePages, d.pageCount), total: d.pageCount })}</span>,
    },
    { label: t("documents.colStatus"), render: statusBadges },
    {
      label: t("documents.colAudience"),
      cellStyle: { whiteSpace: "nowrap" as const },
      render: (d: AdminDocument) => (
        <span style={{ fontSize: 12.5, color: "var(--ink-700)" }} title={t("documents.audienceHint")}>
          {t("documents.audienceShort", { opens: d.stats.opens, visitors: d.stats.uniqueVisitors, shares: d.stats.shares })}
        </span>
      ),
    },
    {
      label: "",
      style: { width: 1 },
      cellStyle: { whiteSpace: "nowrap" as const },
      render: (d: AdminDocument) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          {d.shareUrl && <IconButton icon={<Icons.Copy size={15} />} title={t("documents.copyLink")} onClick={() => copy(d.shareUrl!)} />}
          <IconButton icon={<Icons.Edit size={15} />} title={t("documents.edit")} onClick={() => openEdit(d)} />
        </div>
      ),
    },
  ];

  // -------------------------------------------------------------------------------------------
  // Dossiers (RG-FOLDER-03, D-DOC-16 JP 19/10) — création, renommage, déplacement, (dés)activation,
  // suppression. Routes /admin/document-categories inchangées.
  // -------------------------------------------------------------------------------------------
  const [catEditing, setCatEditing] = useState<DocumentCategory | null>(null);
  /** Parent du dossier en création (null = premier niveau). */
  const [catParent, setCatParent] = useState<DocumentCategory | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ ministryId: "", name: "", nameEn: "", displayOrder: "" });
  const [catDeleting, setCatDeleting] = useState<DocumentCategory | null>(null);
  /** Suppression refusée : sous-dossiers (DOC_FOLDER_NOT_EMPTY) ou documents (DOC_CATEGORY_IN_USE → désactiver). */
  const [catDeleteBlocked, setCatDeleteBlocked] = useState<null | "children" | "documents">(null);
  const [moving, setMoving] = useState<DocumentCategory | null>(null);
  /** Nouveau parent choisi ; `undefined` = pas encore choisi, `null` = premier niveau. */
  const [moveTarget, setMoveTarget] = useState<string | null | undefined>(undefined);

  const openCatCreate = (parent: DocumentCategory | null) => {
    setCatEditing(null);
    setCatParent(parent);
    setCatForm({ ministryId: parent?.ministryId ?? ministryId, name: "", nameEn: "", displayOrder: "" });
    setCatOpen(true);
  };
  const openCatEdit = (c: DocumentCategory) => {
    setCatEditing(c);
    setCatParent(null);
    setCatForm({ ministryId: c.ministryId, name: c.name, nameEn: c.nameEn ?? "", displayOrder: String(c.displayOrder) });
    setCatOpen(true);
  };
  const openMove = (c: DocumentCategory) => { setMoving(c); setMoveTarget(undefined); };

  const catSaveM = useMutation({
    mutationFn: async (v: { editing: DocumentCategory | null; parent: DocumentCategory | null; form: typeof catForm }): Promise<DocumentCategory> => {
      const { editing, parent, form } = v;
      const order = parseOrder(form.displayOrder);
      if (!editing) {
        return createDocumentCategory({
          ministryId: form.ministryId,
          name: form.name.trim(),
          nameEn: opt(form.nameEn),
          displayOrder: order ?? undefined,
          parentId: parent?.id ?? null,
        });
      }
      // PATCH : champs absents = inchangés ; `nameEn: ""` retire le libellé anglais (§3.2).
      const patch: DocumentCategoryUpdateRequest = {};
      if (form.name.trim() !== editing.name) patch.name = form.name.trim();
      if (form.nameEn.trim() !== (editing.nameEn ?? "")) patch.nameEn = form.nameEn.trim();
      if (order != null && order !== editing.displayOrder) patch.displayOrder = order;
      return Object.keys(patch).length === 0 ? editing : updateDocumentCategory(editing.id, patch);
    },
    onSuccess: (c, v) => {
      invalidateCategories();
      // Le libellé du dossier est recopié dans chaque AdminDocument.
      if (v.editing) invalidateDocs();
      setCatOpen(false);
      push({ kind: "ok", title: v.editing ? t("documents.folders.updatedToast") : t("documents.folders.createdToast"), msg: c.name });
    },
    onError: (e: unknown, v) => {
      invalidateCategories();
      push({ kind: "error", title: t("documents.saveFailToast"), msg: errText(e) });
      if (v.editing && apiErrorCode(e) === "RESOURCE_NOT_FOUND") setCatOpen(false);
    },
  });

  const moveM = useMutation({
    // D-DOC-16 — PATCH `parentId` présent = déplacement (`null` = premier niveau).
    mutationFn: (v: { folder: DocumentCategory; parentId: string | null }) => updateDocumentCategory(v.folder.id, { parentId: v.parentId }),
    onSuccess: (c) => {
      invalidateCategories();
      setMoving(null);
      push({ kind: "ok", title: t("documents.folders.movedToast"), msg: c.name });
    },
    onError: (e: unknown) => {
      invalidateCategories();
      push({ kind: "error", title: t("documents.folders.moveFailToast"), msg: errText(e) });
      if (apiErrorCode(e) === "RESOURCE_NOT_FOUND") setMoving(null);
    },
  });

  const catToggleM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => updateDocumentCategory(v.id, { active: v.active }),
    onSuccess: (c) => {
      invalidateCategories();
      push({ kind: "ok", title: c.active ? t("documents.folders.activatedToast") : t("documents.folders.deactivatedToast"), msg: c.name });
    },
    onError: (e: unknown) => { invalidateCategories(); push({ kind: "error", title: t("common.failure"), msg: errText(e) }); },
  });

  const closeCatDelete = () => { setCatDeleting(null); setCatDeleteBlocked(null); };
  const openCatDelete = (c: DocumentCategory) => {
    setCatDeleting(c);
    setCatDeleteBlocked(c.childCount > 0 ? "children" : c.inUse ? "documents" : null);
  };
  const catDeleteM = useMutation({
    mutationFn: (c: DocumentCategory) => deleteDocumentCategory(c.id),
    onSuccess: (_, c) => {
      invalidateCategories();
      closeCatDelete();
      // Le dossier affiché disparaît : on remonte à son parent.
      if (folderSel === c.id) setFolderSel(c.parentId ?? "ALL");
      push({ kind: "ok", title: t("documents.folders.deletedToast"), msg: c.name });
    },
    onError: (e: unknown) => {
      invalidateCategories();
      // Un sous-dossier ou un document a pu y être rangé depuis le chargement.
      if (apiErrorCode(e) === "DOC_FOLDER_NOT_EMPTY") { setCatDeleteBlocked("children"); return; }
      if (apiErrorCode(e) === "DOC_CATEGORY_IN_USE") { setCatDeleteBlocked("documents"); return; }
      push({ kind: "error", title: t("documents.deleteFailToast"), msg: errText(e) });
      if (apiErrorCode(e) === "RESOURCE_NOT_FOUND") closeCatDelete();
    },
  });
  const catDeleteBusy = catDeleteM.isPending || catToggleM.isPending;

  const catOrderError = (catEditing || catForm.displayOrder.trim() !== "") && parseOrder(catForm.displayOrder) == null
    ? t("documents.folders.orderInvalid", { max: ORDER_MAX })
    : null;
  const catCanSave = !!catForm.ministryId && !!catForm.name.trim() && !catOrderError && !catSaveM.isPending;

  /** Raison pour laquelle un dossier ne peut pas être supprimé depuis l'en-tête (null = supprimable). */
  const deleteBlockReason = (c: DocumentCategory) =>
    c.childCount > 0 ? t("documents.folders.deleteBlockedChildren")
      : c.documentCount > 0 ? t("documents.folders.deleteBlockedDocuments")
      : null;

  // Déplacement : ouvert depuis l'en-tête d'un dossier sélectionné, donc ministère filtré —
  // `folderIndex` ne contient que les dossiers de ce ministère.
  const movingNode = moving ? folderIndex.byId.get(moving.id) : undefined;
  const moveReason = (n: FolderNode) => {
    if (!movingNode) return null;
    const block = moveBlock(movingNode, n.folder);
    return block === "cycle" ? t("documents.folders.moveCycle") : block === "tooDeep" ? t("documents.folders.moveTooDeep") : null;
  };
  const moveChanged = moveTarget !== undefined && !!moving && moveTarget !== moving.parentId;

  // -------------------------------------------------------------------------------------------
  // JSX
  // -------------------------------------------------------------------------------------------
  const createMinistryName = createMinistry ? ministryName(createMinistry) : "";
  const selectedFolder = selectedNode?.folder ?? null;
  const filtersActive = !!(ministryId || scopeKey || effectiveSel !== "ALL" || statusFilter || q);
  const crumbLink = { background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--green-800)", font: "inherit" } as const;

  return (
    <>
      <TopBar
        title={t("documents.title")}
        crumbs={[t("common.jexcellence"), t("documents.title")]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" iconL={<Icons.Folder size={15} />} onClick={() => openCatCreate(null)}>{t("documents.folders.newFolder")}</Button>
            <Button variant="primary" iconL={<Icons.Upload size={15} />} onClick={openCreate}>{t("documents.newDocument")}</Button>
          </div>
        }
      />
      <div className="content">
        <p className="section-sub">
          <Trans i18nKey="documents.intro" components={{ strong: <strong /> }} />
        </p>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{t("documents.filterMinistry")}</span>
            <Select value={ministryId} onChange={(e) => changeMinistry(e.target.value)}>
              <option value="">{t("documents.allMinistries")}</option>
              {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
            <Select
              value={scopeKey}
              onChange={(e) => setScopeKey(e.target.value)}
              disabled={!ministryId}
              title={ministryId ? undefined : t("documents.filterNeedsMinistry")}
            >
              <option value="">{t("documents.allScopes")}</option>
              {scopeOptions.map(({ node, depth }) => (
                <option key={`${node.level}:${node.id}`} value={node.level === "MINISTRY" ? "MINISTRY" : `${node.level}:${node.id}`}>
                  {`${"  ".repeat(depth)}${node.level === "MINISTRY" ? t("documents.scopeWholeMinistry") : node.name}`}
                </option>
              ))}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | DocumentStatus)}>
              <option value="">{t("documents.allStatuses")}</option>
              {DOCUMENT_STATUSES.map((s) => <option key={s} value={s}>{t(`documents.status.${s}`)}</option>)}
            </Select>
            <div style={{ minWidth: 220, flex: 1 }}>
              <Input
                icon={<Icons.Search size={15} />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("documents.searchPlaceholder")}
              />
            </div>
            {ministriesQ.isError && <span style={errorStyle}>{t("documents.ministriesLoadError", { error: errText(ministriesQ.error) })}</span>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0, 1fr)", alignItems: "stretch" }}>
            {/* ---- D-DOC-16 : arbre des dossiers ---- */}
            <nav role="tree" aria-label={t("documents.folders.navTitle")} style={{ borderRight: "1px solid var(--line)", padding: 8, minHeight: 240 }}>
              <div style={{ ...sectionTitle, padding: "4px 8px 6px", marginBottom: 0 }}>{t("documents.folders.navTitle")}</div>
              <FolderEntry
                icon={<Icons.Document size={14} />}
                label={t("documents.folders.allDocuments")}
                selected={effectiveSel === "ALL"}
                onClick={() => setFolderSel("ALL")}
              />
              <FolderEntry
                icon={<Icons.Inbox size={14} />}
                label={t("documents.folders.noFolder")}
                selected={effectiveSel === "NONE"}
                onClick={() => setFolderSel("NONE")}
              />
              <div style={{ borderTop: "1px solid var(--line-soft)", margin: "6px 0" }} />
              {!ministryId ? (
                <div style={{ padding: "6px 8px", fontSize: 13, color: "var(--ink-500)" }}>{t("documents.folders.pickMinistry")}</div>
              ) : categoriesQ.isLoading ? (
                <div style={{ padding: "6px 8px", fontSize: 13, color: "var(--ink-500)" }}>{t("common.loading")}</div>
              ) : categoriesQ.isError ? (
                <div style={{ padding: "6px 8px", fontSize: 13, color: "var(--err)", display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                  <span>{t("documents.folders.loadError", { error: errText(categoriesQ.error) })}</span>
                  <Button size="sm" variant="secondary" onClick={() => categoriesQ.refetch()}>{t("common.retry")}</Button>
                </div>
              ) : folderIndex.roots.length === 0 ? (
                <div style={{ padding: "6px 8px", fontSize: 13, color: "var(--ink-500)" }}>{t("documents.folders.empty")}</div>
              ) : (
                <FolderTreeList
                  index={folderIndex}
                  selectedId={selectedFolder?.id ?? null}
                  onSelect={(f) => setFolderSel(f.id)}
                  label={folderLabel}
                  meta={(n) => n.folder.documentCount > 0
                    ? <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-400)" }}>{n.folder.documentCount}</span>
                    : null}
                />
              )}
            </nav>

            {/* ---- Documents du dossier sélectionné ---- */}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap", minHeight: 48 }}>
                <nav aria-label={t("documents.folders.breadcrumb")} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 14 }}>
                  {effectiveSel === "ALL" ? (
                    <strong style={{ fontWeight: 600 }}>{t("documents.folders.allDocuments")}</strong>
                  ) : (
                    <button type="button" style={crumbLink} onClick={() => setFolderSel("ALL")}>{t("documents.folders.allDocuments")}</button>
                  )}
                  {effectiveSel === "NONE" && (
                    <><span style={{ color: "var(--ink-400)" }}>›</span><strong style={{ fontWeight: 600 }}>{t("documents.folders.noFolder")}</strong></>
                  )}
                  {selectedFolder && folderPath(folderIndex, selectedFolder.id).map((f) => (
                    <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "var(--ink-400)" }}>›</span>
                      {f.id === selectedFolder.id
                        ? <strong style={{ fontWeight: 600 }}>{folderLabel(f)}</strong>
                        : <button type="button" style={crumbLink} onClick={() => setFolderSel(f.id)}>{folderLabel(f)}</button>}
                    </span>
                  ))}
                </nav>
                {selectedFolder && selectedNode && selectedNode.children.length > 0 && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-700)", cursor: "pointer" }}>
                    <Checkbox checked={includeSub} onChange={setIncludeSub} />
                    <span onClick={() => setIncludeSub((v) => !v)}>{t("documents.folders.includeSubfolders")}</span>
                  </label>
                )}
                <span style={{ flex: 1 }} />
                {selectedFolder && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span title={selectedFolder.depth >= DOCUMENT_FOLDER_MAX_DEPTH ? t("documents.folders.maxDepthHint") : undefined}>
                      <Button
                        size="sm"
                        variant="secondary"
                        iconL={<Icons.Plus size={14} />}
                        disabled={selectedFolder.depth >= DOCUMENT_FOLDER_MAX_DEPTH}
                        onClick={() => openCatCreate(selectedFolder)}
                      >
                        {t("documents.folders.newSubfolder")}
                      </Button>
                    </span>
                    <Button size="sm" variant="ghost" iconL={<Icons.Edit size={14} />} onClick={() => openCatEdit(selectedFolder)}>{t("documents.folders.rename")}</Button>
                    <Button size="sm" variant="ghost" iconL={<Icons.ArrowRight size={14} />} onClick={() => openMove(selectedFolder)}>{t("documents.folders.move")}</Button>
                    <Toggle
                      checked={selectedFolder.active}
                      onChange={(v) => catToggleM.mutate({ id: selectedFolder.id, active: v })}
                      label={t("documents.folders.active")}
                    />
                    <span title={deleteBlockReason(selectedFolder) ?? undefined}>
                      <IconButton
                        icon={<Icons.Trash size={15} />}
                        danger
                        title={deleteBlockReason(selectedFolder) ?? t("documents.delete")}
                        disabled={!!deleteBlockReason(selectedFolder)}
                        onClick={() => openCatDelete(selectedFolder)}
                      />
                    </span>
                  </div>
                )}
              </div>

              {docsQ.isLoading ? (
                <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
              ) : docsQ.isError ? (
                <div style={{ padding: 24, color: "var(--err)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span>{t("documents.loadError", { error: errText(docsQ.error) })}</span>
                  <Button size="sm" variant="secondary" onClick={() => docsQ.refetch()}>{t("common.retry")}</Button>
                </div>
              ) : docs.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>
                  {selectedFolder ? t("documents.folders.emptyFolder") : filtersActive ? t("documents.emptyFiltered") : t("documents.empty")}
                </div>
              ) : (
                <>
                  {/* §5.1 bis — compteurs du journal : seul « tableau de bord » de la V1. */}
                  <div style={{ display: "flex", gap: 18, padding: "10px 16px", borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap", fontSize: 13, color: "var(--ink-500)" }}>
                    <span>{t("documents.totalsDocuments", { count: docs.length })}</span>
                    <span>{t("documents.totalsOpens", { count: totals.opens })}</span>
                    <span>{t("documents.totalsWalls", { count: totals.walls })}</span>
                    <span>{t("documents.totalsInstallClicks", { count: totals.installClicks })}</span>
                    <span>{t("documents.totalsShares", { count: totals.shares })}</span>
                  </div>
                  <Table columns={cols} rows={docs.map((d) => ({ ...d, _key: d.id }))} onRowClick={(d) => setDetail(d)} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Détail d'un document ---------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.title}
        sub={detail ? `${detail.ministryName ?? ministryName(detail.ministryId)} · v${detail.version}` : undefined}
        footer={detail && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%" }}>
            {detail.status === "PUBLISHED" ? (
              <Button variant="secondary" onClick={() => setConfirm({ kind: "unpublish", doc: detail })}>{t("documents.unpublish")}</Button>
            ) : (
              <Button variant="primary" disabled={publishM.isPending} onClick={() => publishM.mutate(detail)}>
                {publishM.isPending ? t("common.loading") : detail.status === "DRAFT" ? t("documents.publish") : t("documents.republish")}
              </Button>
            )}
            <Button variant="secondary" iconL={<Icons.Edit size={14} />} onClick={() => openEdit(detail)}>{t("documents.edit")}</Button>
            <Button variant="secondary" iconL={<Icons.Upload size={14} />} onClick={() => openReplace(detail)}>{t("documents.replaceFile")}</Button>
            {detail.shareSlug && (
              <Button variant="ghost" iconL={<Icons.History size={14} />} onClick={() => setConfirm({ kind: "regenerate", doc: detail })}>
                {t("documents.regenerateLink")}
              </Button>
            )}
            <Button variant="danger" iconL={<Icons.Trash size={14} />} onClick={() => setConfirm({ kind: "delete", doc: detail })}>{t("documents.delete")}</Button>
          </div>
        )}
      >
        {detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>{statusBadges(detail)}</div>

            <section>
              <div style={sectionTitle}>{t("documents.linkTitle")}</div>
              {detail.shareUrl ? (
                <>
                  <ShareLink url={detail.shareUrl} onCopy={copy} copyLabel={t("common.copy")} />
                  <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 6 }}>
                    {detail.available
                      ? t("documents.linkAvailable")
                      : detail.status !== "PUBLISHED"
                        ? t("documents.linkUnpublished")
                        : isExpired(detail)
                          ? t("documents.linkExpired")
                          : t("documents.unavailableModuleHint")}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "var(--ink-500)" }}>{t("documents.noLinkYet")}</div>
              )}
            </section>

            <section>
              <div style={sectionTitle}>{t("documents.statsTitle")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <Stat label={t("documents.stats.opens")} value={detail.stats.opens} />
                <Stat label={t("documents.stats.walls")} value={detail.stats.walls} />
                <Stat label={t("documents.stats.installClicks")} value={detail.stats.installClicks} />
                <Stat label={t("documents.stats.openApp")} value={detail.stats.openApp} />
                <Stat label={t("documents.stats.shares")} value={detail.stats.shares} />
                <Stat label={t("documents.stats.uniqueVisitors")} value={detail.stats.uniqueVisitors} />
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-400)", marginTop: 6 }}>{t("documents.statsHint")}</div>
            </section>

            <section>
              <div style={sectionTitle}>{t("documents.infoTitle")}</div>
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0, fontSize: 13.5 }}>
                <InfoRow label={t("documents.colScope")} value={`${t(`subscriptions.level.${detail.scopeLevel}`)} · ${scopeLabel(detail.scopeLevel, detail.scopeName)}`} />
                <InfoRow label={t("documents.folders.col")} value={docFolderLabel(detail)} />
                <InfoRow label={t("documents.authorLabel")} value={detail.author ?? t("common.dash")} />
                <InfoRow label={t("documents.languageLabel")} value={detail.language ? t(`documents.language.${detail.language}`) : t("common.dash")} />
                <InfoRow
                  label={t("documents.colPreview")}
                  value={detail.open
                    ? t("documents.openFull", { total: detail.pageCount })
                    : t("documents.previewPages", { free: Math.min(detail.freePages, detail.pageCount), total: detail.pageCount })}
                />
                <InfoRow label={t("documents.fileLabel")} value={t("documents.fileInfo", { size: (detail.fileSize / 1_048_576).toFixed(1), version: detail.version })} />
                <InfoRow label={t("documents.expiresAtLabel")} value={detail.expiresAt ? fmtDateTime(detail.expiresAt) : t("documents.neverExpires")} />
                <InfoRow label={t("documents.publishedAtLabel")} value={fmtDateTime(detail.publishedAt)} />
                <InfoRow label={t("documents.updatedAtLabel")} value={fmtDateTime(detail.updatedAt ?? detail.createdAt)} />
                <InfoRow label="SHA-256" value={<span className="mono" title={detail.fileSha256}>{detail.fileSha256.slice(0, 16)}…</span>} />
              </dl>
              {detail.description && <p style={{ margin: "12px 0 0", color: "var(--ink-700)", whiteSpace: "pre-wrap" }}>{detail.description}</p>}
            </section>
          </div>
        )}
      </Drawer>

      {/* ---------------- Création ---------------- */}
      <Modal
        open={createOpen}
        onClose={createBusy ? undefined : closeCreate}
        size="lg"
        title={createStep === "published" ? t("documents.publishedTitle") : t("documents.createTitle")}
        sub={
          createStep === "upload" ? t("documents.createStep1")
            : createStep === "preview" ? t("documents.createStep2", { pages: created?.pageCount ?? 0 })
            : created?.title
        }
        footer={
          createStep === "upload" ? (
            <>
              <Button variant="ghost" onClick={closeCreate} disabled={createBusy}>{t("common.cancel")}</Button>
              <Button
                variant="primary"
                iconL={<Icons.Upload size={14} />}
                disabled={!createMinistry || !createFile || !!fileError || !metaValid(meta) || createBusy}
                onClick={() => createFile && uploadM.mutate({ file: createFile, ministryId: createMinistry, meta })}
              >
                {uploadM.isPending ? t("documents.uploading") : t("documents.uploadButton")}
              </Button>
            </>
          ) : createStep === "preview" && created ? (
            <>
              <Button
                variant="ghost"
                disabled={createBusy || parseFreePages(preview.freePages, created.pageCount) == null}
                onClick={() => finishM.mutate({ doc: created, meta, preview, publish: false })}
              >
                {t("documents.keepDraft")}
              </Button>
              <Button
                variant="primary"
                disabled={createBusy || parseFreePages(preview.freePages, created.pageCount) == null}
                onClick={() => finishM.mutate({ doc: created, meta, preview, publish: true })}
              >
                {finishM.isPending ? t("common.loading") : t("documents.publish")}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setCreateOpen(false)}>{t("common.done")}</Button>
          )
        }
      >
        {createStep === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label={t("documents.ministryLabel")}>
              <Select
                value={createMinistry}
                onChange={(e) => { setCreateMinistry(e.target.value); setMeta((m) => ({ ...m, scope: { level: "MINISTRY", id: null }, categoryId: "" })); }}
                disabled={createBusy}
              >
                <option value="">{t("common.choose")}</option>
                {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
            <Field label={t("documents.fileLabel")} hint={t("documents.fileHint")}>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="input"
                disabled={createBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setCreateFile(null);
                  void pickFile(f, (ok) => {
                    setCreateFile(ok);
                    // Titre proposé à partir du nom du fichier, s'il n'a pas encore été saisi.
                    setMeta((m) => (m.title.trim() ? m : { ...m, title: ok.name.replace(/\.pdf$/i, "").slice(0, DOCUMENT_LIMITS.title) }));
                  }, setFileError);
                }}
              />
              {fileError && <span style={errorStyle}>{fileError}</span>}
            </Field>
            <MetaFields
              meta={meta}
              setMeta={setMeta}
              ministryId={createMinistry}
              ministryName={createMinistryName}
              folders={createFolderIndex}
              foldersLoading={formCategoriesQ.isLoading}
              disabled={createBusy}
            />
          </div>
        )}

        {createStep === "preview" && created && (
          <PreviewFields preview={preview} setPreview={setPreview} pageCount={created.pageCount} disabled={createBusy} />
        )}

        {createStep === "published" && created && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {created.shareUrl && <ShareLink url={created.shareUrl} onCopy={copy} copyLabel={t("common.copy")} />}
            <p style={{ margin: 0, color: "var(--ink-500)", fontSize: 13 }}>
              {created.available ? t("documents.publishedHint") : isExpired(created) ? t("documents.linkExpired") : t("documents.unavailableModuleHint")}
            </p>
          </div>
        )}
      </Modal>

      {/* ---------------- Modification ---------------- */}
      <Modal
        open={!!editing}
        onClose={editM.isPending ? undefined : () => setEditing(null)}
        size="lg"
        title={t("documents.editTitle")}
        sub={editing ? `${editing.ministryName ?? ministryName(editing.ministryId)} · ${t("documents.pagesCount", { count: editing.pageCount })}` : undefined}
        footer={editing && (
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={editM.isPending}>{t("common.cancel")}</Button>
            <Button
              variant="primary"
              disabled={editM.isPending || !metaValid(editMeta) || parseFreePages(editPreview.freePages, editing.pageCount) == null}
              onClick={() => editM.mutate({ doc: editing, meta: editMeta, preview: editPreview })}
            >
              {editM.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </>
        )}
      >
        {editing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <MetaFields
              meta={editMeta}
              setMeta={setEditMeta}
              ministryId={editing.ministryId}
              ministryName={editing.ministryName ?? ministryName(editing.ministryId)}
              folders={editFolderIndex}
              foldersLoading={editCategoriesQ.isLoading}
              disabled={editM.isPending}
            />
            <PreviewFields preview={editPreview} setPreview={setEditPreview} pageCount={editing.pageCount} disabled={editM.isPending} />
          </div>
        )}
      </Modal>

      {/* ---------------- Remplacement du fichier (RG-DOC-08) ---------------- */}
      <Modal
        open={!!replacing}
        onClose={replaceM.isPending ? undefined : () => setReplacing(null)}
        title={t("documents.replaceTitle")}
        sub={replacing ? `${replacing.title} · v${replacing.version}` : undefined}
        footer={replacing && (
          <>
            <Button variant="ghost" onClick={() => setReplacing(null)} disabled={replaceM.isPending}>{t("common.cancel")}</Button>
            <Button
              variant="primary"
              iconL={<Icons.Upload size={14} />}
              disabled={!replaceFile || !!replaceError || replaceM.isPending}
              onClick={() => replaceFile && replaceM.mutate({ doc: replacing, file: replaceFile })}
            >
              {replaceM.isPending ? t("documents.uploading") : t("documents.replaceButton")}
            </Button>
          </>
        )}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, color: "var(--ink-700)" }}>{t("documents.replaceExplain")}</p>
          <Field label={t("documents.fileLabel")} hint={t("documents.fileHint")}>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="input"
              disabled={replaceM.isPending}
              onChange={(e) => {
                setReplaceFile(null);
                void pickFile(e.target.files?.[0] ?? null, setReplaceFile, setReplaceError);
              }}
            />
            {replaceError && <span style={errorStyle}>{replaceError}</span>}
          </Field>
        </div>
      </Modal>

      {/* ---------------- Confirmations ---------------- */}
      <Modal
        open={!!confirm}
        onClose={confirmM.isPending ? undefined : () => setConfirm(null)}
        title={confirm ? t(`documents.confirm.${confirm.kind}.title`) : undefined}
        sub={confirm?.doc.title}
        footer={confirm && (
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={confirmM.isPending}>{t("common.cancel")}</Button>
            <Button variant={confirm.kind === "unpublish" ? "primary" : "danger"} disabled={confirmM.isPending} onClick={() => confirmM.mutate(confirm)}>
              {confirmM.isPending ? t("common.loading") : t(`documents.confirm.${confirm.kind}.button`)}
            </Button>
          </>
        )}
      >
        {confirm && <p style={{ margin: 0, color: "var(--ink-700)" }}>{t(`documents.confirm.${confirm.kind}.body`)}</p>}
      </Modal>

      {/* ---------------- Dossier : création / renommage (D-DOC-16) ---------------- */}
      <Modal
        open={catOpen}
        onClose={catSaveM.isPending ? undefined : () => setCatOpen(false)}
        title={catEditing ? t("documents.folders.editTitle") : catParent ? t("documents.folders.createSubTitle") : t("documents.folders.createTitle")}
        sub={
          catEditing
            ? `${ministryName(catEditing.ministryId)} · ${folderIndex.byId.has(catEditing.id) ? folderPathLabel(folderIndex, catEditing.id, folderLabel) : folderLabel(catEditing)}`
            : catParent
              ? t("documents.folders.createSubIn", { path: folderIndex.byId.has(catParent.id) ? folderPathLabel(folderIndex, catParent.id, folderLabel) : folderLabel(catParent) })
              : t("documents.folders.createSubRoot")
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setCatOpen(false)} disabled={catSaveM.isPending}>{t("common.cancel")}</Button>
            <Button variant="primary" disabled={!catCanSave} onClick={() => catSaveM.mutate({ editing: catEditing, parent: catParent, form: catForm })}>
              {catSaveM.isPending ? t("common.saving") : catEditing ? t("common.save") : t("documents.folders.createButton")}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!catEditing && !catParent && (
            <Field label={t("documents.ministryLabel")}>
              <Select value={catForm.ministryId} onChange={(e) => setCatForm({ ...catForm, ministryId: e.target.value })}>
                <option value="">{t("common.choose")}</option>
                {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("documents.folders.nameLabel")}>
              <Input value={catForm.name} maxLength={DOCUMENT_LIMITS.categoryName} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder={t("documents.folders.namePlaceholder")} />
            </Field>
            <Field label={t("documents.folders.nameEnLabel")} hint={t("documents.folders.nameEnHint")}>
              <Input value={catForm.nameEn} maxLength={DOCUMENT_LIMITS.categoryName} onChange={(e) => setCatForm({ ...catForm, nameEn: e.target.value })} placeholder={t("documents.folders.nameEnPlaceholder")} />
            </Field>
          </div>
          <Field label={t("documents.folders.orderLabel")} hint={catEditing ? t("documents.folders.orderEditHint") : t("documents.folders.orderHint")}>
            <Input
              type="number"
              min={0}
              max={ORDER_MAX}
              value={catForm.displayOrder}
              onChange={(e) => setCatForm({ ...catForm, displayOrder: e.target.value })}
              aria-invalid={!!catOrderError}
              style={catOrderError ? { borderColor: "var(--err)" } : undefined}
            />
            {catOrderError && <span style={errorStyle}>{catOrderError}</span>}
          </Field>
        </div>
      </Modal>

      {/* ---------------- Dossier : déplacement (D-DOC-16) ---------------- */}
      <Modal
        open={!!moving}
        onClose={moveM.isPending ? undefined : () => setMoving(null)}
        size="lg"
        title={t("documents.folders.moveTitle")}
        sub={moving ? (folderIndex.byId.has(moving.id) ? folderPathLabel(folderIndex, moving.id, folderLabel) : folderLabel(moving)) : undefined}
        footer={moving && (
          <>
            <Button variant="ghost" onClick={() => setMoving(null)} disabled={moveM.isPending}>{t("common.cancel")}</Button>
            <Button
              variant="primary"
              disabled={!moveChanged || moveM.isPending}
              onClick={() => moveTarget !== undefined && moveM.mutate({ folder: moving, parentId: moveTarget })}
            >
              {moveM.isPending ? t("common.saving") : t("documents.folders.moveButton")}
            </Button>
          </>
        )}
      >
        {moving && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, color: "var(--ink-700)" }}>{t("documents.folders.moveExplain")}</p>
            <FolderTreePicker
              index={folderIndex}
              value={moveTarget === undefined ? moving.parentId : moveTarget}
              onChange={setMoveTarget}
              noneLabel={t("documents.folders.moveRoot")}
              disabled={moveM.isPending}
              disabledReason={moveReason}
            />
          </div>
        )}
      </Modal>

      {/* ---------------- Dossier : suppression (non vide → refus / désactiver) ---------------- */}
      <Modal
        open={!!catDeleting}
        onClose={catDeleteBusy ? undefined : closeCatDelete}
        title={catDeleteBlocked ? t("documents.folders.deleteBlockedTitle") : t("documents.folders.deleteTitle")}
        sub={catDeleting ? folderLabel(catDeleting) : undefined}
        footer={
          catDeleteBlocked ? (
            <>
              <Button variant="ghost" onClick={closeCatDelete} disabled={catDeleteBusy}>{t("common.close")}</Button>
              {catDeleteBlocked === "documents" && catDeleting?.active && (
                <Button
                  variant="primary"
                  disabled={catToggleM.isPending}
                  onClick={() => catDeleting && catToggleM.mutate({ id: catDeleting.id, active: false }, { onSuccess: closeCatDelete })}
                >
                  {catToggleM.isPending ? t("common.loading") : t("documents.folders.deactivateInstead")}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={closeCatDelete} disabled={catDeleteBusy}>{t("common.cancel")}</Button>
              <Button variant="danger" disabled={catDeleteM.isPending} onClick={() => catDeleting && catDeleteM.mutate(catDeleting)}>
                {catDeleteM.isPending ? t("common.loading") : t("documents.folders.confirmDelete")}
              </Button>
            </>
          )
        }
      >
        {catDeleteBlocked === "children" ? (
          <p style={{ margin: 0, color: "var(--ink-700)" }}>{t(errKey("DOC_FOLDER_NOT_EMPTY"))}</p>
        ) : catDeleteBlocked === "documents" ? (
          <>
            <p style={{ margin: "0 0 10px", color: "var(--ink-700)" }}>{t(errKey("DOC_CATEGORY_IN_USE"))}</p>
            <p style={{ margin: 0, color: "var(--ink-500)" }}>
              {catDeleting?.active ? t("documents.folders.deactivateExplain") : t("documents.folders.alreadyInactive")}
            </p>
          </>
        ) : (
          <p style={{ margin: 0, color: "var(--ink-500)" }}>{t("documents.folders.deleteWarning")}</p>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------------------------

const sectionTitle = {
  fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "var(--ink-400)", fontWeight: 600, marginBottom: 8,
};

function MetaFields({
  meta, setMeta, ministryId, ministryName, folders, foldersLoading, disabled,
}: {
  meta: MetaForm;
  setMeta: (f: (m: MetaForm) => MetaForm) => void;
  ministryId: string;
  ministryName: string;
  folders: FolderIndex;
  foldersLoading?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t("documents.titleLabel")}>
        <Input value={meta.title} maxLength={DOCUMENT_LIMITS.title} disabled={disabled} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} />
      </Field>
      <Field label={t("documents.descriptionLabel")} hint={t("documents.descriptionHint")}>
        <textarea
          className="input"
          rows={3}
          maxLength={DOCUMENT_LIMITS.description}
          disabled={disabled}
          value={meta.description}
          onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
        />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Field label={t("documents.authorLabel")}>
          <Input value={meta.author} maxLength={DOCUMENT_LIMITS.author} disabled={disabled} onChange={(e) => setMeta((m) => ({ ...m, author: e.target.value }))} />
        </Field>
        <Field label={t("documents.languageLabel")}>
          <Select value={meta.language} disabled={disabled} onChange={(e) => setMeta((m) => ({ ...m, language: e.target.value as "" | DocumentLanguage }))}>
            <option value="">{t("common.dash")}</option>
            {DOCUMENT_LANGUAGES.map((l) => <option key={l} value={l}>{t(`documents.language.${l}`)}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t("documents.scopeLabel")} hint={t("documents.scopeHint")}>
        <ScopeTreePicker
          ministryId={ministryId}
          ministryName={ministryName}
          value={meta.scope}
          onChange={(scope) => { if (!disabled) setMeta((m) => ({ ...m, scope })); }}
        />
      </Field>
      {/* D-DOC-16 (JP 19/10) — le dossier se choisit dans l'arbre ; chemin complet affiché. Déplacer un document = changer ce champ. */}
      <Field label={t("documents.folders.pickerLabel")} hint={ministryId && !foldersLoading && folders.roots.length === 0 ? t("documents.folders.pickerNoneHint") : undefined}>
        {!ministryId ? (
          <div style={{ color: "var(--ink-500)", fontSize: 13 }}>{t("documents.scopePickMinistryFirst")}</div>
        ) : foldersLoading ? (
          <div style={{ color: "var(--ink-500)", fontSize: 13 }}>{t("common.loading")}</div>
        ) : (
          <FolderTreePicker
            index={folders}
            value={meta.categoryId || null}
            onChange={(id) => setMeta((m) => ({ ...m, categoryId: id ?? "" }))}
            noneLabel={t("documents.folders.noFolder")}
            disabled={disabled}
          />
        )}
      </Field>
    </>
  );
}

function PreviewFields({
  preview, setPreview, pageCount, disabled,
}: {
  preview: PreviewForm;
  setPreview: (f: (p: PreviewForm) => PreviewForm) => void;
  pageCount: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const free = parseFreePages(preview.freePages, pageCount);
  const freeError = free == null ? t("documents.freePagesInvalid", { max: pageCount }) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* RG-DOC-01c — freePages ∈ [1, pageCount] ; sans effet quand le document est libre. */}
        <Field label={t("documents.freePagesLabel", { total: pageCount })} hint={t("documents.freePagesHint")}>
          <Input
            type="number"
            min={1}
            max={pageCount}
            value={preview.freePages}
            disabled={disabled}
            onChange={(e) => setPreview((p) => ({ ...p, freePages: e.target.value }))}
            aria-invalid={!!freeError}
            style={freeError ? { borderColor: "var(--err)" } : undefined}
          />
          {freeError && <span style={errorStyle}>{freeError}</span>}
        </Field>
        <Field label={t("documents.expiresAtLabel")} hint={t("documents.expiresAtHint")}>
          <Input
            type="datetime-local"
            value={preview.expiresAt}
            disabled={disabled}
            onChange={(e) => setPreview((p) => ({ ...p, expiresAt: e.target.value }))}
          />
        </Field>
      </div>
      {free != null && free >= pageCount && !preview.open && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "var(--warn)", fontSize: 13 }}>
          <Icons.Info size={15} /><span>{t("documents.freePagesAll")}</span>
        </div>
      )}
      {/* D-DOC-06 — `open` est un champ distinct : le PDF complet servi partout, sans mur. */}
      <Field hint={t("documents.openHint")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Checkbox checked={preview.open} onChange={(v) => !disabled && setPreview((p) => ({ ...p, open: v }))} />
          <span style={{ cursor: "pointer" }} onClick={() => !disabled && setPreview((p) => ({ ...p, open: !p.open }))}>
            {t("documents.openLabel")}
          </span>
        </div>
      </Field>
    </div>
  );
}

function ShareLink({ url, onCopy, copyLabel }: { url: string; onCopy: (u: string) => void; copyLabel: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input className="input mono" readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, fontSize: 13 }} />
      <Button variant="primary" iconL={<Icons.Copy size={14} />} onClick={() => onCopy(url)}>{copyLabel}</Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--radius-sm)", padding: "8px 10px", background: "var(--ivory-raised)" }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, color: "var(--green-800)" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--ink-500)" }}>{label}</dt>
      <dd style={{ margin: 0, color: "var(--ink-800)" }}>{value}</dd>
    </>
  );
}
