import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Checkbox, Field, IconButton, Input, Modal, Select, Table, Toggle, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { apiErrorCode } from "@/services/api";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";
import {
  createTeachingModule,
  listTeachingModules,
  replaceTeachingContent,
  updateTeachingModule,
  type ChapterInput,
  type TeachingContent,
  type TeachingModuleResponse,
} from "@/services/teachingModuleService";

// D-ASM-10 (JP 23/09) — Modules d'enseignement : propres à chaque ministère, communs à toutes ses
// assemblées ; créés / modifiés / désactivés ici par SUPER_ADMIN uniquement (RG-ASM-01).
// RG-ASM-01 v2 (JP 24/09) — un module a des parties (au-dessus des chapitres) ou uniquement des
// chapitres ; dans un module à parties, la numérotation des chapitres repart à 1 dans chaque partie.

/** Une ligne de chapitre en cours d'édition (numéro saisi en texte pour laisser l'input libre). */
interface ChapterRow {
  key: string;
  number: string;
  title: string;
  /** RG-ASM-02 — déjà lu dans une réunion : renommable, jamais retirable. */
  read: boolean;
}

/**
 * Un bloc de chapitres : une partie, ou l'unique bloc d'un module sans parties (`number` ignoré).
 * Chaque bloc a sa propre saisie rapide « de … à … ».
 */
interface SectionRow {
  key: string;
  number: string;
  title: string;
  rangeFrom: string;
  rangeTo: string;
  chapters: ChapterRow[];
}

interface FormState {
  ministryId: string;
  name: string;
  bookTitle: string;
  withParts: boolean;
  sections: SectionRow[];
}

let rowSeq = 0;
const newKey = () => `row-${++rowSeq}`;

const newSection = (number: string, chapters: ChapterRow[] = []): SectionRow => ({
  key: newKey(),
  number,
  title: "",
  rangeFrom: "1",
  rangeTo: chapters.length > 0 ? String(Math.max(...chapters.map((c) => parseNumber(c.number) ?? 0))) : "",
  chapters,
});

const emptyForm = (ministryId = ""): FormState => ({
  ministryId,
  name: "",
  bookTitle: "",
  withParts: false,
  sections: [newSection("")],
});

