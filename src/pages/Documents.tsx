import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Checkbox, Drawer, Field, IconButton, Input, Modal, Select, Table, Toggle, TopBar } from "@/components/primitives";
import { ScopeTreePicker, type ScopeValue } from "@/components/ScopeTreePicker";
import { useMinistryTree } from "@/hooks/useMinistryTree";
import { flattenTree } from "@/lib/orgTree";
import { useToasts } from "@/context/ToastContext";
import { useDebounced } from "@/hooks/useDebounced";
import { apiErrorCode } from "@/services/api";
import { listMinistries } from "@/services/ministryService";
import {
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

type Tab = "documents" | "categories";
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

  const [tab, setTab] = useState<Tab>("documents");
  const [ministryId, setMinistryId] = useState("");
  const [scopeKey, setScopeKey] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
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
  const docsQ = useQuery({
    queryKey: ["documents", ministryId, scopeKey, categoryFilter, statusFilter, q],
    queryFn: () => listDocuments({
      ministryId: ministryId || undefined,
      ...scopeFilter,
      categoryId: categoryFilter || undefined,
      status: statusFilter || undefined,
      q,
    }),
  });

  const errText = (e: unknown): string => {
    const code = apiErrorCode(e);
    if (code && i18n.exists(errKey(code))) return t(errKey(code));
    return e instanceof Error ? e.message : t("common.error");
  };
  const categoryLabel = (c: { name: string | null; nameEn: string | null } | null | undefined) =>
    !c || !c.name ? t("common.dash") : lang === "en" ? c.nameEn ?? c.name : c.name;
  const docCategoryLabel = (d: AdminDocument) =>
    d.categoryId ? categoryLabel({ name: d.categoryName, nameEn: d.categoryNameEn }) : t("documents.noCategory");
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
    setCategoryFilter("");
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
    setMeta(emptyMeta());
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
  const docs = useMemo(() => docsQ.data ?? [], [docsQ.data]);
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
    { label: t("documents.colCategory"), render: (d: AdminDocument) => <span style={{ color: "var(--ink-700)" }}>{docCategoryLabel(d)}</span> },
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
  // Catégories (RG-FOLDER-03)
  // -------------------------------------------------------------------------------------------
  const [catEditing, setCatEditing] = useState<DocumentCategory | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ ministryId: "", name: "", nameEn: "", displayOrder: "" });
  const [catDeleting, setCatDeleting] = useState<DocumentCategory | null>(null);
  const [catDeleteBlocked, setCatDeleteBlocked] = useState(false);

  const openCatCreate = () => {
    setCatEditing(null);
    setCatForm({ ministryId, name: "", nameEn: "", displayOrder: "" });
    setCatOpen(true);
  };
  const openCatEdit = (c: DocumentCategory) => {
    setCatEditing(c);
    setCatForm({ ministryId: c.ministryId, name: c.name, nameEn: c.nameEn ?? "", displayOrder: String(c.displayOrder) });
    setCatOpen(true);
  };

  const catSaveM = useMutation({
    mutationFn: async (v: { editing: DocumentCategory | null; form: typeof catForm }): Promise<DocumentCategory> => {
      const { editing, form } = v;
      const order = parseOrder(form.displayOrder);
      if (!editing) {
        return createDocumentCategory({
          ministryId: form.ministryId,
          name: form.name.trim(),
          nameEn: opt(form.nameEn),
          displayOrder: order ?? undefined,
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
      // Le libellé de catégorie est recopié dans chaque AdminDocument.
      if (v.editing) invalidateDocs();
      setCatOpen(false);
      push({ kind: "ok", title: v.editing ? t("documents.categoryUpdatedToast") : t("documents.categoryCreatedToast"), msg: c.name });
    },
    onError: (e: unknown, v) => {
      invalidateCategories();
      push({ kind: "error", title: t("documents.saveFailToast"), msg: errText(e) });
      if (v.editing && apiErrorCode(e) === "RESOURCE_NOT_FOUND") setCatOpen(false);
    },
  });

  const catToggleM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => updateDocumentCategory(v.id, { active: v.active }),
    onSuccess: (c) => {
      invalidateCategories();
      push({ kind: "ok", title: c.active ? t("documents.categoryActivatedToast") : t("documents.categoryDeactivatedToast"), msg: c.name });
    },
    onError: (e: unknown) => { invalidateCategories(); push({ kind: "error", title: t("common.failure"), msg: errText(e) }); },
  });

  const closeCatDelete = () => { setCatDeleting(null); setCatDeleteBlocked(false); };
  const catDeleteM = useMutation({
    mutationFn: (c: DocumentCategory) => deleteDocumentCategory(c.id),
    onSuccess: (_, c) => {
      invalidateCategories();
      closeCatDelete();
      push({ kind: "ok", title: t("documents.categoryDeletedToast"), msg: c.name });
    },
    onError: (e: unknown) => {
      invalidateCategories();
      // Un document a pu la référencer depuis le chargement : on bascule sur « désactiver ».
      if (apiErrorCode(e) === "DOC_CATEGORY_IN_USE") { setCatDeleteBlocked(true); return; }
      push({ kind: "error", title: t("documents.deleteFailToast"), msg: errText(e) });
      if (apiErrorCode(e) === "RESOURCE_NOT_FOUND") closeCatDelete();
    },
  });
  const catDeleteBusy = catDeleteM.isPending || catToggleM.isPending;

  const catOrderError = (catEditing || catForm.displayOrder.trim() !== "") && parseOrder(catForm.displayOrder) == null
    ? t("documents.categoryOrderInvalid", { max: ORDER_MAX })
    : null;
  const catCanSave = !!catForm.ministryId && !!catForm.name.trim() && !catOrderError && !catSaveM.isPending;

  const categoryRows = useMemo(() => {
    const list = categoriesQ.data ?? [];
    if (ministryId) return list;
    return [...list].sort((a, b) =>
      ministryName(a.ministryId).localeCompare(ministryName(b.ministryId))
      || a.displayOrder - b.displayOrder
      || a.name.localeCompare(b.name));
  }, [categoriesQ.data, ministryId, ministryName]);

  const catCols = [
    { label: t("documents.categoryColOrder"), style: { width: 1 }, render: (c: DocumentCategory) => <span className="mono" style={{ color: "var(--ink-500)" }}>{c.displayOrder}</span> },
    {
      label: t("documents.categoryColName"),
      render: (c: DocumentCategory) => (
        <div>
          <div style={{ fontWeight: 500, color: "var(--ink-900)" }}>{c.name}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{c.nameEn ?? t("documents.categoryNoNameEn")}</div>
        </div>
      ),
    },
    ...(ministryId
      ? []
      : [{ label: t("documents.colMinistry"), render: (c: DocumentCategory) => <span style={{ color: "var(--ink-700)" }}>{ministryName(c.ministryId)}</span> }]),
    {
      label: t("documents.colStatus"),
      cellStyle: { whiteSpace: "nowrap" as const },
      render: (c: DocumentCategory) => (
        <div style={{ display: "flex", gap: 6 }}>
          {c.active ? <Badge tone="ok" dot>{t("documents.categoryActive")}</Badge> : <Badge tone="gray" dot>{t("documents.categoryInactive")}</Badge>}
          {c.inUse && <Badge tone="earth">{t("documents.categoryInUseBadge")}</Badge>}
        </div>
      ),
    },
    {
      label: "",
      style: { width: 1 },
      cellStyle: { whiteSpace: "nowrap" as const },
      render: (c: DocumentCategory) => (
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          <Toggle checked={c.active} onChange={(v) => catToggleM.mutate({ id: c.id, active: v })} label={t("documents.categoryActive")} />
          <IconButton icon={<Icons.Edit size={15} />} title={t("documents.edit")} onClick={() => openCatEdit(c)} />
          <IconButton
            icon={<Icons.Trash size={15} />}
            danger
            title={c.inUse ? t("documents.categoryInUseHint") : t("documents.delete")}
            onClick={() => { setCatDeleting(c); setCatDeleteBlocked(c.inUse); }}
          />
        </div>
      ),
    },
  ];

  // -------------------------------------------------------------------------------------------
  // JSX
  // -------------------------------------------------------------------------------------------
  const createCategories = formCategoriesQ.data ?? [];
  const createMinistryName = createMinistry ? ministryName(createMinistry) : "";

  return (
    <>
      <TopBar
        title={t("documents.title")}
        crumbs={[t("common.jexcellence"), t("documents.title")]}
        actions={
          tab === "documents" ? (
            <Button variant="primary" iconL={<Icons.Upload size={15} />} onClick={openCreate}>{t("documents.newDocument")}</Button>
          ) : (
            <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={openCatCreate}>{t("documents.newCategory")}</Button>
          )
        }
      />
      <div className="content">
        <p className="section-sub">
          <Trans i18nKey="documents.intro" components={{ strong: <strong /> }} />
        </p>

        <div className="tabs">
          <button className={`tab ${tab === "documents" ? "active" : ""}`} onClick={() => setTab("documents")}>
            <Icons.Folder size={15} />{t("documents.tabDocuments")}
          </button>
          <button className={`tab ${tab === "categories" ? "active" : ""}`} onClick={() => setTab("categories")}>
            <Icons.Tag size={15} />{t("documents.tabCategories")}
          </button>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{t("documents.filterMinistry")}</span>
            <Select value={ministryId} onChange={(e) => changeMinistry(e.target.value)}>
              <option value="">{t("documents.allMinistries")}</option>
              {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
            {tab === "documents" && (
              <>
                <Select
                  value={scopeKey}
                  onChange={(e) => setScopeKey(e.target.value)}
                  disabled={!ministryId}
                  title={ministryId ? undefined : t("documents.filterNeedsMinistry")}
                >
                  <option value="">{t("documents.allScopes")}</option>
                  {scopeOptions.map(({ node, depth }) => (
                    <option key={`${node.level}:${node.id}`} value={node.level === "MINISTRY" ? "MINISTRY" : `${node.level}:${node.id}`}>
                      {`${"  ".repeat(depth)}${node.level === "MINISTRY" ? t("documents.scopeWholeMinistry") : node.name}`}
                    </option>
                  ))}
                </Select>
                <Select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  disabled={!ministryId}
                  title={ministryId ? undefined : t("documents.filterNeedsMinistry")}
                >
                  <option value="">{t("documents.allCategories")}</option>
                  {(ministryId ? categoriesQ.data ?? [] : []).map((c) => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
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
              </>
            )}
            {ministriesQ.isError && <span style={errorStyle}>{t("documents.ministriesLoadError", { error: errText(ministriesQ.error) })}</span>}
          </div>

          {tab === "documents" ? (
            docsQ.isLoading ? (
              <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
            ) : docsQ.isError ? (
              <div style={{ padding: 24, color: "var(--err)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span>{t("documents.loadError", { error: errText(docsQ.error) })}</span>
                <Button size="sm" variant="secondary" onClick={() => docsQ.refetch()}>{t("common.retry")}</Button>
              </div>
            ) : docs.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>
                {ministryId || scopeKey || categoryFilter || statusFilter || q ? t("documents.emptyFiltered") : t("documents.empty")}
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
            )
          ) : categoriesQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : categoriesQ.isError ? (
            <div style={{ padding: 24, color: "var(--err)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span>{t("documents.categoriesLoadError", { error: errText(categoriesQ.error) })}</span>
              <Button size="sm" variant="secondary" onClick={() => categoriesQ.refetch()}>{t("common.retry")}</Button>
            </div>
          ) : categoryRows.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>
              {ministryId ? t("documents.categoriesEmptyMinistry") : t("documents.categoriesEmpty")}
            </div>
          ) : (
            <Table columns={catCols} rows={categoryRows.map((c) => ({ ...c, _key: c.id }))} onRowClick={openCatEdit} />
          )}
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
                <InfoRow label={t("documents.colCategory")} value={docCategoryLabel(detail)} />
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
              categories={createCategories}
              categoryLabel={categoryLabel}
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
              categories={editCategoriesQ.data ?? []}
              categoryLabel={categoryLabel}
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

      {/* ---------------- Catégorie : création / modification ---------------- */}
      <Modal
        open={catOpen}
        onClose={catSaveM.isPending ? undefined : () => setCatOpen(false)}
        title={catEditing ? t("documents.categoryEditTitle") : t("documents.categoryCreateTitle")}
        sub={catEditing ? ministryName(catEditing.ministryId) : t("documents.categoryCreateSub")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCatOpen(false)} disabled={catSaveM.isPending}>{t("common.cancel")}</Button>
            <Button variant="primary" disabled={!catCanSave} onClick={() => catSaveM.mutate({ editing: catEditing, form: catForm })}>
              {catSaveM.isPending ? t("common.saving") : catEditing ? t("common.save") : t("documents.categoryCreateButton")}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!catEditing && (
            <Field label={t("documents.ministryLabel")}>
              <Select value={catForm.ministryId} onChange={(e) => setCatForm({ ...catForm, ministryId: e.target.value })}>
                <option value="">{t("common.choose")}</option>
                {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("documents.categoryNameLabel")}>
              <Input value={catForm.name} maxLength={DOCUMENT_LIMITS.categoryName} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder={t("documents.categoryNamePlaceholder")} />
            </Field>
            <Field label={t("documents.categoryNameEnLabel")} hint={t("documents.categoryNameEnHint")}>
              <Input value={catForm.nameEn} maxLength={DOCUMENT_LIMITS.categoryName} onChange={(e) => setCatForm({ ...catForm, nameEn: e.target.value })} placeholder={t("documents.categoryNameEnPlaceholder")} />
            </Field>
          </div>
          <Field label={t("documents.categoryOrderLabel")} hint={catEditing ? undefined : t("documents.categoryOrderHint")}>
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

      {/* ---------------- Catégorie : suppression (utilisée → désactiver) ---------------- */}
      <Modal
        open={!!catDeleting}
        onClose={catDeleteBusy ? undefined : closeCatDelete}
        title={catDeleteBlocked ? t("documents.categoryDeleteBlockedTitle") : t("documents.categoryDeleteTitle")}
        sub={catDeleting?.name}
        footer={
          catDeleteBlocked ? (
            <>
              <Button variant="ghost" onClick={closeCatDelete} disabled={catDeleteBusy}>{t("common.close")}</Button>
              {catDeleting?.active && (
                <Button
                  variant="primary"
                  disabled={catToggleM.isPending}
                  onClick={() => catDeleting && catToggleM.mutate({ id: catDeleting.id, active: false }, { onSuccess: closeCatDelete })}
                >
                  {catToggleM.isPending ? t("common.loading") : t("documents.categoryDeactivateInstead")}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={closeCatDelete} disabled={catDeleteBusy}>{t("common.cancel")}</Button>
              <Button variant="danger" disabled={catDeleteM.isPending} onClick={() => catDeleting && catDeleteM.mutate(catDeleting)}>
                {catDeleteM.isPending ? t("common.loading") : t("documents.categoryConfirmDelete")}
              </Button>
            </>
          )
        }
      >
        {catDeleteBlocked ? (
          <>
            <p style={{ margin: "0 0 10px", color: "var(--ink-700)" }}>{t(errKey("DOC_CATEGORY_IN_USE"))}</p>
            <p style={{ margin: 0, color: "var(--ink-500)" }}>
              {catDeleting?.active ? t("documents.categoryDeactivateExplain") : t("documents.categoryAlreadyInactive")}
            </p>
          </>
        ) : (
          <p style={{ margin: 0, color: "var(--ink-500)" }}>{t("documents.categoryDeleteWarning")}</p>
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
  meta, setMeta, ministryId, ministryName, categories, categoryLabel, disabled,
}: {
  meta: MetaForm;
  setMeta: (f: (m: MetaForm) => MetaForm) => void;
  ministryId: string;
  ministryName: string;
  categories: DocumentCategory[];
  categoryLabel: (c: DocumentCategory) => string;
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
      <Field label={t("documents.categoryLabel")} hint={ministryId && categories.length === 0 ? t("documents.categoryNoneHint") : undefined}>
        <Select value={meta.categoryId} disabled={disabled || !ministryId} onChange={(e) => setMeta((m) => ({ ...m, categoryId: e.target.value }))}>
          <option value="">{t("documents.noCategory")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.active ? categoryLabel(c) : t("documents.categoryInactiveOption", { name: categoryLabel(c) })}
            </option>
          ))}
        </Select>
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
