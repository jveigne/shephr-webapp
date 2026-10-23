import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Checkbox, Field, IconButton, Input, Modal, Select, Table, Toggle, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { apiErrorCode } from "@/services/api";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";
import { LANGUAGES, type Language } from "@/services/orgService";
import {
  createTeachingModule,
  importStudyModule,
  listChapterQuestions,
  listTeachingModules,
  replaceChapterQuestions,
  replaceTeachingContent,
  updateTeachingModule,
  type ChapterInput,
  type StudyAnswerFormat,
  type StudyImportRequest,
  type StudyQuestionAdmin,
  type StudyQuestionInput,
  type StudyQuestionType,
  type TeachingContent,
  type TeachingModuleResponse,
  type UpdateTeachingModuleRequest,
} from "@/services/teachingModuleService";

// D-ASM-10 (JP 23/09) — Modules d'enseignement : propres à chaque ministère, communs à toutes ses
// assemblées ; créés / modifiés / désactivés ici par SUPER_ADMIN uniquement (RG-ASM-01).
// RG-ASM-01 v2 (JP 24/09) — un module a des parties (au-dessus des chapitres) ou uniquement des
// chapitres ; dans un module à parties, la numérotation des chapitres repart à 1 dans chaque partie.
// D-ETU-15 (JP 21/10) — Étude de l'assemblée gérée dans cette même page (pas de page à part) : un
// module devient une « unité » (code, prérequis D-ETU-19), un chapitre une « leçon » (portion,
// questions — D-ETU-01 / D-ETU-02) ; import JSON (D-ETU-16) d'un module né inactif (D-ETU-17).

/** Une ligne de chapitre en cours d'édition (numéro saisi en texte pour laisser l'input libre). */
interface ChapterRow {
  key: string;
  /** Chapitre enregistré (null : ligne ajoutée, pas encore créée) — cible de l'éditeur de questions. */
  id: string | null;
  number: string;
  title: string;
  /** D-ETU-02 — portion du livre lue avant la leçon. */
  portion: string;
  /** RG-ASM-02 — déjà lu dans une réunion : renommable, jamais retirable. */
  read: boolean;
  /** RG-ETU-23 — déjà étudié en séance : même verrou que `read`. */
  studied: boolean;
  questionCount: number;
}

/** RG-ASM-02 / RG-ETU-23 — un chapitre lu ou étudié se renomme, ne se retire ni ne se renumérote. */
const isLocked = (c: ChapterRow) => c.read || c.studied;

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
  /** D-ETU-01 — ex. « UEMB002 » ; vide = module de lecture sans code. */
  code: string;
  /** D-ETU-25 (JP 21/10) — langue de cette version de l'unité (même code en FR et en EN). */
  language: Language;
  /** D-ETU-19 — vide = sans prérequis. */
  prerequisiteModuleId: string;
  withParts: boolean;
  sections: SectionRow[];
}

let rowSeq = 0;
const newKey = () => `row-${++rowSeq}`;

const newChapterRow = (n: number): ChapterRow => ({
  key: newKey(), id: null, number: String(n), title: "", portion: "", read: false, studied: false, questionCount: 0,
});

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
  code: "",
  language: "FR",
  prerequisiteModuleId: "",
  withParts: false,
  sections: [newSection("")],
});