function parseNumber(s: string): number | null {
  const n = Number(s.trim());
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** Normalise une liste de chapitres envoyée au backend (ordre = ordre affiché, titre vide → null). */
function toChapterInputs(rows: ChapterRow[]): ChapterInput[] {
  return rows.map((r) => ({ number: parseNumber(r.number) ?? 0, title: r.title.trim() || null }));
}

function toContent(form: FormState): TeachingContent {
  if (!form.withParts) return { chapters: toChapterInputs(form.sections[0]?.chapters ?? []) };
  return {
    parts: form.sections.map((s) => ({
      number: parseNumber(s.number) ?? 0,
      title: s.title.trim() || null,
      chapters: toChapterInputs(s.chapters),
    })),
  };
}

/** Contenu actuel d'un module, dans la même forme que {@link toContent} (pour détecter un changement). */
function contentOf(m: TeachingModuleResponse): TeachingContent {
  const chapters = [...m.chapters].sort((a, b) => a.orderIndex - b.orderIndex);
  const input = (c: (typeof chapters)[number]): ChapterInput => ({ number: c.number, title: c.title ?? null });
  if (m.parts.length === 0) return { chapters: chapters.map(input) };
  return {
    parts: [...m.parts]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((p) => ({ number: p.number, title: p.title ?? null, chapters: chapters.filter((c) => c.partId === p.id).map(input) })),
  };
}

/** Erreur locale d'une liste de chapitres (le backend reste juge : 400 / 422). */
function chaptersErrorKey(rows: ChapterRow[]): string | null {
  const numbers = rows.map((c) => parseNumber(c.number));
  if (rows.length === 0) return "teachingModules.errNoChapters";
  if (numbers.some((n) => n == null)) return "teachingModules.errInvalidNumber";
  if (new Set(numbers).size !== numbers.length) return "teachingModules.errDuplicateNumber";
  return null;
}

export default function ModulesEnseignementPage() {
  const { push } = useToasts();
  const qc = useQueryClient();
  const { t } = useTranslation();

  const [ministryFilter, setMinistryFilter] = useState("");
  const [editing, setEditing] = useState<TeachingModuleResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const modulesQ = useQuery({
    queryKey: ["teaching-modules", ministryFilter],
    queryFn: () => listTeachingModules(ministryFilter || undefined),
  });

  const ministryName = useMemo(() => {
    const map = new Map((ministriesQ.data ?? []).map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [ministriesQ.data]);

  const errText = (e: unknown): string => {
    const code = apiErrorCode(e);
    if (code === "CHAPTER_ALREADY_READ") return t("teachingModules.errChapterAlreadyRead");
    if (code === "DUPLICATE_CHAPTER_NUMBER") return t("teachingModules.errDuplicateNumber");
    if (code === "DUPLICATE_PART_NUMBER") return t("teachingModules.errDuplicatePartNumber");
    if (code === "CHAPTERS_OR_PARTS_REQUIRED") return t("teachingModules.errNoChapters");
    if (code === "TEACHING_MODULE_FIELD_REQUIRED") return t("teachingModules.errFieldRequired");
    return e instanceof Error ? e.message : t("common.error");
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["teaching-modules"] });

  // RG-ASM-02 — désactiver retire le module de la saisie des CR ; il reste visible dans l'historique.
  const toggleActiveM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => updateTeachingModule(v.id, { active: v.active }),
    onSuccess: (m) => {
      invalidate();
      push({ kind: "ok", title: m.active ? t("teachingModules.activatedToast") : t("teachingModules.deactivatedToast"), msg: m.name });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: errText(e) }),
  });

  const saveM = useMutation({
    mutationFn: async (): Promise<TeachingModuleResponse> => {
      const content = toContent(form);
      const name = form.name.trim();
      const bookTitle = form.bookTitle.trim();
      if (!editing) {
        return createTeachingModule({ ministryId: form.ministryId, name, bookTitle, ...content });
      }
      let result = editing;
      if (name !== editing.name || bookTitle !== editing.bookTitle) {
        result = await updateTeachingModule(editing.id, { name, bookTitle });
      }
      if (JSON.stringify(contentOf(editing)) !== JSON.stringify(content)) {
        result = await replaceTeachingContent(editing.id, content);
      }
      return result;
    },
    onSuccess: () => {
      invalidate();
      push({ kind: "ok", title: editing ? t("teachingModules.updatedToast") : t("teachingModules.createdToast"), msg: form.name.trim() });
      close();
    },
    onError: (e: unknown) => {
      // Un PATCH a pu passer avant l'échec du PUT : on resynchronise la liste.
      invalidate();
      push({ kind: "error", title: t("teachingModules.saveFailToast"), msg: errText(e) });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(ministryFilter));
    setOpen(true);
  };

  const openEdit = (m: TeachingModuleResponse) => {
    setEditing(m);
    const chapters = [...m.chapters].sort((a, b) => a.orderIndex - b.orderIndex);
    const rowsOf = (list: typeof chapters): ChapterRow[] =>
      list.map((c) => ({ key: newKey(), number: String(c.number), title: c.title ?? "", read: c.read }));
    const sections = m.parts.length === 0
      ? [newSection("", rowsOf(chapters))]
      : [...m.parts]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((p) => ({ ...newSection(String(p.number), rowsOf(chapters.filter((c) => c.partId === p.id))), title: p.title ?? "" }));
    setForm({ ministryId: m.ministryId, name: m.name, bookTitle: m.bookTitle, withParts: m.parts.length > 0, sections });
    setOpen(true);
  };

  function close() {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm());
  }

  const updateSection = (key: string, patch: Partial<SectionRow>) =>
    setForm((f) => ({ ...f, sections: f.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));

  // RG-ASM-02 — un chapitre lu est identifié par (partie, numéro) : changer la structure du module
  // (avec / sans parties) le retirerait, le backend refuserait. On verrouille donc la bascule.
  const hasRead = form.sections.some((s) => s.chapters.some((c) => c.read));
  const setWithParts = (withParts: boolean) => {
    if (hasRead || withParts === form.withParts) return;
    if (withParts) {
      // Les chapitres déjà saisis deviennent la partie 1.
      setForm({ ...form, withParts, sections: form.sections.map((s) => ({ ...s, number: "1" })) });
    } else {
      // Toutes les parties fusionnent en un seul bloc ; des numéros en double seront signalés.
      setForm({ ...form, withParts, sections: [newSection("", form.sections.flatMap((s) => s.chapters))] });
    }
  };

  const addPart = () => {
    const max = form.sections.reduce((mx, s) => Math.max(mx, parseNumber(s.number) ?? 0), 0);
    setForm({ ...form, sections: [...form.sections, newSection(String(max + 1))] });
  };

  const removePart = (key: string) => setForm({ ...form, sections: form.sections.filter((s) => s.key !== key) });

  // Validation locale (le backend reste juge : 400 / 422 DUPLICATE_*_NUMBER).
  const partNumbers = form.sections.map((s) => parseNumber(s.number));
  const partsError = !form.withParts
    ? null
    : form.sections.length === 0
      ? t("teachingModules.errNoParts")
      : partNumbers.some((n) => n == null)
        ? t("teachingModules.errInvalidPartNumber")
        : new Set(partNumbers).size !== partNumbers.length
          ? t("teachingModules.errDuplicatePartNumber")
          : null;
  const hasChaptersError = form.sections.some((s) => chaptersErrorKey(s.chapters) != null);
  const chapterCount = form.sections.reduce((n, s) => n + s.chapters.length, 0);
  const canSave =
    !!form.ministryId && !!form.name.trim() && !!form.bookTitle.trim() && !partsError && !hasChaptersError && !saveM.isPending;

  const rows = modulesQ.data ?? [];

  const cols = [
    {
      label: t("teachingModules.colName"),
      render: (r: TeachingModuleResponse) => <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>{r.name}</span>,
    },
    { label: t("teachingModules.colBook"), render: (r: TeachingModuleResponse) => <span style={{ color: "var(--ink-700)" }}>{r.bookTitle}</span> },
    ...(ministryFilter
      ? []
      : [{ label: t("teachingModules.colMinistry"), render: (r: TeachingModuleResponse) => <span style={{ color: "var(--ink-700)" }}>{ministryName(r.ministryId)}</span> }]),
    {
      label: t("teachingModules.colChapters"),
      render: (r: TeachingModuleResponse) => {
        const read = r.chapters.filter((c) => c.read).length;
        return (
          <span style={{ color: "var(--ink-700)" }}>
            {r.parts.length > 0 && <>{t("teachingModules.partCount", { count: r.parts.length })} · </>}
            {t("teachingModules.chapterCount", { count: r.chapters.length })}
            {read > 0 && <span style={{ color: "var(--ink-400)" }}> · {t("teachingModules.readCount", { count: read })}</span>}
          </span>
        );
      },
    },
    {
      label: t("teachingModules.colStatus"),
      render: (r: TeachingModuleResponse) =>
        r.active ? <Badge tone="ok" dot>{t("teachingModules.active")}</Badge> : <Badge tone="gray" dot>{t("teachingModules.inactive")}</Badge>,
    },
    {
      label: "",
      style: { width: 1 },
      cellStyle: { whiteSpace: "nowrap" as const },
      render: (r: TeachingModuleResponse) => (
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          <Toggle
            checked={r.active}
            onChange={(v) => toggleActiveM.mutate({ id: r.id, active: v })}
            label={t("teachingModules.activeToggle")}
          />
          <IconButton icon={<Icons.Edit size={15} />} title={t("teachingModules.edit")} onClick={() => openEdit(r)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <TopBar
        title={t("teachingModules.title")}
        crumbs={[t("common.jexcellence"), t("teachingModules.title")]}
        actions={
          <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={openCreate}>
            {t("teachingModules.newModule")}
          </Button>
        }
      />
      <div className="content">
        <p className="section-sub">
          <Trans i18nKey="teachingModules.intro" components={{ strong: <strong /> }} />
        </p>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line,#eee)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{t("teachingModules.filterLabel")}</span>
            <Select value={ministryFilter} onChange={(e) => setMinistryFilter(e.target.value)}>
              <option value="">{t("teachingModules.allMinistries")}</option>
              {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>

          {modulesQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : modulesQ.isError ? (
            <div style={{ padding: 24, color: "var(--danger, #b4452f)" }}>
              {t("teachingModules.loadError", { error: errText(modulesQ.error) })}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>{t("teachingModules.empty")}</div>
          ) : (
            <Table columns={cols} rows={rows.map((r) => ({ ...r, _key: r.id }))} onRowClick={openEdit} />
          )}
        </div>
      </div>

      <Modal
        open={open}
        onClose={close}
        size="lg"
        title={editing ? t("teachingModules.editTitle") : t("teachingModules.createTitle")}
        sub={editing ? ministryName(editing.ministryId) : t("teachingModules.createSub")}
        footer={
          <>
            <Button variant="ghost" onClick={close}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={() => saveM.mutate()} disabled={!canSave}>
              {saveM.isPending ? t("common.saving") : editing ? t("common.save") : t("teachingModules.createButton")}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!editing && (
            <Field label={t("teachingModules.ministryLabel")}>
              <Select value={form.ministryId} onChange={(e) => setForm({ ...form, ministryId: e.target.value })}>
                <option value="">{t("common.choose")}</option>
                {(ministriesQ.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("teachingModules.nameLabel")}>
              <Input value={form.name} maxLength={200} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("teachingModules.namePlaceholder")} />
            </Field>
            <Field label={t("teachingModules.bookLabel")}>
              <Input value={form.bookTitle} maxLength={300} onChange={(e) => setForm({ ...form, bookTitle: e.target.value })} placeholder={t("teachingModules.bookPlaceholder")} />
            </Field>
          </div>

          <Field label={t("teachingModules.structureLabel")} hint={hasRead ? t("teachingModules.structureLocked") : t("teachingModules.structureHint")}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: hasRead ? "not-allowed" : "pointer", opacity: hasRead ? 0.6 : 1 }}>
              <Checkbox checked={form.withParts} onChange={setWithParts} />
              <span>{t("teachingModules.withParts")}</span>
            </label>
          </Field>

          {form.withParts ? (
            <>
              {form.sections.map((section) => {
                const partRead = section.chapters.some((c) => c.read);
                return (
                  <div key={section.key} style={{ border: "1px solid var(--line, #eee)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{t("teachingModules.partLabel")}</span>
                      <Input
                        type="number"
                        min={1}
                        style={{ width: 80 }}
                        value={section.number}
                        // RG-ASM-02 — le numéro de partie identifie ses chapitres lus.
                        disabled={partRead}
                        aria-label={t("teachingModules.partNumberLabel")}
                        onChange={(e) => updateSection(section.key, { number: e.target.value })}
                      />
                      <div style={{ flex: 1 }}>
                        <Input
                          value={section.title}
                          maxLength={300}
                          placeholder={t("teachingModules.partTitlePlaceholder")}
                          onChange={(e) => updateSection(section.key, { title: e.target.value })}
                        />
                      </div>
                      <IconButton
                        icon={<Icons.Trash size={14} />}
                        danger
                        disabled={partRead}
                        title={partRead ? t("teachingModules.cannotRemoveReadPart") : t("teachingModules.removePart")}
                        onClick={() => !partRead && removePart(section.key)}
                      />
                    </div>
                    <ChaptersEditor section={section} onChange={(patch) => updateSection(section.key, patch)} />
                  </div>
                );
              })}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Button variant="secondary" size="sm" iconL={<Icons.Plus size={13} />} onClick={addPart}>{t("teachingModules.addPart")}</Button>
                <span style={{ color: "var(--ink-500)", fontSize: 13 }}>
                  {t("teachingModules.partCount", { count: form.sections.length })} · {t("teachingModules.chapterCount", { count: chapterCount })}
                </span>
                {partsError && <span style={{ color: "var(--danger, #b4452f)", fontSize: 13 }}>{partsError}</span>}
              </div>
            </>
          ) : (
            form.sections[0] && (
              <ChaptersEditor section={form.sections[0]} onChange={(patch) => updateSection(form.sections[0].key, patch)} />
            )
          )}
        </div>
      </Modal>
    </>
  );
}

/**
 * Chapitres d'un bloc (une partie, ou le module entier sans parties) : saisie rapide « de … à … »
 * et lignes numéro + titre. RG-ASM-02 : un chapitre lu se renomme, ne se retire pas.
 */
function ChaptersEditor({ section, onChange }: { section: SectionRow; onChange: (patch: Partial<SectionRow>) => void }) {
  const { t } = useTranslation();
  const chapters = section.chapters;

  // Saisie rapide « 1 à N » : régénère la liste en conservant les titres déjà saisis pour les
  // numéros communs. RG-ASM-02 : un chapitre déjà lu hors de la plage est conservé.
  const from = parseNumber(section.rangeFrom);
  const to = parseNumber(section.rangeTo);
  const rangeValid = from != null && to != null && to >= from && to - from < 500;
  const generate = () => {
    if (!rangeValid) return;
    const byNumber = new Map(chapters.map((c) => [parseNumber(c.number), c]));
    const rows: ChapterRow[] = [];
    for (let n = from!; n <= to!; n++) {
      const prev = byNumber.get(n);
      rows.push(prev ? { ...prev, number: String(n) } : { key: newKey(), number: String(n), title: "", read: false });
    }
    const kept = chapters.filter((c) => {
      const n = parseNumber(c.number);
      return c.read && (n == null || n < from! || n > to!);
    });
    onChange({ chapters: [...rows, ...kept].sort((a, b) => (parseNumber(a.number) ?? 0) - (parseNumber(b.number) ?? 0)) });
  };

  const addChapter = () => {
    const max = chapters.reduce((mx, c) => Math.max(mx, parseNumber(c.number) ?? 0), 0);
    onChange({ chapters: [...chapters, { key: newKey(), number: String(max + 1), title: "", read: false }] });
  };

  const updateRow = (key: string, patch: Partial<ChapterRow>) =>
    onChange({ chapters: chapters.map((c) => (c.key === key ? { ...c, ...patch } : c)) });

  const removeRow = (key: string) => onChange({ chapters: chapters.filter((c) => c.key !== key) });

  const errorKey = chaptersErrorKey(chapters);

  return (
    <>
      <Field label={t("teachingModules.quickEntryLabel")} hint={t("teachingModules.quickEntryHint")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{t("teachingModules.rangeFrom")}</span>
          <Input type="number" min={1} style={{ width: 90 }} value={section.rangeFrom} onChange={(e) => onChange({ rangeFrom: e.target.value })} />
          <span>{t("teachingModules.rangeTo")}</span>
          <Input type="number" min={1} style={{ width: 90 }} value={section.rangeTo} onChange={(e) => onChange({ rangeTo: e.target.value })} />
          <Button variant="secondary" onClick={generate} disabled={!rangeValid}>{t("teachingModules.generate")}</Button>
        </div>
      </Field>

      <Field label={t("teachingModules.chaptersLabel", { count: chapters.length })}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
          {chapters.length === 0 && <span style={{ color: "var(--ink-400)" }}>{t("teachingModules.noChaptersYet")}</span>}
          {chapters.map((c) => (
            <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Input
                type="number"
                min={1}
                style={{ width: 80 }}
                value={c.number}
                // RG-ASM-02 — le numéro identifie le chapitre : le changer revient à retirer un chapitre lu.
                disabled={c.read}
                aria-label={t("teachingModules.numberLabel")}
                onChange={(e) => updateRow(c.key, { number: e.target.value })}
              />
              <div style={{ flex: 1 }}>
                <Input
                  value={c.title}
                  maxLength={300}
                  placeholder={t("teachingModules.titlePlaceholder")}
                  onChange={(e) => updateRow(c.key, { title: e.target.value })}
                />
              </div>
              {c.read && <Badge tone="earth">{t("teachingModules.readBadge")}</Badge>}
              <IconButton
                icon={<Icons.Trash size={14} />}
                danger
                disabled={c.read}
                title={c.read ? t("teachingModules.cannotRemoveRead") : t("teachingModules.removeChapter")}
                onClick={() => !c.read && removeRow(c.key)}
              />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <Button variant="ghost" size="sm" iconL={<Icons.Plus size={13} />} onClick={addChapter}>{t("teachingModules.addChapter")}</Button>
          {errorKey && <span style={{ color: "var(--danger, #b4452f)", fontSize: 13 }}>{t(errorKey)}</span>}
        </div>
      </Field>
    </>
  );
}
