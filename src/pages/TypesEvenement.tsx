import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Checkbox, Field, IconButton, Input, Modal, Select, Table, Toggle, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { apiErrorCode } from "@/services/api";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";
import {
  createEventType,
  deleteEventType,
  listEventTypes,
  updateEventType,
  type EventTypeResponse,
  type UpdateEventTypeRequest,
} from "@/services/eventTypeService";

// RG-EVT-01 (JP 14/10) — Types d'évènement : catalogue propre à chaque ministère, créé / modifié /
// désactivé ici par SUPER_ADMIN uniquement (§6.1 du plan Évènements, lot E3). Un type porte un
// libellé FR/EN, `evangelism` (D-EVT-03 : décide du comptage), `requiresLabel` (type « Autre »),
// un ordre d'affichage et un statut actif. Un type déjà utilisé ne se supprime pas : il se
// désactive (422 EVENT_TYPE_IN_USE).

/** Même forme que le backend (`AdminEventTypeServiceImpl.CODE_PATTERN`), contrôlée avant envoi. */
const CODE_PATTERN = /^[A-Z0-9_]+$/;
const CODE_MAX = 50;
const NAME_MAX = 120;
/** Borne réaliste de l'ordre d'affichage : le backend le lit en `Integer`, au-delà de 2^31 − 1
 *  Jackson rejette le corps (400 sans code métier, message technique brut). */
const ORDER_MAX = 9999;
/** Erreur de champ : même rendu que les autres pages du back-office (ModulesEnseignement). */
const errorStyle = { color: "var(--danger, #b4452f)", fontSize: 13 } as const;

interface FormState {
  ministryId: string;
  code: string;
  /** Code saisi à la main : on cesse alors de le proposer à partir du libellé. */
  codeTouched: boolean;
  name: string;
  nameEn: string;
  evangelism: boolean;
  requiresLabel: boolean;
  /** Saisi en texte pour laisser l'input libre ; vide à la création = rangé en dernier. */
  orderIndex: string;
}

const emptyForm = (ministryId = ""): FormState => ({
  ministryId,
  code: "",
  codeTouched: false,
  name: "",
  nameEn: "",
  evangelism: false,
  requiresLabel: false,
  orderIndex: "",
});

const formOf = (r: EventTypeResponse): FormState => ({
  ministryId: r.ministryId,
  code: r.code,
  codeTouched: true,
  name: r.name,
  nameEn: r.nameEn ?? "",
  evangelism: r.evangelism,
  requiresLabel: r.requiresLabel,
  orderIndex: String(r.orderIndex),
});

/** Code proposé à partir du libellé FR : « Culte régional » → `CULTE_REGIONAL`. */
function suggestCode(name: string): string {
  return name
    // NFD ne décompose pas les ligatures (« Œuvre » donnerait `UVRE`) : on les développe d'abord.
    .replace(/[Œœ]/g, "OE")
    .replace(/[Ææ]/g, "AE")
    .replace(/ß/g, "SS")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, CODE_MAX);
}

function parseOrder(s: string): number | null {
  const n = Number(s.trim());
  return s.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= ORDER_MAX ? n : null;
}

/** PATCH minimal : seuls les champs modifiés partent (champs absents = inchangés côté backend). */
function patchOf(editing: EventTypeResponse, form: FormState): UpdateEventTypeRequest {
  const patch: UpdateEventTypeRequest = {};
  const name = form.name.trim();
  const nameEn = form.nameEn.trim();
  const order = parseOrder(form.orderIndex);
  if (form.code !== editing.code) patch.code = form.code;
  if (name !== editing.name) patch.name = name;
  // Chaîne vide = « pas de libellé anglais » (contrat UpdateEventTypeRequest).
  if (nameEn !== (editing.nameEn ?? "")) patch.nameEn = nameEn;
  if (form.evangelism !== editing.evangelism) patch.evangelism = form.evangelism;
  if (form.requiresLabel !== editing.requiresLabel) patch.requiresLabel = form.requiresLabel;
  if (order != null && order !== editing.orderIndex) patch.orderIndex = order;
  return patch;
}