function parseNumber(s: string): number | null {
  const n = Number(s.trim());
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** Normalise une liste de chapitres envoyée au backend (ordre = ordre affiché, titre vide → null). */
function toChapterInputs(rows: ChapterRow[]): ChapterInput[] {
  return rows.map((r) => ({ number: parseNumber(r.number) ?? 0, title: r.title.trim() || null, portion: r.portion.trim() || null }));
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
  const input = (c: (typeof chapters)[number]): ChapterInput => ({ number: c.number, title: c.title ?? null, portion: c.portion ?? null });
  if (m.parts.length === 0) return { chapters: chapters.map(input) };
  return {
    parts: [...m.parts]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((p) => ({ number: p.number, title: p.title ?? null, chapters: chapters.filter((c) => c.partId === p.id).map(input) })),
  };
}

/**
 * Identité des chapitres (numéros de partie et de chapitre), sans titres ni portions : tant qu'elle
 * ne change pas, chaque ligne désigne bien le chapitre enregistré et ses questions sont éditables.
 */
function structureOf(content: TeachingContent): string {
  const nums = (list: ChapterInput[]) => list.map((c) => c.number);
  return JSON.stringify(content.parts ? content.parts.map((p) => [p.number, nums(p.chapters)]) : nums(content.chapters ?? []));
}

/**
 * Le module `candidateId` mène-t-il à `targetId` en suivant les prérequis ? Le choisir comme
 * prérequis de `targetId` formerait un cycle (RG-ETU-24 ; le backend reste juge).
 */
function leadsTo(candidateId: string, targetId: string, modules: TeachingModuleResponse[]): boolean {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const seen = new Set<string>();
  let cur: string | null = candidateId;
  while (cur && !seen.has(cur)) {
    if (cur === targetId) return true;
    seen.add(cur);
    cur = byId.get(cur)?.prerequisiteModuleId ?? null;
  }
  return false;
}

/**
 * Message d'erreur d'une écriture du back-office. `STUDY_CONTENT_INVALID` (RG-ETU-22) est rendu
 * **tel quel** : c'est la liste des questions fautives, rédigée par le backend.
 */
function errorText(e: unknown, t: TFunction): string {
  const code = apiErrorCode(e);
  if (code === "CHAPTER_ALREADY_READ") return t("teachingModules.errChapterAlreadyRead");
  if (code === "DUPLICATE_CHAPTER_NUMBER") return t("teachingModules.errDuplicateNumber");
  if (code === "DUPLICATE_PART_NUMBER") return t("teachingModules.errDuplicatePartNumber");
  if (code === "CHAPTERS_OR_PARTS_REQUIRED") return t("teachingModules.errNoChapters");
  if (code === "TEACHING_MODULE_FIELD_REQUIRED") return t("teachingModules.errFieldRequired");
  if (code === "TEACHING_MODULE_CODE_EXISTS") return t("teachingModules.errCodeExists");
  if (code === "STUDY_PREREQUISITE_INVALID") return t("teachingModules.errPrerequisiteInvalid");
  if (code === "STUDY_QUESTION_ANSWERED") return t("teachingModules.questions.errAnswered");
  if (code === "STUDY_QUESTION_INVALID") return t("teachingModules.questions.errParentInvalid");
  if (code === "DUPLICATE_QUESTION_NUMBER") return t("teachingModules.questions.errDuplicateNumber");
  return e instanceof Error ? e.message : t("common.error");
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
  /** Leçon dont l'éditeur de questions est ouvert (au-dessus de la modale du module). */
  const [questionsFor, setQuestionsFor] = useState<ChapterRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  /** RG-ETU-22 — activation refusée : la liste des questions fautives, affichée telle quelle. */
  const [contentInvalid, setContentInvalid] = useState<{ name: string; message: string } | null>(null);

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const modulesQ = useQuery({
    queryKey: ["teaching-modules", ministryFilter],
    queryFn: () => listTeachingModules(ministryFilter || undefined),
  });

  // D-ETU-19 — prérequis choisi parmi les modules du ministère du formulaire (même clé que la liste).
  const sameMinistryQ = useQuery({
    queryKey: ["teaching-modules", form.ministryId],
    queryFn: () => listTeachingModules(form.ministryId),
    enabled: open && !!form.ministryId,
  });

  const ministryName = useMemo(() => {
    const map = new Map((ministriesQ.data ?? []).map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [ministriesQ.data]);

  const errText = (e: unknown): string => errorText(e, t);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["teaching-modules"] });

  // RG-ASM-02 — désactiver retire le module de la saisie des CR ; il reste visible dans l'historique.
  // D-ETU-17 — activer publie l'unité d'étude : le backend contrôle toutes ses questions (RG-ETU-22).
  const toggleActiveM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => updateTeachingModule(v.id, { active: v.active }),
    onSuccess: (m) => {
      invalidate();
      push({ kind: "ok", title: m.active ? t("teachingModules.activatedToast") : t("teachingModules.deactivatedToast"), msg: m.name });
    },
    onError: (e: unknown, v) => {
      if (apiErrorCode(e) === "STUDY_CONTENT_INVALID" && e instanceof Error) {
        setContentInvalid({ name: modulesQ.data?.find((m) => m.id === v.id)?.name ?? "", message: e.message });
        return;
      }
      push({ kind: "error", title: t("common.failure"), msg: errText(e) });
    },
  });

  const saveM = useMutation({
    mutationFn: async (): Promise<TeachingModuleResponse> => {
      const content = toContent(form);
      const name = form.name.trim();
      const bookTitle = form.bookTitle.trim();
      const code = form.code.trim();
      const prerequisiteModuleId = form.prerequisiteModuleId;
      if (!editing) {
        return createTeachingModule({
          ministryId: form.ministryId, name, bookTitle, code: code || null, language: form.language,
          prerequisiteModuleId: prerequisiteModuleId || null, ...content,
        });
      }
      let result = editing;
      // PATCH : absent = inchangé ; remettre à null passe par clearCode / clearPrerequisite.
      const patch: UpdateTeachingModuleRequest = {};
      if (name !== editing.name) patch.name = name;
      if (bookTitle !== editing.bookTitle) patch.bookTitle = bookTitle;
      if (code !== (editing.code ?? "")) {
        if (code) patch.code = code;
        else patch.clearCode = true;
      }
      if (form.language !== (editing.language ?? "FR")) patch.language = form.language;
      if (prerequisiteModuleId !== (editing.prerequisiteModuleId ?? "")) {
        if (prerequisiteModuleId) patch.prerequisiteModuleId = prerequisiteModuleId;
        else patch.clearPrerequisite = true;
      }
      if (Object.keys(patch).length > 0) {
        result = await updateTeachingModule(editing.id, patch);
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
      list.map((c) => ({
        key: newKey(), id: c.id, number: String(c.number), title: c.title ?? "", portion: c.portion ?? "",
        read: c.read, studied: c.studied, questionCount: c.questionCount,
      }));
    const sections = m.parts.length === 0
      ? [newSection("", rowsOf(chapters))]
      : [...m.parts]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((p) => ({ ...newSection(String(p.number), rowsOf(chapters.filter((c) => c.partId === p.id))), title: p.title ?? "" }));
    setForm({
      ministryId: m.ministryId, name: m.name, bookTitle: m.bookTitle, code: m.code ?? "", language: m.language ?? "FR",
      prerequisiteModuleId: m.prerequisiteModuleId ?? "", withParts: m.parts.length > 0, sections,
    });
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
  // RG-ETU-23 — même verrou pour un chapitre étudié en séance.
  const hasRead = form.sections.some((s) => s.chapters.some(isLocked));
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

  // Éditeur de questions : seulement sur un chapitre enregistré dont la numérotation n'a pas bougé
  // (sinon la ligne ne désigne plus le chapitre du backend — rapprochement par partie et numéro).
  const structureDirty = !!editing && structureOf(contentOf(editing)) !== structureOf(toContent(form));
  const questionsLockedReason = !editing ? null : structureDirty ? t("teachingModules.questionsSaveFirst") : null;

  // D-ETU-19 / RG-ETU-24 — même ministère, pas lui-même, pas de cycle.
  // D-ETU-27 (21/10) — le prérequis se contrôle par `code` : une autre version (FR / EN) de la même
  // unité n'est pas un prérequis possible (le backend refuserait, STUDY_PREREQUISITE_INVALID).
  const formCode = form.code.trim();
  const prerequisiteChoices = (sameMinistryQ.data ?? []).filter(
    (m) => m.ministryId === form.ministryId
      && !(formCode && m.code === formCode)
      && (!editing || (m.id !== editing.id && !leadsTo(m.id, editing.id, sameMinistryQ.data ?? []))),
  );

  /** Met à jour le compteur « Questions (n) » de la ligne après un enregistrement de l'éditeur. */
  const onQuestionsSaved = (chapterId: string, count: number) =>
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s) => ({ ...s, chapters: s.chapters.map((c) => (c.id === chapterId ? { ...c, questionCount: count } : c)) })),
    }));

  const onImported = (m: TeachingModuleResponse) => {
    setImportOpen(false);
    invalidate();
    push({ kind: "ok", title: t("teachingModules.import.doneToast"), msg: m.code ? `${m.code} · ${m.name}` : m.name });
    // Relecture immédiate : le module importé naît inactif (D-ETU-17).
    openEdit(m);
  };

  const rows = modulesQ.data ?? [];
  const moduleLabel = (id: string) => {
    const m = rows.find((x) => x.id === id);
    return m ? (m.code ? `${m.code} · ${m.name}` : m.name) : "—";
  };

  const cols = [
    {
      label: t("teachingModules.colName"),
      render: (r: TeachingModuleResponse) => (
        <div>
          <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>
            {r.code && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--green-800)", marginRight: 8 }}>{r.code}</span>}
            {r.name}
          </span>
          {/* D-ETU-25 (JP 21/10) — pastille FR / EN : deux versions d'une unité partagent leur code. */}
          <span style={{ marginLeft: 8 }} title={t(`teachingModules.language.${r.language ?? "FR"}`)}>
            <Badge tone={r.language === "EN" ? "earth" : "gray"}>{r.language ?? "FR"}</Badge>
          </span>
          {r.prerequisiteModuleId && (
            <div style={{ color: "var(--ink-500)", fontSize: 12, marginTop: 2 }}>
              {t("teachingModules.prerequisiteShort", { module: moduleLabel(r.prerequisiteModuleId) })}
            </div>
          )}
        </div>
      ),
    },
    { label: t("teachingModules.colBook"), render: (r: TeachingModuleResponse) => <span style={{ color: "var(--ink-700)" }}>{r.bookTitle}</span> },
    ...(ministryFilter
      ? []
      : [{ label: t("teachingModules.colMinistry"), render: (r: TeachingModuleResponse) => <span style={{ color: "var(--ink-700)" }}>{ministryName(r.ministryId)}</span> }]),
    {
      label: t("teachingModules.colChapters"),
      render: (r: TeachingModuleResponse) => {
        const read = r.chapters.filter((c) => c.read).length;
        const questions = r.chapters.reduce((n, c) => n + (c.questionCount ?? 0), 0);
        return (
          <span style={{ color: "var(--ink-700)" }}>
            {r.parts.length > 0 && <>{t("teachingModules.partCount", { count: r.parts.length })} · </>}
            {t("teachingModules.chapterCount", { count: r.chapters.length })}
            {read > 0 && <span style={{ color: "var(--ink-400)" }}> · {t("teachingModules.readCount", { count: read })}</span>}
            {questions > 0 && <span style={{ color: "var(--ink-400)" }}> · {t("teachingModules.questionCount", { count: questions })}</span>}
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
          <>
            <Button variant="secondary" iconL={<Icons.Upload size={15} />} onClick={() => setImportOpen(true)}>
              {t("teachingModules.import.button")}
            </Button>
            <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={openCreate}>
              {t("teachingModules.newModule")}
            </Button>
          </>
        }
      />
      <div className="content">
        {/* D-ETU-29 / D-ETU-32 (JP 23/10) — catalogue commun aux modules ASSEMBLY (CR) et STUDY (étude) : l'aide le dit. */}
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
        // L'éditeur de questions s'empile au-dessus : Échap ne doit fermer que lui.
        onClose={questionsFor ? undefined : close}
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
          {/* D-ETU-01 / D-ETU-19 (JP 21/10) — code et prérequis de l'unité d'étude, facultatifs. */}
          {/* D-ETU-25 (JP 21/10) — langue de la version : même code en FR et en EN. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12 }}>
            <Field label={t("teachingModules.codeLabel")} hint={t("teachingModules.codeHint")}>
              <Input value={form.code} maxLength={20} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={t("teachingModules.codePlaceholder")} />
            </Field>
            <Field label={t("teachingModules.languageLabel")} hint={t("teachingModules.languageHint")}>
              <Select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as Language })}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{t(`teachingModules.language.${l}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("teachingModules.prerequisiteLabel")} hint={t("teachingModules.prerequisiteHint")}>
              <Select
                value={form.prerequisiteModuleId}
                disabled={!form.ministryId}
                onChange={(e) => setForm({ ...form, prerequisiteModuleId: e.target.value })}
              >
                <option value="">{t("teachingModules.noPrerequisite")}</option>
                {prerequisiteChoices.map((m) => <option key={m.id} value={m.id}>{m.code ? `${m.code} · ${m.name}` : m.name} ({m.language ?? "FR"})</option>)}
                {/* Prérequis enregistré hors de la liste (chargement en cours) : on le garde affiché. */}
                {form.prerequisiteModuleId && !prerequisiteChoices.some((m) => m.id === form.prerequisiteModuleId) && (
                  <option value={form.prerequisiteModuleId}>{moduleLabel(form.prerequisiteModuleId)}</option>
                )}
              </Select>
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
                const partRead = section.chapters.some(isLocked);
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
                    <ChaptersEditor
                      section={section}
                      onChange={(patch) => updateSection(section.key, patch)}
                      onOpenQuestions={editing ? setQuestionsFor : undefined}
                      questionsLockedReason={questionsLockedReason}
                    />
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
              <ChaptersEditor
                section={form.sections[0]}
                onChange={(patch) => updateSection(form.sections[0].key, patch)}
                onOpenQuestions={editing ? setQuestionsFor : undefined}
                questionsLockedReason={questionsLockedReason}
              />
            )
          )}
        </div>
      </Modal>

      {editing && questionsFor?.id && (
        <QuestionsEditor
          module={editing}
          chapter={questionsFor}
          chapterId={questionsFor.id}
          onClose={() => setQuestionsFor(null)}
          onSaved={(count) => {
            onQuestionsSaved(questionsFor.id!, count);
            invalidate();
          }}
        />
      )}

      {importOpen && (
        <ImportModal
          ministries={ministriesQ.data ?? []}
          defaultMinistryId={ministryFilter}
          onClose={() => setImportOpen(false)}
          onImported={onImported}
        />
      )}

      {/* RG-ETU-22 — activation refusée : message du backend tel quel (une ligne par défaut). */}
      <Modal
        open={!!contentInvalid}
        onClose={() => setContentInvalid(null)}
        title={t("teachingModules.contentInvalidTitle")}
        sub={contentInvalid?.name}
        footer={<Button variant="primary" onClick={() => setContentInvalid(null)}>{t("common.close")}</Button>}
      >
        <p style={{ margin: "0 0 10px", color: "var(--ink-700)" }}>{t("teachingModules.contentInvalidIntro")}</p>
        <div style={contentInvalidStyle}>{contentInvalid?.message}</div>
      </Modal>
    </>
  );
}

