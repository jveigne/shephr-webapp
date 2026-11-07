import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Field, IconButton, Input, Modal, Select, Table, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { apiErrorCode } from "@/services/api";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";
import {
  StorageUploadError,
  completePosterUpload,
  completeVideoUpload,
  createTeachingVideo,
  deleteTeachingVideo,
  getTeachingVideoPreview,
  listTeachingVideos,
  publishTeachingVideo,
  putFileToStorage,
  readVideoDuration,
  startPosterUpload,
  startVideoUpload,
  unpublishTeachingVideo,
  updateTeachingVideo,
  type AdminTeachingVideo,
  type TeachingVideoStatus,
} from "@/services/teachingVideoService";

// D-FIN-16 (JP 06/11) — vidéos des parcours individuels, sur R2 (D-FIN-09), contrat FIN §6, sur le modèle de
// /admin/videos de The Deal Way. Une fiche naît DRAFT sans fichier ; un dépôt passe par UPLOADING et ramène toujours en
// DRAFT ; on regarde l'aperçu ; on publie. Les boutons restent actifs et le refus du serveur s'affiche : la règle est celle
// du service (422 TEACHING_VIDEO_*), un bouton désactivé par le front finirait par diverger. Le choix de la vidéo d'un
// chapitre se fait dans /modules-enseignement.

const STATUS_TONE: Record<TeachingVideoStatus, "ok" | "gray" | "warn"> = { PUBLISHED: "ok", DRAFT: "gray", UPLOADING: "warn" };

/** Message d'une écriture : code traduit (`teachingVideos.errors.*`), repli sur le message du serveur. */
function errorText(e: unknown, t: TFunction): string {
  if (e instanceof StorageUploadError) {
    return e.reason === "rejected"
      ? t("teachingVideos.errors.storageRejected", { status: e.status })
      : e.reason === "aborted"
        ? t("teachingVideos.errors.aborted")
        : t("teachingVideos.errors.storageNetwork");
  }
  const key = {
    TEACHING_VIDEO_INVALID_TYPE: "invalidType",
    TEACHING_VIDEO_TOO_LARGE: "tooLarge",
    TEACHING_VIDEO_UPLOAD_NOT_STARTED: "uploadNotStarted",
    TEACHING_VIDEO_UPLOAD_MISSING: "uploadMissing",
    TEACHING_VIDEO_UPLOAD_SIZE_MISMATCH: "sizeMismatch",
    TEACHING_VIDEO_UPLOAD_IN_PROGRESS: "uploadInProgress",
    TEACHING_VIDEO_NO_FILE: "noFile",
    TEACHING_VIDEO_IN_USE: "inUse",
    CONCURRENT_MODIFICATION: "concurrent",
  }[apiErrorCode(e) ?? ""];
  if (key) return t(`teachingVideos.errors.${key}`);
  return e instanceof Error ? e.message : t("common.error");
}