export default function TypesEvenementPage() {
  const { push } = useToasts();
  const qc = useQueryClient();
  const { t } = useTranslation();

  const [ministryFilter, setMinistryFilter] = useState("");
  const [editing, setEditing] = useState<EventTypeResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleting, setDeleting] = useState<EventTypeResponse | null>(null);
  /** RG-EVT-01 — le type est utilisé (connu d'avance via `inUse`, ou révélé par un 422) : on propose de désactiver. */
  const [deleteBlocked, setDeleteBlocked] = useState(false);

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const typesQ = useQuery({
    queryKey: ["event-types", ministryFilter],
    queryFn: () => listEventTypes(ministryFilter || undefined),
  });

  const ministryName = useMemo(() => {
    const map = new Map((ministriesQ.data ?? []).map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [ministriesQ.data]);

  const errText = (e: unknown): string => {
    const code = apiErrorCode(e);
    if (code === "EVENT_TYPE_CODE_EXISTS") return t("eventTypes.errCodeExists");
    if (code === "INVALID_EVENT_TYPE_CODE") return t("eventTypes.errCodeInvalid");
    if (code === "EVENT_TYPE_FIELD_REQUIRED") return t("eventTypes.errFieldRequired");
    if (code === "EVENT_TYPE_IN_USE") return t("eventTypes.errInUse");
    if (code === "RESOURCE_NOT_FOUND") return t("eventTypes.errNotFound");
    return e instanceof Error ? e.message : t("common.error");
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["event-types"] });

  // RG-EVT-01 — désactiver retire le type de la saisie (déclaration / programmation), jamais des
  // évènements passés ni des statistiques.
  const toggleActiveM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => updateEventType(v.id, { active: v.active }),
    onSuccess: (r) => {
      invalidate();
      push({ kind: "ok", title: r.active ? t("eventTypes.activatedToast") : t("eventTypes.deactivatedToast"), msg: r.name });
    },
    onError: (e: unknown) => {
      invalidate();
      push({ kind: "error", title: t("common.failure"), msg: errText(e) });
    },
  });

  // Le mode (création / édition) et le type édité sont figés au lancement de la mutation : la
  // modale est verrouillée pendant l'envoi, mais onSuccess ne doit jamais lire un état courant.
  const saveM = useMutation({
    mutationFn: async (v: { editing: EventTypeResponse | null; form: FormState }): Promise<EventTypeResponse> => {
      const { editing, form } = v;
      if (!editing) {
        const order = parseOrder(form.orderIndex);
        return createEventType({
          ministryId: form.ministryId,
          code: form.code,
          name: form.name.trim(),
          nameEn: form.nameEn.trim() || null,
          evangelism: form.evangelism,
          requiresLabel: form.requiresLabel,
          orderIndex: order,
        });
      }
      const patch = patchOf(editing, form);
      return Object.keys(patch).length === 0 ? editing : updateEventType(editing.id, patch);
    },
    onSuccess: (r, v) => {
      invalidate();
      push({ kind: "ok", title: v.editing ? t("eventTypes.updatedToast") : t("eventTypes.createdToast"), msg: r.name });
      close();
    },
    onError: (e: unknown, v) => {
      invalidate();
      push({ kind: "error", title: t("eventTypes.saveFailToast"), msg: errText(e) });
      // Type supprimé entre-temps (autre session) : la modale porte un instantané périmé, chaque
      // nouvel envoi reprendrait le même 404 — on la ferme sur la liste rechargée.
      if (v.editing && apiErrorCode(e) === "RESOURCE_NOT_FOUND") close();
    },
  });

  const deleteM = useMutation({
    mutationFn: (r: EventTypeResponse) => deleteEventType(r.id),
    onSuccess: (_, r) => {
      invalidate();
      push({ kind: "ok", title: t("eventTypes.deletedToast"), msg: r.name });
      closeDelete();
    },
    onError: (e: unknown) => {
      invalidate();
      // RG-EVT-01 — un évènement a pu être créé depuis le chargement de la liste : la modale
      // bascule sur l'explication et la proposition de désactiver, plutôt qu'un simple toast.
      if (apiErrorCode(e) === "EVENT_TYPE_IN_USE") {
        setDeleteBlocked(true);
        return;
      }
      push({ kind: "error", title: t("eventTypes.deleteFailToast"), msg: errText(e) });
      // Déjà supprimé ailleurs : rien à confirmer, la liste rechargée n'en montre plus trace.
      if (apiErrorCode(e) === "RESOURCE_NOT_FOUND") closeDelete();
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(ministryFilter));
    setOpen(true);
  };

  const openEdit = (r: EventTypeResponse) => {
    setEditing(r);
    setForm(formOf(r));
    setOpen(true);
  };

  // Pas de fermeture pendant l'envoi : la réponse refermerait sinon une modale rouverte entre-temps.
  const closeIfIdle = saveM.isPending ? undefined : close;

  function close() {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm());
  }

  const openDelete = (r: EventTypeResponse) => {
    setDeleting(r);
    setDeleteBlocked(r.inUse);
  };

  // Même verrou pour la suppression / désactivation en cours (closeDelete est rappelé à la réponse).
  const deleteBusy = deleteM.isPending || toggleActiveM.isPending;

  function closeDelete() {
    setDeleting(null);
    setDeleteBlocked(false);
  }

  const deactivateInstead = () => {
    if (!deleting) return;
    toggleActiveM.mutate({ id: deleting.id, active: false }, { onSuccess: closeDelete });
  };

  const setName = (name: string) =>
    setForm((f) => ({ ...f, name, code: !editing && !f.codeTouched ? suggestCode(name) : f.code }));

  // Le code se saisit en majuscules ; vidé, il redevient proposé à partir du libellé (création).
  const setCode = (raw: string) => {
    const code = raw.toUpperCase();
    setForm((f) => ({ ...f, code, codeTouched: code !== "" }));
  };

  // Validation locale (le backend reste juge : 400 / 422 INVALID_EVENT_TYPE_CODE, EVENT_TYPE_CODE_EXISTS).
  const codeError = form.code === ""
    ? null
    : !CODE_PATTERN.test(form.code)
      ? t("eventTypes.errCodeInvalid")
      : null;
  // Création : ordre vide = rangé après les types existants ; édition : un ordre est requis.
  const orderError = (editing || form.orderIndex.trim() !== "") && parseOrder(form.orderIndex) == null
    ? t("eventTypes.errOrderInvalid", { max: ORDER_MAX })
    : null;
  const canSave =
    !!form.ministryId && !!form.code && !codeError && !!form.name.trim() && !orderError && !saveM.isPending;
  // D-EVT-03 — le drapeau décide du comptage : le changer sur un type utilisé modifie
  // rétroactivement les statistiques de tous ses évènements.
  const evangelismRetroactive = !!editing && editing.inUse && form.evangelism !== editing.evangelism;

  // Tous ministères : le backend trie par identifiant de ministère ; on regroupe par nom lisible.
  const rows = useMemo(() => {
    const list = typesQ.data ?? [];
    if (ministryFilter) return list;
    return [...list].sort((a, b) =>
      ministryName(a.ministryId).localeCompare(ministryName(b.ministryId))
      || a.orderIndex - b.orderIndex
      || a.name.localeCompare(b.name));
  }, [typesQ.data, ministryFilter, ministryName]);

  const cols = [
    {
      label: t("eventTypes.colOrder"),
      style: { width: 1 },
      render: (r: EventTypeResponse) => <span className="mono" style={{ color: "var(--ink-500)" }}>{r.orderIndex}</span>,
    },
    {
      label: t("eventTypes.colName"),
      render: (r: EventTypeResponse) => (
        <div>
          <div style={{ fontWeight: 500, color: "var(--ink-900)" }}>{r.name}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{r.nameEn ?? t("eventTypes.noNameEn")}</div>
        </div>
      ),
    },
    { label: t("eventTypes.colCode"), render: (r: EventTypeResponse) => <span className="mono" style={{ color: "var(--ink-700)" }}>{r.code}</span> },
    ...(ministryFilter
      ? []
      : [{ label: t("eventTypes.colMinistry"), render: (r: EventTypeResponse) => <span style={{ color: "var(--ink-700)" }}>{ministryName(r.ministryId)}</span> }]),
    {
      label: t("eventTypes.colCounting"),
      render: (r: EventTypeResponse) =>
        r.evangelism ? <Badge tone="green" dot>{t("eventTypes.evangelism")}</Badge> : <Badge tone="gray">{t("eventTypes.notEvangelism")}</Badge>,
    },
    {
      label: t("eventTypes.colEntry"),
      render: (r: EventTypeResponse) =>
        r.requiresLabel ? <Badge tone="earth">{t("eventTypes.requiresLabelBadge")}</Badge> : <span style={{ color: "var(--ink-400)" }}>{t("common.dash")}</span>,
    },
    {
      label: t("eventTypes.colStatus"),
      cellStyle: { whiteSpace: "nowrap" as const },
      render: (r: EventTypeResponse) => (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {r.active ? <Badge tone="ok" dot>{t("eventTypes.active")}</Badge> : <Badge tone="gray" dot>{t("eventTypes.inactive")}</Badge>}
          {r.inUse && <Badge tone="earth">{t("eventTypes.inUseBadge")}</Badge>}
        </div>
      ),
    },
    {
      label: "",
      style: { width: 1 },
      cellStyle: { whiteSpace: "nowrap" as const },
      render: (r: EventTypeResponse) => (
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          <Toggle
            checked={r.active}
            onChange={(v) => toggleActiveM.mutate({ id: r.id, active: v })}
            label={t("eventTypes.activeToggle")}
          />
          <IconButton icon={<Icons.Edit size={15} />} title={t("eventTypes.edit")} onClick={() => openEdit(r)} />
          <IconButton
            icon={<Icons.Trash size={15} />}
            danger
            title={r.inUse ? t("eventTypes.inUseHint") : t("eventTypes.delete")}
            onClick={() => openDelete(r)}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <TopBar
        title={t("eventTypes.title")}
        crumbs={[t("common.jexcellence"), t("eventTypes.title")]}
        actions={
          <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={openCreate}>
            {t("eventTypes.newType")}
          </Button>
        }
      />
      <div className="content">
        <p className="section-sub">
          <Trans i18nKey="eventTypes.intro" components={{ strong: <strong /> }} />
        </p>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line,#eee)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{t("eventTypes.filterLabel")}</span>
            <Select value={ministryFilter} onChange={(e) => setMinistryFilter(e.target.value)}>
              <option value="">{t("eventTypes.allMinistries")}</option>
              {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
            {ministriesQ.isError && (
              <span style={{ color: "var(--danger, #b4452f)", fontSize: 13 }}>
                {t("eventTypes.ministriesLoadError", { error: errText(ministriesQ.error) })}
              </span>
            )}
          </div>

          {typesQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : typesQ.isError ? (
            <div style={{ padding: 24, color: "var(--danger, #b4452f)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span>{t("eventTypes.loadError", { error: errText(typesQ.error) })}</span>
              <Button size="sm" variant="secondary" onClick={() => typesQ.refetch()}>{t("common.retry")}</Button>
            </div>
          ) : rows.length === 0 ? (
            // §9.1 du plan — sans type, aucune déclaration n'est possible dans ce ministère.
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>
              {ministryFilter ? t("eventTypes.emptyMinistry") : t("eventTypes.empty")}
            </div>
          ) : (
            <Table columns={cols} rows={rows.map((r) => ({ ...r, _key: r.id }))} onRowClick={openEdit} />
          )}
        </div>
      </div>

      <Modal
        open={open}
        onClose={closeIfIdle}
        title={editing ? t("eventTypes.editTitle") : t("eventTypes.createTitle")}
        sub={editing ? ministryName(editing.ministryId) : t("eventTypes.createSub")}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={saveM.isPending}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={() => saveM.mutate({ editing, form })} disabled={!canSave}>
              {saveM.isPending ? t("common.saving") : editing ? t("common.save") : t("eventTypes.createButton")}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!editing && (
            <Field label={t("eventTypes.ministryLabel")}>
              <Select value={form.ministryId} onChange={(e) => setForm({ ...form, ministryId: e.target.value })}>
                <option value="">{t("common.choose")}</option>
                {(ministriesQ.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("eventTypes.nameLabel")}>
              <Input value={form.name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder={t("eventTypes.namePlaceholder")} />
            </Field>
            <Field label={t("eventTypes.nameEnLabel")} hint={t("eventTypes.nameEnHint")}>
              <Input value={form.nameEn} maxLength={NAME_MAX} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder={t("eventTypes.nameEnPlaceholder")} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <Field label={t("eventTypes.codeLabel")} hint={editing ? t("eventTypes.codeEditHint") : t("eventTypes.codeHint")}>
              <Input
                className="input mono"
                value={form.code}
                maxLength={CODE_MAX}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("eventTypes.codePlaceholder")}
                aria-invalid={!!codeError}
                style={codeError ? { borderColor: "var(--err)" } : undefined}
              />
              {codeError && <span style={errorStyle}>{codeError}</span>}
            </Field>
            <Field label={t("eventTypes.orderLabel")} hint={editing ? undefined : t("eventTypes.orderHint")}>
              <Input
                type="number"
                min={0}
                max={ORDER_MAX}
                value={form.orderIndex}
                onChange={(e) => setForm({ ...form, orderIndex: e.target.value })}
                aria-invalid={!!orderError}
                style={orderError ? { borderColor: "var(--err)" } : undefined}
              />
              {orderError && <span style={errorStyle}>{orderError}</span>}
            </Field>
          </div>

          <Field hint={t("eventTypes.evangelismHint")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Checkbox checked={form.evangelism} onChange={(v) => setForm({ ...form, evangelism: v })} />
              <span style={{ cursor: "pointer" }} onClick={() => setForm({ ...form, evangelism: !form.evangelism })}>
                {t("eventTypes.evangelismLabel")}
              </span>
            </div>
          </Field>
          {evangelismRetroactive && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "var(--warn)", fontSize: 13 }}>
              <Icons.Warning size={15} />
              <span>{t("eventTypes.evangelismRetroactive")}</span>
            </div>
          )}

          <Field hint={t("eventTypes.requiresLabelHint")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Checkbox checked={form.requiresLabel} onChange={(v) => setForm({ ...form, requiresLabel: v })} />
              <span style={{ cursor: "pointer" }} onClick={() => setForm({ ...form, requiresLabel: !form.requiresLabel })}>
                {t("eventTypes.requiresLabelLabel")}
              </span>
            </div>
          </Field>
        </div>
      </Modal>

      {/* Suppression — RG-EVT-01 : un type utilisé se désactive, il ne se supprime pas. */}
      <Modal
        open={!!deleting}
        onClose={deleteBusy ? undefined : closeDelete}
        title={deleteBlocked ? t("eventTypes.deleteBlockedTitle") : t("eventTypes.deleteTitle")}
        sub={deleting ? `${deleting.name} · ${deleting.code}` : undefined}
        footer={
          deleteBlocked ? (
            <>
              <Button variant="ghost" onClick={closeDelete} disabled={deleteBusy}>{t("common.close")}</Button>
              {deleting?.active && (
                <Button variant="primary" disabled={toggleActiveM.isPending} onClick={deactivateInstead}>
                  {toggleActiveM.isPending ? t("common.loading") : t("eventTypes.deactivateInstead")}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={closeDelete} disabled={deleteBusy}>{t("common.cancel")}</Button>
              <Button variant="danger" disabled={deleteM.isPending} onClick={() => deleting && deleteM.mutate(deleting)}>
                {deleteM.isPending ? t("common.loading") : t("eventTypes.confirmDelete")}
              </Button>
            </>
          )
        }
      >
        {deleteBlocked ? (
          <>
            <p style={{ margin: "0 0 10px", color: "var(--ink-700)" }}>{t("eventTypes.errInUse")}</p>
            <p style={{ margin: 0, color: "var(--ink-500)" }}>
              {deleting?.active ? t("eventTypes.deactivateExplain") : t("eventTypes.alreadyInactive")}
            </p>
          </>
        ) : (
          <p style={{ margin: 0, color: "var(--ink-500)" }}>{t("eventTypes.deleteWarning")}</p>
        )}
      </Modal>
    </>
  );
}