/** Bloc du message `STUDY_CONTENT_INVALID` : retours à la ligne du backend conservés. */
const contentInvalidStyle = {
  whiteSpace: "pre-wrap",
  background: "var(--err-bg)",
  color: "var(--err)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 13,
  maxHeight: 320,
  overflowY: "auto",
} as const;

/**
 * Chapitres d'un bloc (une partie, ou le module entier sans parties) : saisie rapide « de … à … »
 * et lignes numéro + titre + portion. RG-ASM-02 / RG-ETU-23 : un chapitre lu ou étudié se renomme,
 * ne se retire pas. D-ETU-15 — bouton « Questions (n) » vers l'éditeur de la leçon.
 */
function ChaptersEditor({
  section, onChange, onOpenQuestions, questionsLockedReason,
}: {
  section: SectionRow;
  onChange: (patch: Partial<SectionRow>) => void;
  /** Absent à la création : les questions s'ajoutent une fois le module enregistré. */
  onOpenQuestions?: (row: ChapterRow) => void;
  /** Non nul : numérotation modifiée, à enregistrer avant d'ouvrir les questions. */
  questionsLockedReason: string | null;
}) {
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
      rows.push(prev ? { ...prev, number: String(n) } : newChapterRow(n));
    }
    const kept = chapters.filter((c) => {
      const n = parseNumber(c.number);
      return isLocked(c) && (n == null || n < from! || n > to!);
    });
    onChange({ chapters: [...rows, ...kept].sort((a, b) => (parseNumber(a.number) ?? 0) - (parseNumber(b.number) ?? 0)) });
  };

  const addChapter = () => {
    const max = chapters.reduce((mx, c) => Math.max(mx, parseNumber(c.number) ?? 0), 0);
    onChange({ chapters: [...chapters, newChapterRow(max + 1)] });
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
          {chapters.map((c) => {
            const locked = isLocked(c);
            const questionsTitle = !c.id ? t("teachingModules.questionsNewChapter") : questionsLockedReason ?? t("teachingModules.questionsOpen");
            return (
              <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Input
                  type="number"
                  min={1}
                  style={{ width: 70 }}
                  value={c.number}
                  // RG-ASM-02 — le numéro identifie le chapitre : le changer revient à retirer un chapitre lu.
                  disabled={locked}
                  aria-label={t("teachingModules.numberLabel")}
                  onChange={(e) => updateRow(c.key, { number: e.target.value })}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input
                    value={c.title}
                    maxLength={300}
                    placeholder={t("teachingModules.titlePlaceholder")}
                    onChange={(e) => updateRow(c.key, { title: e.target.value })}
                  />
                </div>
                {/* D-ETU-02 — portion du livre lue avant la leçon. */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input
                    value={c.portion}
                    maxLength={300}
                    placeholder={t("teachingModules.portionPlaceholder")}
                    aria-label={t("teachingModules.portionLabel")}
                    onChange={(e) => updateRow(c.key, { portion: e.target.value })}
                  />
                </div>
                {c.read && <Badge tone="earth">{t("teachingModules.readBadge")}</Badge>}
                {c.studied && <Badge tone="green">{t("teachingModules.studiedBadge")}</Badge>}
                {onOpenQuestions && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!c.id || !!questionsLockedReason}
                    title={questionsTitle}
                    onClick={() => onOpenQuestions(c)}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {t("teachingModules.questionsButton", { count: c.questionCount })}
                  </Button>
                )}
                <IconButton
                  icon={<Icons.Trash size={14} />}
                  danger
                  disabled={locked}
                  title={c.read ? t("teachingModules.cannotRemoveRead") : c.studied ? t("teachingModules.cannotRemoveStudied") : t("teachingModules.removeChapter")}
                  onClick={() => !locked && removeRow(c.key)}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <Button variant="ghost" size="sm" iconL={<Icons.Plus size={13} />} onClick={addChapter}>{t("teachingModules.addChapter")}</Button>
          {errorKey && <span style={{ color: "var(--danger, #b4452f)", fontSize: 13 }}>{t(errorKey)}</span>}
        </div>
      </Field>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Éditeur des questions d'une leçon — D-ETU-15 (JP 21/10), contrat §3.2.
// ---------------------------------------------------------------------------------------------

/** RG-ETU-20 — ordre de présentation des types dans le sélecteur. */
const QUESTION_TYPES: StudyQuestionType[] = [
  "VRAI_FAUX", "OUI_NON", "CHOIX_UNIQUE", "CHOIX_MULTIPLE", "OUVERTE", "PERSONNELLE", "EXERCICE", "CONSIGNE",
];
const isChoice = (type: StudyQuestionType) => type === "CHOIX_UNIQUE" || type === "CHOIX_MULTIPLE";
/** RG-ETU-09 — `EXERCICE` / `CONSIGNE` ne sont pas notés : points forcés à 0. */
const isUngraded = (type: StudyQuestionType) => type === "EXERCICE" || type === "CONSIGNE";
/** Valeurs de clé des types binaires (contrat §2.3). */
const BINARY_KEYS: Partial<Record<StudyQuestionType, [string, string]>> = { VRAI_FAUX: ["VRAI", "FAUX"], OUI_NON: ["OUI", "NON"] };

/** Points : nombre ≥ 0, 2 décimales au plus (contrat §1.1) ; virgule acceptée à la saisie. */
const POINTS_PATTERN = /^\d+([.,]\d{1,2})?$/;
const parsePoints = (s: string): number | null => (POINTS_PATTERN.test(s.trim()) ? Number(s.trim().replace(",", ".")) : null);

/** Une option d'un choix en cours d'édition ; `correct` porte la clé de réponse (suit un renommage de clé). */
interface OptionRow {
  key: string;
  optKey: string;
  label: string;
  correct: boolean;
}

/** Une question en cours d'édition. Le lien parent passe par la clé de ligne : renuméroter le parent ne perd pas ses sous-questions. */
interface QuestionRow {
  key: string;
  number: string;
  parentKey: string | null;
  statement: string;
  type: StudyQuestionType;
  answerFormat: StudyAnswerFormat | "";
  options: OptionRow[];
  /**
   * Clé de réponse des types sans options (`VRAI_FAUX`, `OUI_NON`) ; pour un choix, les seules clés
   * sans option correspondante. RG-ETU-21 : un import imparfait est conservé tel quel, jamais
   * corrigé en silence — le défaut reste visible et signalé par `issues`.
   */
  answerKey: string[];
  expectedAnswer: string;
  points: string;
  bibleReference: string;
  /** RG-ETU-23 — a des réponses : non supprimable. */
  answered: boolean;
  /** RG-ETU-22 — défauts calculés par le backend au dernier chargement / enregistrement. */
  issues: string[];
  /** Modifiée depuis : ses `issues` datent d'avant la modification. */
  dirty: boolean;
}

function rowsFromServer(list: StudyQuestionAdmin[]): QuestionRow[] {
  const sorted = [...list].sort((a, b) => a.orderIndex - b.orderIndex);
  const keyById = new Map(sorted.map((q) => [q.id, newKey()]));
  const keyByNumber = new Map(sorted.map((q) => [q.number, keyById.get(q.id)!]));
  return sorted.map((q) => {
    const answerKey = q.answerKey ?? [];
    const optionKeys = new Set((q.options ?? []).map((o) => o.key));
    const choice = isChoice(q.type);
    return {
      key: keyById.get(q.id)!,
      number: q.number,
      parentKey: q.parentId ? keyById.get(q.parentId) ?? null : q.parentNumber ? keyByNumber.get(q.parentNumber) ?? null : null,
      statement: q.statement ?? "",
      type: q.type,
      answerFormat: q.answerFormat ?? "",
      options: (q.options ?? []).map((o) => ({ key: newKey(), optKey: o.key ?? "", label: o.label ?? "", correct: choice && answerKey.includes(o.key) })),
      answerKey: choice ? answerKey.filter((k) => !optionKeys.has(k)) : answerKey,
      expectedAnswer: q.expectedAnswer ?? "",
      points: String(q.points ?? 0),
      bibleReference: q.bibleReference ?? "",
      answered: q.answered,
      issues: q.issues ?? [],
      dirty: false,
    };
  });
}

/**
 * Ordre d'affichage = ordre envoyé (contrat §3.2) : chaque question principale suivie de ses
 * sous-questions. Un lien vers une ligne absente ou elle-même sous-question est rompu (un seul
 * niveau, RG-ETU-20) ; les sous-questions gardent leur ordre relatif.
 */
function normalize(rows: QuestionRow[]): QuestionRow[] {
  const roots = new Set(rows.filter((r) => !r.parentKey).map((r) => r.key));
  const fixed = rows.map((r) => (r.parentKey && !roots.has(r.parentKey) ? { ...r, parentKey: null } : r));
  return fixed.filter((r) => !r.parentKey).flatMap((root) => [root, ...fixed.filter((c) => c.parentKey === root.key)]);
}

function toQuestionInputs(rows: QuestionRow[]): StudyQuestionInput[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return normalize(rows).map((r) => {
    const choice = isChoice(r.type);
    const key = choice
      ? Array.from(new Set([...r.options.filter((o) => o.correct).map((o) => o.optKey.trim()), ...r.answerKey]))
      : r.answerKey;
    return {
      number: r.number.trim(),
      parentNumber: r.parentKey ? byKey.get(r.parentKey)?.number.trim() ?? null : null,
      statement: r.statement.trim(),
      type: r.type,
      answerFormat: r.type === "PERSONNELLE" && r.answerFormat ? r.answerFormat : null,
      options: choice ? r.options.map((o) => ({ key: o.optKey.trim(), label: o.label.trim() })) : null,
      answerKey: key.length > 0 ? key : null,
      expectedAnswer: r.expectedAnswer.trim() || null,
      points: isUngraded(r.type) ? 0 : parsePoints(r.points) ?? 0,
      bibleReference: r.bibleReference.trim() || null,
    };
  });
}

/** RG-ETU-21 — contrôle de structure avant envoi (le backend reste juge). Renvoie la clé i18n du défaut. */
function questionErrorKey(r: QuestionRow, rows: QuestionRow[]): string | null {
  const number = r.number.trim();
  if (!number) return "teachingModules.questions.errNumberRequired";
  if (rows.some((o) => o.key !== r.key && o.number.trim() === number)) return "teachingModules.questions.errDuplicateNumber";
  if (!r.statement.trim()) return "teachingModules.questions.errStatementRequired";
  if (!isUngraded(r.type) && parsePoints(r.points) == null) return "teachingModules.questions.errPoints";
  return null;
}

/** Prochaine clé d'option : la lettre qui suit la plus haute déjà utilisée (« a », « b »…). */
function nextOptionKey(options: OptionRow[]): string {
  const codes = options.map((o) => o.optKey.trim().toLowerCase()).filter((k) => /^[a-z]$/.test(k)).map((k) => k.charCodeAt(0));
  const next = codes.length ? Math.max(...codes) + 1 : 97;
  return next <= 122 ? String.fromCharCode(next) : String(options.length + 1);
}

/** Prochain numéro de question principale : entier suivant le plus grand numéro entier. */
function nextRootNumber(rows: QuestionRow[]): string {
  const max = rows.filter((r) => !r.parentKey).reduce((mx, r) => (/^\d+$/.test(r.number.trim()) ? Math.max(mx, Number(r.number.trim())) : mx), 0);
  return String(max + 1);
}

/** Prochain numéro de sous-question : « 6.a », « 6.b »… */
function nextChildNumber(parent: QuestionRow, rows: QuestionRow[]): string {
  const prefix = `${parent.number.trim()}.`;
  const letters = rows
    .filter((r) => r.parentKey === parent.key && r.number.trim().startsWith(prefix))
    .map((r) => r.number.trim().slice(prefix.length).toLowerCase())
    .filter((s) => /^[a-z]$/.test(s))
    .map((s) => s.charCodeAt(0));
  const next = letters.length ? Math.max(...letters) + 1 : 97;
  return prefix + (next <= 122 ? String.fromCharCode(next) : String(letters.length + 1));
}

/** Affichage d'un nombre de points sans zéro inutile (contrat §1.1 : `2`, `1.5`, `0.75`). */
const formatPoints = (n: number) => String(Math.round(n * 100) / 100);

function QuestionsEditor({
  module, chapter, chapterId, onClose, onSaved,
}: {
  module: TeachingModuleResponse;
  chapter: ChapterRow;
  chapterId: string;
  onClose: () => void;
  /** Après un enregistrement réussi : nouveau nombre de questions de la leçon. */
  onSaved: (count: number) => void;
}) {
  const { t } = useTranslation();
  const { push } = useToasts();

  // Pas de cache partagé : chaque ouverture relit l'état du backend (answered, issues).
  const questionsQ = useQuery({
    queryKey: ["teaching-module-questions", chapterId],
    queryFn: () => listChapterQuestions(module.id, chapterId),
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const [rows, setRows] = useState<QuestionRow[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  /** RG-ETU-22 — refus d'un module actif : message du backend tel quel. */
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    if (questionsQ.data) setRows((prev) => prev ?? rowsFromServer(questionsQ.data));
  }, [questionsQ.data]);

  const list = rows ?? [];

  const edit = (next: QuestionRow[]) => {
    setRows(normalize(next));
    setDirty(true);
    setConfirmDiscard(false);
  };
  const patchRow = (key: string, patch: Partial<QuestionRow>) =>
    edit(list.map((r) => (r.key === key ? { ...r, ...patch, dirty: true } : r)));

  const saveM = useMutation({
    mutationFn: () => replaceChapterQuestions(module.id, chapterId, toQuestionInputs(list)),
    onSuccess: (saved) => {
      setRows(rowsFromServer(saved));
      setDirty(false);
      setContentError(null);
      onSaved(saved.length);
      push({ kind: "ok", title: t("teachingModules.questions.savedToast"), msg: t("teachingModules.questionCount", { count: saved.length }) });
    },
    onError: (e: unknown) => {
      if (apiErrorCode(e) === "STUDY_CONTENT_INVALID" && e instanceof Error) {
        setContentError(e.message);
        return;
      }
      setContentError(null);
      push({ kind: "error", title: t("teachingModules.saveFailToast"), msg: errorText(e, t) });
    },
  });

  const requestClose = () => {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  // --- opérations sur la liste ---
  const addQuestion = () =>
    edit([...list, emptyQuestion(nextRootNumber(list), null)]);

  const addSubQuestion = (parent: QuestionRow) =>
    edit([...list, emptyQuestion(nextChildNumber(parent, list), parent.key)]);

  // Retirer une question principale détache ses sous-questions (elles restent, à rattacher ou retirer).
  const removeQuestion = (row: QuestionRow) => {
    if (row.answered) return;
    edit(list.filter((r) => r.key !== row.key).map((r) => (r.parentKey === row.key ? { ...r, parentKey: null, dirty: true } : r)));
  };

  /** Monte / descend une question parmi ses sœurs ; une question principale emmène ses sous-questions. */
  const move = (row: QuestionRow, dir: -1 | 1) => {
    const siblings = list.filter((r) => r.parentKey === row.parentKey);
    const i = siblings.findIndex((r) => r.key === row.key);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const swapped = [...siblings];
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    const others = list.filter((r) => r.parentKey !== row.parentKey);
    edit([...(row.parentKey ? others : []), ...swapped, ...(row.parentKey ? [] : others)]);
  };

  /** Rattache à un parent (fin de ses sous-questions) ou rend principale (juste après son ancien bloc). */
  const setParent = (row: QuestionRow, parentKey: string | null) => {
    const rest = list.filter((r) => r.key !== row.key);
    const moved = { ...row, parentKey, dirty: true };
    if (parentKey) {
      edit([...rest, moved]);
    } else {
      const formerParent = row.parentKey;
      const lastOfBlock = rest.reduce((idx, r, k) => (r.key === formerParent || r.parentKey === formerParent ? k : idx), rest.length - 1);
      edit([...rest.slice(0, lastOfBlock + 1), moved, ...rest.slice(lastOfBlock + 1)]);
    }
  };

  // Changer de type : options gardées en mémoire (envoyées pour un choix seulement), clé remise à
  // zéro hors passage entre choix ; RG-ETU-09 — EXERCICE / CONSIGNE à 0 point.
  const changeType = (row: QuestionRow, type: StudyQuestionType) => {
    const bothChoice = isChoice(row.type) && isChoice(type);
    let options = row.options;
    if (!bothChoice) options = options.map((o) => ({ ...o, correct: false }));
    else if (type === "CHOIX_UNIQUE") {
      const first = options.findIndex((o) => o.correct);
      options = options.map((o, k) => ({ ...o, correct: k === first }));
    }
    patchRow(row.key, {
      type,
      options,
      answerKey: bothChoice ? row.answerKey : [],
      // Sortie d'un type non noté : 1 point proposé (RG-ETU-22 exige > 0 pour un type noté).
      points: isUngraded(type) ? "0" : isUngraded(row.type) ? "1" : row.points,
    });
  };

  const patchOption = (row: QuestionRow, optionKey: string, patch: Partial<OptionRow>) =>
    patchRow(row.key, {
      options: row.options.map((o) => {
        if (o.key === optionKey) return { ...o, ...patch };
        // CHOIX_UNIQUE : une seule bonne réponse.
        if (patch.correct && row.type === "CHOIX_UNIQUE") return { ...o, correct: false };
        return o;
      }),
    });

  // --- synthèse ---
  const errors = list.map((r) => questionErrorKey(r, list));
  const hasErrors = errors.some((e) => e != null);
  const totalPoints = list.reduce((sum, r) => sum + (isUngraded(r.type) ? 0 : parsePoints(r.points) ?? 0), 0);
  const issueCount = list.filter((r) => r.issues.length > 0).length;
  const roots = list.filter((r) => !r.parentKey);

  const lessonLabel = [
    t("teachingModules.questions.lesson", { number: chapter.number }),
    chapter.title.trim(),
  ].filter(Boolean).join(" · ");

  return (
    <Modal
      open
      onClose={requestClose}
      size="lg"
      title={lessonLabel}
      sub={[module.code, module.name, chapter.portion.trim()].filter(Boolean).join(" · ")}
      footer={
        confirmDiscard ? (
          <>
            <span style={{ marginRight: "auto", color: "var(--ink-700)", fontSize: 13, alignSelf: "center" }}>{t("teachingModules.questions.discardPrompt")}</span>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>{t("teachingModules.questions.keepEditing")}</Button>
            <Button variant="danger" onClick={onClose}>{t("teachingModules.questions.discard")}</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={requestClose}>{t("common.close")}</Button>
            <Button variant="primary" onClick={() => saveM.mutate()} disabled={!rows || !dirty || hasErrors || saveM.isPending}>
              {saveM.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </>
        )
      }
    >
      {questionsQ.isError ? (
        <div style={{ color: "var(--err)" }}>{t("teachingModules.questions.loadError", { error: errorText(questionsQ.error, t) })}</div>
      ) : !rows ? (
        <div style={{ color: "var(--ink-500)" }}>{t("common.loading")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, color: "var(--ink-700)" }}>
            <span>{t("teachingModules.questionCount", { count: list.length })} · {t("teachingModules.questions.totalPoints", { points: formatPoints(totalPoints) })}</span>
            {issueCount > 0
              ? <Badge tone="warn" dot>{t("teachingModules.questions.issueCount", { count: issueCount })}</Badge>
              : list.length > 0 && !dirty && <Badge tone="ok" dot>{t("teachingModules.questions.coherent")}</Badge>}
            {module.active
              ? <Badge tone="earth">{t("teachingModules.questions.activeModule")}</Badge>
              : <Badge tone="gray">{t("teachingModules.questions.draftModule")}</Badge>}
          </div>
          <div className="hint" style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
            {module.active ? t("teachingModules.questions.activeHint") : t("teachingModules.questions.draftHint")}
          </div>
          {contentError && <div style={contentInvalidStyle}>{contentError}</div>}

          {list.length === 0 && <span style={{ color: "var(--ink-400)" }}>{t("teachingModules.questions.empty")}</span>}

          {list.map((r, idx) => {
            const child = !!r.parentKey;
            const siblings = list.filter((o) => o.parentKey === r.parentKey);
            const pos = siblings.findIndex((o) => o.key === r.key);
            const hasChildren = list.some((o) => o.parentKey === r.key);
            const errKey = errors[idx];
            const binary = BINARY_KEYS[r.type];
            const binaryValue = r.answerKey[0] ?? "";
            const strayKeys = binary ? r.answerKey.slice(1) : r.answerKey;
            return (
              <div
                key={r.key}
                style={{
                  border: `1px solid ${r.issues.length > 0 || errKey ? "var(--err-bg)" : "var(--line, #eee)"}`,
                  borderRadius: 8,
                  padding: 10,
                  marginLeft: child ? 28 : 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Input
                    style={{ width: 64 }}
                    value={r.number}
                    maxLength={10}
                    aria-label={t("teachingModules.questions.numberLabel")}
                    onChange={(e) => {
                      // RG-ETU-20 — numéro unique dans la leçon ; le libellé « 6.b » reste libre.
                      patchRow(r.key, { number: e.target.value });
                    }}
                  />
                  <Select value={r.type} onChange={(e) => changeType(r, e.target.value as StudyQuestionType)} aria-label={t("teachingModules.questions.typeLabel")}>
                    {QUESTION_TYPES.map((type) => <option key={type} value={type}>{t(`teachingModules.questions.types.${type}`)}</option>)}
                  </Select>
                  <Input
                    style={{ width: 64 }}
                    value={isUngraded(r.type) ? "0" : r.points}
                    disabled={isUngraded(r.type)}
                    inputMode="decimal"
                    aria-label={t("teachingModules.questions.pointsLabel")}
                    title={isUngraded(r.type) ? t("teachingModules.questions.ungradedHint") : t("teachingModules.questions.pointsLabel")}
                    onChange={(e) => patchRow(r.key, { points: e.target.value })}
                  />
                  <span style={{ fontSize: 12, color: "var(--ink-500)" }}>{t("teachingModules.questions.pointsUnit")}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* RG-ETU-20 — sous-question d'une question principale de la même leçon, un seul niveau. */}
                    <Select
                      value={r.parentKey ?? ""}
                      disabled={hasChildren}
                      title={hasChildren ? t("teachingModules.questions.parentLockedHint") : t("teachingModules.questions.parentLabel")}
                      aria-label={t("teachingModules.questions.parentLabel")}
                      onChange={(e) => setParent(r, e.target.value || null)}
                      style={{ width: "100%" }}
                    >
                      <option value="">{t("teachingModules.questions.noParent")}</option>
                      {roots.filter((p) => p.key !== r.key).map((p) => (
                        <option key={p.key} value={p.key}>{t("teachingModules.questions.subOf", { number: p.number.trim() || "?" })}</option>
                      ))}
                    </Select>
                  </div>
                  <IconButton
                    icon={<Icons.ChevDown size={14} style={{ transform: "rotate(180deg)" }} />}
                    title={t("teachingModules.questions.moveUp")}
                    disabled={pos <= 0}
                    onClick={() => move(r, -1)}
                  />
                  <IconButton
                    icon={<Icons.ChevDown size={14} />}
                    title={t("teachingModules.questions.moveDown")}
                    disabled={pos >= siblings.length - 1}
                    onClick={() => move(r, 1)}
                  />
                  <IconButton
                    icon={<Icons.Trash size={14} />}
                    danger
                    disabled={r.answered}
                    title={r.answered ? t("teachingModules.questions.cannotRemoveAnswered") : t("teachingModules.questions.remove")}
                    onClick={() => removeQuestion(r)}
                  />
                </div>

                <textarea
                  className="input"
                  rows={2}
                  value={r.statement}
                  placeholder={r.type === "CONSIGNE" ? t("teachingModules.questions.consignePlaceholder") : t("teachingModules.questions.statementPlaceholder")}
                  aria-label={t("teachingModules.questions.statementLabel")}
                  onChange={(e) => patchRow(r.key, { statement: e.target.value })}
                />

                {binary && (
                  <Field label={t("teachingModules.questions.answerKeyLabel")}>
                    <Select value={binaryValue} onChange={(e) => patchRow(r.key, { answerKey: e.target.value ? [e.target.value] : [] })}>
                      <option value="">{t("teachingModules.questions.noAnswerKey")}</option>
                      {binary.map((v) => <option key={v} value={v}>{t(`teachingModules.questions.keys.${v}`)}</option>)}
                      {/* Import imparfait (RG-ETU-21) : valeur hors liste conservée et affichée. */}
                      {binaryValue && !binary.includes(binaryValue) && <option value={binaryValue}>{binaryValue}</option>}
                    </Select>
                  </Field>
                )}

                {isChoice(r.type) && (
                  <Field
                    label={t("teachingModules.questions.optionsLabel")}
                    hint={r.type === "CHOIX_UNIQUE" ? t("teachingModules.questions.optionsHintSingle") : t("teachingModules.questions.optionsHintMultiple")}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {r.options.map((o) => (
                        <div key={o.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span title={t("teachingModules.questions.correctOption")}>
                            <Checkbox checked={o.correct} onChange={(v) => patchOption(r, o.key, { correct: v })} />
                          </span>
                          <Input
                            style={{ width: 52 }}
                            value={o.optKey}
                            maxLength={10}
                            aria-label={t("teachingModules.questions.optionKeyLabel")}
                            onChange={(e) => patchOption(r, o.key, { optKey: e.target.value })}
                          />
                          <div style={{ flex: 1 }}>
                            <Input
                              value={o.label}
                              placeholder={t("teachingModules.questions.optionLabelPlaceholder")}
                              onChange={(e) => patchOption(r, o.key, { label: e.target.value })}
                            />
                          </div>
                          <IconButton
                            icon={<Icons.X size={14} />}
                            title={t("teachingModules.questions.removeOption")}
                            onClick={() => patchRow(r.key, { options: r.options.filter((x) => x.key !== o.key) })}
                          />
                        </div>
                      ))}
                      <div>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconL={<Icons.Plus size={13} />}
                          onClick={() => patchRow(r.key, { options: [...r.options, { key: newKey(), optKey: nextOptionKey(r.options), label: "", correct: false }] })}
                        >
                          {t("teachingModules.questions.addOption")}
                        </Button>
                      </div>
                    </div>
                  </Field>
                )}

                {/* Clés de réponse sans option ni contrôle dédié (import imparfait) : visibles et retirables. */}
                {strayKeys.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12.5 }}>
                    <span style={{ color: "var(--ink-500)" }}>{t("teachingModules.questions.strayKeys")}</span>
                    {strayKeys.map((k) => (
                      <span key={k} className="chip">
                        {k}
                        <button
                          type="button"
                          className="x"
                          title={t("teachingModules.questions.removeKey")}
                          onClick={() => patchRow(r.key, { answerKey: r.answerKey.filter((x) => x !== k) })}
                        >
                          <Icons.X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {r.type === "PERSONNELLE" && (
                  <Field label={t("teachingModules.questions.answerFormatLabel")} hint={t("teachingModules.questions.answerFormatHint")}>
                    <Select value={r.answerFormat} onChange={(e) => patchRow(r.key, { answerFormat: e.target.value as StudyAnswerFormat | "" })}>
                      <option value="">{t("common.choose")}</option>
                      <option value="TEXT">{t("teachingModules.questions.formats.TEXT")}</option>
                      <option value="YES_NO">{t("teachingModules.questions.formats.YES_NO")}</option>
                    </Select>
                  </Field>
                )}

                {r.type !== "CONSIGNE" && (
                  <Field label={r.type === "OUVERTE" ? t("teachingModules.questions.expectedAnswerLabel") : t("teachingModules.questions.expectedAnswerOptionalLabel")}>
                    <textarea
                      className="input"
                      rows={2}
                      value={r.expectedAnswer}
                      onChange={(e) => patchRow(r.key, { expectedAnswer: e.target.value })}
                    />
                  </Field>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      value={r.bibleReference}
                      maxLength={200}
                      placeholder={t("teachingModules.questions.bibleReferencePlaceholder")}
                      aria-label={t("teachingModules.questions.bibleReferenceLabel")}
                      onChange={(e) => patchRow(r.key, { bibleReference: e.target.value })}
                    />
                  </div>
                  {r.answered && <Badge tone="earth">{t("teachingModules.questions.answeredBadge")}</Badge>}
                  {!child && (
                    <Button variant="ghost" size="sm" iconL={<Icons.Plus size={13} />} onClick={() => addSubQuestion(r)}>
                      {t("teachingModules.questions.addSubQuestion")}
                    </Button>
                  )}
                </div>

                {errKey && <span style={{ color: "var(--err)", fontSize: 13 }}>{t(errKey)}</span>}
                {r.issues.length > 0 && (
                  <div style={{ fontSize: 12.5, color: "var(--err)", opacity: r.dirty ? 0.6 : 1 }}>
                    {r.issues.map((issue, k) => <div key={k}>⚠ {issue}</div>)}
                    {r.dirty && <div style={{ color: "var(--ink-500)" }}>{t("teachingModules.questions.issuesStale")}</div>}
                  </div>
                )}
              </div>
            );
          })}

          <div>
            <Button variant="secondary" size="sm" iconL={<Icons.Plus size={13} />} onClick={addQuestion}>
              {t("teachingModules.questions.add")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function emptyQuestion(number: string, parentKey: string | null): QuestionRow {
  return {
    key: newKey(), number, parentKey, statement: "", type: "OUVERTE", answerFormat: "", options: [], answerKey: [],
    expectedAnswer: "", points: "1", bibleReference: "", answered: false, issues: [], dirty: true,
  };
}

// ---------------------------------------------------------------------------------------------
// Import JSON — D-ETU-16 / RG-ETU-25 (JP 21/10), contrat §3.3.
// ---------------------------------------------------------------------------------------------

function ImportModal({
  ministries, defaultMinistryId, onClose, onImported,
}: {
  ministries: MinistryResponse[];
  defaultMinistryId: string;
  onClose: () => void;
  onImported: (m: TeachingModuleResponse) => void;
}) {
  const { t } = useTranslation();
  const [ministryId, setMinistryId] = useState(defaultMinistryId);
  const [data, setData] = useState<StudyImportRequest | null>(null);
  // D-ETU-25 (JP 21/10) — langue de l'unité importée : lue dans le fichier si elle y figure
  // (`fileLanguage`, prioritaire), sinon choisie ici (défaut `FR`).
  const [language, setLanguage] = useState<Language>("FR");
  const [fileLanguage, setFileLanguage] = useState<Language | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Lecture locale du fichier : seule la forme générale est vérifiée ici, le backend contrôle la
  // structure des questions (RG-ETU-21) et refuse tout le lot en cas d'erreur (transaction unique).
  const pickFile = async (file: File | null) => {
    setData(null);
    setFileError(null);
    setSubmitError(null);
    setFileLanguage(null);
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setFileError(t("teachingModules.import.errNotJson"));
      return;
    }
    const obj = parsed as Partial<StudyImportRequest> | null;
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || !Array.isArray(obj.lessons) || obj.lessons.length === 0) {
      setFileError(t("teachingModules.import.errShape"));
      return;
    }
    setData(obj as StudyImportRequest);
    const lang = typeof obj.language === "string" ? obj.language.toUpperCase() : null;
    if (lang && (LANGUAGES as readonly string[]).includes(lang)) {
      setFileLanguage(lang as Language);
      setLanguage(lang as Language);
    }
    // Le fichier peut porter son ministère ; le choix de l'écran reste prioritaire.
    if (!ministryId && obj.ministryId && ministries.some((m) => m.id === obj.ministryId)) setMinistryId(obj.ministryId);
  };

  const importM = useMutation({
    mutationFn: () => importStudyModule({ ...data!, ministryId, language: fileLanguage ?? language }),
    onSuccess: onImported,
    onError: (e: unknown) => setSubmitError(errorText(e, t)),
  });

  const questionTotal = (data?.lessons ?? []).reduce((n, l) => n + (Array.isArray(l?.questions) ? l.questions.length : 0), 0);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("teachingModules.import.title")}
      sub={t("teachingModules.import.sub")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            variant="primary"
            iconL={<Icons.Upload size={14} />}
            disabled={!data || !ministryId || importM.isPending}
            onClick={() => importM.mutate()}
          >
            {importM.isPending ? t("teachingModules.import.importing") : t("teachingModules.import.submit")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label={t("teachingModules.ministryLabel")}>
          <Select value={ministryId} onChange={(e) => setMinistryId(e.target.value)} disabled={importM.isPending}>
            <option value="">{t("common.choose")}</option>
            {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field
          label={t("teachingModules.import.languageLabel")}
          hint={fileLanguage ? t("teachingModules.import.languageFromFile", { lang: fileLanguage }) : t("teachingModules.languageHint")}
        >
          <Select
            value={fileLanguage ?? language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            disabled={importM.isPending || !!fileLanguage}
          >
            {LANGUAGES.map((l) => <option key={l} value={l}>{t(`teachingModules.language.${l}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("teachingModules.import.fileLabel")} hint={t("teachingModules.import.fileHint")}>
          <input
            type="file"
            accept="application/json,.json"
            className="input"
            disabled={importM.isPending}
            onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
          />
          {fileError && <span style={{ color: "var(--err)", fontSize: 13 }}>{fileError}</span>}
        </Field>
        {data && (
          <div style={{ border: "1px solid var(--line, #eee)", borderRadius: 8, padding: 12, fontSize: 13, color: "var(--ink-700)" }}>
            <div style={{ fontWeight: 600, color: "var(--ink-900)" }}>
              {data.code && <span style={{ fontFamily: "var(--font-mono)", marginRight: 8 }}>{data.code}</span>}
              {data.name || "—"}
              <span style={{ marginLeft: 8 }}><Badge tone={(fileLanguage ?? language) === "EN" ? "earth" : "gray"}>{fileLanguage ?? language}</Badge></span>
            </div>
            <div>{data.bookTitle || "—"}</div>
            <div style={{ marginTop: 4 }}>
              {t("teachingModules.import.lessonCount", { count: data.lessons.length })} · {t("teachingModules.questionCount", { count: questionTotal })}
            </div>
          </div>
        )}
        {submitError && <div style={contentInvalidStyle}>{submitError}</div>}
      </div>
    </Modal>
  );
}