/** « 4:10 », « 1:02:33 » ; le serveur ne donne que des secondes. */
function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function formatSize(bytes: number | null, locale: string): string | null {
  if (bytes == null) return null;
  return new Intl.NumberFormat(locale, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(bytes / (1024 * 1024));
}

function Poster({ url, alt, width = 72 }: { url: string | null; alt: string; width?: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const box = { width, aspectRatio: "16 / 9", borderRadius: 6, background: "var(--line, #eee)", flexShrink: 0 } as const;
  if (!url || broken) {
    return (
      <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-400)" }}>
        <Icons.Video size={16} />
      </div>
    );
  }
  return <img src={url} alt={alt} loading="lazy" onError={() => setBroken(true)} style={{ ...box, objectFit: "cover", display: "block" }} />;
}

export default function VideosEnseignementPage() {
  const { t, i18n } = useTranslation();
  const { push } = useToasts();
  const qc = useQueryClient();
  const locale = i18n.resolvedLanguage || i18n.language || "fr";

  const [ministryFilter, setMinistryFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [newMinistryId, setNewMinistryId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  /** Par identifiant : la fiche ouverte suit la liste relue après chaque geste. */
  const [openId, setOpenId] = useState<string | null>(null);

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const videosQ = useQuery({
    queryKey: ["teaching-videos", ministryFilter],
    queryFn: () => listTeachingVideos(ministryFilter || undefined),
  });

  const ministryName = useMemo(() => {
    const map = new Map((ministriesQ.data ?? []).map((m: MinistryResponse) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [ministriesQ.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["teaching-videos"] });

  const createM = useMutation({
    mutationFn: () => createTeachingVideo({ ministryId: newMinistryId, title: newTitle.trim() }),
    onSuccess: (v) => {
      invalidate();
      setCreating(false);
      // La fiche s'ouvre depuis la liste : elle doit y figurer même si un autre ministère était filtré.
      if (ministryFilter && ministryFilter !== v.ministryId) setMinistryFilter(v.ministryId);
      setOpenId(v.id);
      push({ kind: "ok", title: t("teachingVideos.createdToast"), msg: v.title });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: errorText(e, t) }),
  });

  const openCreate = () => {
    setNewMinistryId(ministryFilter);
    setNewTitle("");
    setCreating(true);
  };

  const rows = videosQ.data ?? [];
  const opened = openId ? rows.find((v) => v.id === openId) ?? null : null;

  const cols = [
    { label: "", style: { width: 88 }, render: (r: AdminTeachingVideo) => <Poster url={r.posterUrl} alt={r.title} /> },
    { label: t("teachingVideos.colTitle"), render: (r: AdminTeachingVideo) => <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>{r.title}</span> },
    ...(ministryFilter
      ? []
      : [{ label: t("teachingVideos.colMinistry"), render: (r: AdminTeachingVideo) => <span style={{ color: "var(--ink-700)" }}>{ministryName(r.ministryId)}</span> }]),
    { label: t("teachingVideos.colDuration"), render: (r: AdminTeachingVideo) => <span style={{ color: "var(--ink-700)" }}>{formatDuration(r.durationSeconds) ?? t("common.dash")}</span> },
    { label: t("teachingVideos.colSize"), render: (r: AdminTeachingVideo) => <span style={{ color: "var(--ink-700)" }}>{formatSize(r.sizeBytes, locale) ?? t("common.dash")}</span> },
    { label: t("teachingVideos.colChapters"), render: (r: AdminTeachingVideo) => <span style={{ color: "var(--ink-700)" }}>{r.chapterCount}</span> },
    { label: t("teachingVideos.colStatus"), render: (r: AdminTeachingVideo) => <Badge tone={STATUS_TONE[r.status]} dot>{t(`teachingVideos.status.${r.status}`)}</Badge> },
    {
      label: "",
      style: { width: 1 },
      render: (r: AdminTeachingVideo) => <IconButton icon={<Icons.Edit size={15} />} title={t("teachingVideos.open")} onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }} />,
    },
  ];

  return (
    <>
      <TopBar
        title={t("teachingVideos.title")}
        crumbs={[t("common.jexcellence"), t("teachingVideos.title")]}
        actions={<Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={openCreate}>{t("teachingVideos.newVideo")}</Button>}
      />
      <div className="content">
        <p className="section-sub">{t("teachingVideos.intro")}</p>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line,#eee)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{t("teachingModules.filterLabel")}</span>
            <Select value={ministryFilter} onChange={(e) => setMinistryFilter(e.target.value)}>
              <option value="">{t("teachingModules.allMinistries")}</option>
              {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>

          {videosQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : videosQ.isError ? (
            <div style={{ padding: 24, color: "var(--err)" }}>{t("teachingVideos.loadError", { error: errorText(videosQ.error, t) })}</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>{t("teachingVideos.empty")}</div>
          ) : (
            <Table columns={cols} rows={rows.map((r) => ({ ...r, _key: r.id }))} onRowClick={(r) => setOpenId(r.id)} />
          )}
        </div>
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t("teachingVideos.createTitle")}
        sub={t("teachingVideos.createSub")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>{t("common.cancel")}</Button>
            <Button variant="primary" disabled={!newMinistryId || !newTitle.trim() || createM.isPending} onClick={() => createM.mutate()}>
              {createM.isPending ? t("common.saving") : t("teachingVideos.createButton")}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label={t("teachingModules.ministryLabel")} hint={t("teachingVideos.ministryHint")}>
            <Select value={newMinistryId} onChange={(e) => setNewMinistryId(e.target.value)}>
              <option value="">{t("common.choose")}</option>
              {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label={t("teachingVideos.titleLabel")}>
            <Input value={newTitle} maxLength={200} onChange={(e) => setNewTitle(e.target.value)} placeholder={t("teachingVideos.titlePlaceholder")} />
          </Field>
        </div>
      </Modal>

      {opened && (
        <VideoSheet
          key={opened.id}
          video={opened}
          ministry={ministryName(opened.ministryId)}
          locale={locale}
          onClose={() => setOpenId(null)}
          onChanged={invalidate}
        />
      )}
    </>
  );
}

/** Un envoi au stockage en cours : fraction connue ou non, et de quoi l'arrêter. */
interface Sending {
  kind: "video" | "poster";
  fraction: number | null;
  abort: AbortController;
}

function VideoSheet({
  video, ministry, locale, onClose, onChanged,
}: {
  video: AdminTeachingVideo;
  ministry: string;
  locale: string;
  onClose: () => void;
  onChanged: () => Promise<unknown> | void;
}) {
  const { t } = useTranslation();
  const { push } = useToasts();
  const [title, setTitle] = useState(video.title);
  const [sending, setSending] = useState<Sending | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Lien signé de 15 min, demandé au clic : jamais gardé d'un fichier à l'autre. */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const posterInput = useRef<HTMLInputElement>(null);

  // Quitter la page pendant un envoi l'arrête ; le serveur garde UPLOADING jusqu'à « Abandonner ».
  const sendingRef = useRef<Sending | null>(null);
  sendingRef.current = sending;
  useEffect(() => () => sendingRef.current?.abort.abort(), []);

  const fail = (e: unknown) => {
    setError(errorText(e, t));
    void onChanged();
  };

  const act = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => {
      setError(null);
      void onChanged();
    },
    onError: fail,
  });

  const busy = !!sending || act.isPending;

  /** §6.4 : annonce, PUT direct, confirmation. Tout échec laisse la fiche relisible, le dépôt se rejoue. */
  const send = async (kind: Sending["kind"], file: File) => {
    const abort = new AbortController();
    setError(null);
    setPreviewUrl(null);
    setSending({ kind, fraction: 0, abort });
    try {
      // Type vide (extension inconnue du navigateur) : annoncé quand même, pour le refus traduit du serveur, pas un 400 de saisie.
      const announced = { contentType: file.type || "application/octet-stream", sizeBytes: file.size };
      if (kind === "video") {
        const durationSeconds = await readVideoDuration(file);
        const ticket = await startVideoUpload(video.id, announced);
        await putFileToStorage(ticket, file, (fraction) => setSending((s) => (s ? { ...s, fraction } : s)), abort.signal);
        await completeVideoUpload(video.id, { durationSeconds });
      } else {
        const ticket = await startPosterUpload(video.id, announced);
        await putFileToStorage(ticket, file, (fraction) => setSending((s) => (s ? { ...s, fraction } : s)), abort.signal);
        await completePosterUpload(video.id);
      }
      push({ kind: "ok", title: t(kind === "video" ? "teachingVideos.fileSentToast" : "teachingVideos.posterSentToast"), msg: video.title });
      void onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setSending(null);
    }
  };

  const pick = (kind: Sending["kind"], input: HTMLInputElement) => {
    const file = input.files?.[0];
    // Rechoisir le même fichier après un échec doit relancer l'envoi.
    input.value = "";
    if (file) void send(kind, file);
  };

  const showPreview = () =>
    act.mutate(async () => {
      const play = await getTeachingVideoPreview(video.id);
      setPreviewBroken(false);
      setPreviewUrl(play.url);
    });

  const remove = useMutation({
    mutationFn: () => deleteTeachingVideo(video.id),
    onSuccess: () => {
      push({ kind: "ok", title: t("teachingVideos.deletedToast"), msg: video.title });
      onClose();
      void onChanged();
    },
    onError: (e: unknown) => {
      setConfirmDelete(false);
      fail(e);
    },
  });

  const titleDirty = title.trim() !== video.title && !!title.trim();
  const facts = [formatDuration(video.durationSeconds), formatSize(video.sizeBytes, locale)].filter(Boolean).join(" · ");
  const percent = sending?.fraction != null ? Math.round(sending.fraction * 100) : null;

  return (
    <Modal
      open
      // Un envoi en cours ne se perd pas par Échap ou un clic à côté : on l'arrête d'abord.
      onClose={sending ? undefined : onClose}
      size="lg"
      title={video.title}
      sub={ministry}
      footer={
        confirmDelete ? (
          <>
            <span style={{ marginRight: "auto", color: "var(--ink-700)", fontSize: 13, alignSelf: "center" }}>{t("teachingVideos.deletePrompt")}</span>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</Button>
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{t("teachingVideos.delete")}</Button>
          </>
        ) : (
          <>
            <Button variant="danger" style={{ marginRight: "auto" }} disabled={busy} iconL={<Icons.Trash size={14} />} onClick={() => setConfirmDelete(true)}>
              {t("teachingVideos.delete")}
            </Button>
            <Button variant="ghost" disabled={!!sending} onClick={onClose}>{t("common.close")}</Button>
            {video.status === "PUBLISHED" ? (
              <Button variant="secondary" disabled={busy} onClick={() => act.mutate(() => unpublishTeachingVideo(video.id))}>{t("teachingVideos.unpublish")}</Button>
            ) : (
              <Button variant="primary" disabled={busy} onClick={() => act.mutate(() => publishTeachingVideo(video.id))}>{t("teachingVideos.publish")}</Button>
            )}
          </>
        )
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, color: "var(--ink-700)" }}>
          <Badge tone={STATUS_TONE[video.status]} dot>{t(`teachingVideos.status.${video.status}`)}</Badge>
          {facts && <span>{facts}</span>}
          <span style={{ color: "var(--ink-500)" }}>{t("teachingVideos.usedBy", { count: video.chapterCount })}</span>
        </div>

        {error && <div role="alert" style={{ whiteSpace: "pre-wrap", background: "var(--err-bg)", color: "var(--err)", borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>{error}</div>}

        <Field label={t("teachingVideos.titleLabel")}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <Button variant="secondary" disabled={!titleDirty || busy} onClick={() => act.mutate(() => updateTeachingVideo(video.id, { title: title.trim() }))}>
              {t("common.save")}
            </Button>
          </div>
        </Field>

        {sending && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--ink-700)", marginBottom: 6 }}>
              <span>
                {t(sending.kind === "video" ? "teachingVideos.sendingVideo" : "teachingVideos.sendingPoster")}
                {percent != null && ` ${t("teachingVideos.percent", { percent })}`}
              </span>
              <Button variant="ghost" size="sm" onClick={() => sending.abort.abort()}>{t("teachingVideos.stopSending")}</Button>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
              style={{ height: 8, borderRadius: 4, background: "var(--line, #eee)", overflow: "hidden" }}
            >
              <div style={{ height: "100%", width: `${percent ?? 100}%`, opacity: percent == null ? 0.4 : 1, background: "var(--green-800)", transition: "width .2s linear" }} />
            </div>
          </div>
        )}

        <Field label={t("teachingVideos.fileLabel")} hint={t("teachingVideos.fileHint")}>
          <input ref={fileInput} type="file" accept="video/mp4" hidden onChange={(e) => pick("video", e.target)} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Button variant="secondary" iconL={<Icons.Upload size={14} />} disabled={busy} onClick={() => fileInput.current?.click()}>
              {t(video.hasFile ? "teachingVideos.replaceFile" : "teachingVideos.chooseFile")}
            </Button>
            <Button variant="ghost" iconL={<Icons.Eye size={14} />} disabled={busy || !video.hasFile} onClick={showPreview}>{t("teachingVideos.preview")}</Button>
            {/* §6.4 — onglet fermé, règle CORS absente : seule sortie d'un dépôt jamais confirmé. */}
            {video.uploadPending && !sending && (
              <Button variant="ghost" disabled={busy} onClick={() => act.mutate(() => unpublishTeachingVideo(video.id))}>{t("teachingVideos.abandonUpload")}</Button>
            )}
          </div>
          {video.uploadPending && !sending && <span style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{t("teachingVideos.uploadPendingHint")}</span>}
        </Field>

        {previewUrl && (
          previewBroken
            ? <div style={{ fontSize: 13, color: "var(--err)" }}>{t("teachingVideos.errors.previewFailed")}</div>
            : (
              <video
                key={previewUrl}
                src={previewUrl}
                poster={video.posterUrl ?? undefined}
                controls
                preload="metadata"
                onError={() => setPreviewBroken(true)}
                style={{ width: "100%", maxHeight: 340, borderRadius: 8, background: "#000" }}
              />
            )
        )}

        <Field label={t("teachingVideos.posterLabel")} hint={t("teachingVideos.posterHint")}>
          <input ref={posterInput} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => pick("poster", e.target)} />
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Poster url={video.posterUrl} alt={video.title} width={120} />
            <Button variant="secondary" iconL={<Icons.Upload size={14} />} disabled={busy} onClick={() => posterInput.current?.click()}>
              {t(video.hasPoster ? "teachingVideos.replacePoster" : "teachingVideos.choosePoster")}
            </Button>
          </div>
        </Field>
      </div>
    </Modal>
  );
}
