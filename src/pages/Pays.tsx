import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Field, Input, Table, Toggle, TopBar } from "@/components/primitives";
import { BrandingPreview } from "@/components/BrandingPreview";
import { useToasts } from "@/context/ToastContext";
import { ApiRequestError, apiErrorCode, apiErrorDetails } from "@/services/api";
import {
  getCountryBranding,
  listCountryBrandings,
  saveCountryBranding,
  type AdminCountryBrandingRow,
  type CountryBrandingRequest,
} from "@/services/countryBrandingService";
import {
  CONTRAST_PAIRS,
  MIN_CONTRAST,
  contrastRatio,
  firstContrastFailure,
  type BrandingColors,
  type BrandingRole,
} from "@/utils/brandingPalette";

// D-PAYS-02 (JP 11/11, lot « conf-pays ») — page « Pays » du back-office : liste des pays actifs de la CMCI
// (configuration active ou non, version, date) et éditeur de la configuration d'un pays (spec §4.1 / §6.3) :
// nom affiché, nom court, 10 couleurs (sélecteur + code hexadécimal), texte d'accueil FR / EN (titre + texte), lien
// du site, case « Active ». D-PAYS-04 : la mise en place se paie hors application — cocher « Active » est le seul
// geste ; décocher ramène le pays en Shephr standard au lancement suivant, rien n'est supprimé. Pas d'historique.
// RG-PAYS-10 (JP 11/11) — indicateur de contraste par paire, MÊME calcul que le serveur (`utils/brandingPalette.ts`,
// copie identique du contrat §5.1) : une configuration ACTIVE sous 4,5:1 est refusée ici (bouton inactif) et par le
// serveur (422 `BRANDING_CONTRAST_TOO_LOW`) ; une configuration inactive s'enregistre telle quelle (brouillon).
// D-PAYS-03 : aucun logo ici (fichier intégré aux apps). D-PAYS-08 : aucune police. D-PAYS-07 : mode clair seulement.

const ROLES: BrandingRole[] = [
  "principale", "texteSurPrincipale", "accent", "texteSurAccent",
  "fond", "surface", "champ", "texte", "texteDiscret", "bordure",
];
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const DISPLAY_MAX = 60;
const SHORT_MAX = 16;
const TITLE_MAX = 80;
const TEXT_MAX = 280;
const URL_MAX = 300;

/**
 * Contrat §4.3 — un pays jamais configuré s'ouvre prérempli de la palette Shephr standard (valeurs statiques des apps :
 * `mobile/theme/colors.ts` moss / white / earth / parchment / paper / paper2 / ink / ink2, `web` --line).
 */
const SHEPHR_COLORS: BrandingColors = {
  principale: "#1E3A2F",
  texteSurPrincipale: "#F2E9D2",
  accent: "#C9956B",
  texteSurAccent: "#16291F",
  fond: "#E8DCC4",
  surface: "#F5ECD8",
  champ: "#FBF5E6",
  texte: "#2A2620",
  texteDiscret: "#5C544A",
  bordure: "#D7C7A6",
};

interface FormState {
  active: boolean;
  displayName: string;
  shortName: string;
  colors: BrandingColors;
  frTitle: string;
  frText: string;
  enTitle: string;
  enText: string;
  websiteUrl: string;
}

const emptyForm = (): FormState => ({
  active: false, displayName: "", shortName: "", colors: { ...SHEPHR_COLORS },
  frTitle: "", frText: "", enTitle: "", enText: "", websiteUrl: "",
});

function fmtDateTime(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Couleurs utilisables pour le calcul et l'aperçu : un code en cours de saisie retombe sur la valeur Shephr. */
function usableColors(c: BrandingColors): BrandingColors {
  const out = { ...c };
  for (const r of ROLES) if (!HEX_RE.test(c[r])) out[r] = SHEPHR_COLORS[r];
  return out;
}

function fmtRatio(r: number, locale: string): string {
  return `${r.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}:1`;
}

/** §12 — chaque code serveur est traduit (`countryBranding.errors.*`), repli sur le message du serveur. */
function errMsg(t: TFunction, e: unknown, locale: string): string {
  const code = apiErrorCode(e);
  if (code === "BRANDING_CONTRAST_TOO_LOW") {
    const d = apiErrorDetails(e) ?? {};
    const fg = String(d.foreground ?? "");
    const bg = String(d.background ?? "");
    const ratio = typeof d.ratio === "number" ? fmtRatio(d.ratio, locale) : "—";
    return t("countryBranding.errors.BRANDING_CONTRAST_TOO_LOW", {
      pair: `${t(`countryBranding.roles.${fg}`, { defaultValue: fg })} / ${t(`countryBranding.roles.${bg}`, { defaultValue: bg })}`,
      ratio,
    });
  }
  if (e instanceof ApiRequestError && e.validationErrors && Object.keys(e.validationErrors).length > 0) {
    return t("countryBranding.errors.validation", {
      fields: Object.entries(e.validationErrors).map(([k, v]) => `${k} : ${v}`).join(" · "),
    });
  }
  if (code) {
    const key = `countryBranding.errors.${code}`;
    const tr = t(key);
    if (tr !== key) return tr;
  }
  return e instanceof Error ? e.message : t("common.error");
}

export default function PaysPage() {
  const { t, i18n } = useTranslation();
  const dateLocale = (i18n.resolvedLanguage || i18n.language) === "en" ? "en-GB" : "fr-FR";
  const [editing, setEditing] = useState<AdminCountryBrandingRow | null>(null);

  const listQ = useQuery({ queryKey: ["country-branding"], queryFn: listCountryBrandings });

  if (editing) {
    return <CountryBrandingEditor row={editing} onClose={() => setEditing(null)} />;
  }

  const rows = (listQ.data ?? []).map((r) => ({ ...r, _key: r.countryIso }));
  const cols = [
    {
      label: t("countryBranding.colCountry"),
      render: (r: AdminCountryBrandingRow) => (
        <span>
          <strong>{r.countryName}</strong> <code style={{ fontSize: 12, color: "var(--ink-500)" }}>{r.countryIso}</code>
        </span>
      ),
    },
    {
      label: t("countryBranding.colStatus"),
      render: (r: AdminCountryBrandingRow) =>
        !r.configured ? <Badge tone="gray">{t("countryBranding.status.none")}</Badge>
          : r.active ? <Badge tone="ok" dot>{t("countryBranding.status.active")}</Badge>
            : <Badge tone="earth">{t("countryBranding.status.draft")}</Badge>,
    },
    { label: t("countryBranding.colVersion"), render: (r: AdminCountryBrandingRow) => (r.version != null ? `v${r.version}` : "—") },
    {
      label: t("countryBranding.colUpdatedAt"),
      render: (r: AdminCountryBrandingRow) => (
        <span style={{ color: "var(--ink-500)" }}>
          {fmtDateTime(r.updatedAt, dateLocale)}
          {r.updatedByName && <span> · {r.updatedByName}</span>}
        </span>
      ),
    },
    {
      label: "",
      render: (r: AdminCountryBrandingRow) => (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button size="sm" variant={r.configured ? "ghost" : "secondary"} onClick={(e) => { e.stopPropagation(); setEditing(r); }}>
            {r.configured ? t("countryBranding.edit") : t("countryBranding.configure")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <TopBar title={t("countryBranding.title")} crumbs={[t("common.jexcellence"), t("nav.countries")]} />
      <div className="content">
        <p style={{ color: "var(--ink-600)", marginTop: 0, marginBottom: 16, maxWidth: 820 }}>{t("countryBranding.intro")}</p>
        <div className="card" style={{ padding: 0 }}>
          {listQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : listQ.isError ? (
            <div style={{ padding: 24, color: "var(--err)" }}>{errMsg(t, listQ.error, dateLocale)}</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("countryBranding.empty")}</div>
          ) : (
            <Table columns={cols} rows={rows} zebra onRowClick={(r: AdminCountryBrandingRow) => setEditing(r)} />
          )}
        </div>
      </div>
    </>
  );
}

function CountryBrandingEditor({ row, onClose }: { row: AdminCountryBrandingRow; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage || i18n.language) === "en" ? "en-GB" : "fr-FR";
  const qc = useQueryClient();
  const { push } = useToasts();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loaded, setLoaded] = useState(false);
  const [previewLang, setPreviewLang] = useState<"fr" | "en">("fr");

  // 404 BRANDING_NOT_FOUND = jamais configuré : formulaire vide prérempli de la palette Shephr (contrat §4.3).
  const q = useQuery({
    queryKey: ["country-branding", row.countryIso],
    queryFn: async () => {
      try {
        return await getCountryBranding(row.countryIso);
      } catch (e) {
        if (apiErrorCode(e) === "BRANDING_NOT_FOUND") return null;
        throw e;
      }
    },
    retry: false,
  });

  useEffect(() => {
    if (q.data === undefined || loaded) return;
    const b = q.data;
    setForm(b ? {
      active: b.active,
      displayName: b.displayName,
      shortName: b.shortName,
      colors: { ...SHEPHR_COLORS, ...b.colors },
      frTitle: b.welcome?.fr?.title ?? "",
      frText: b.welcome?.fr?.text ?? "",
      enTitle: b.welcome?.en?.title ?? "",
      enText: b.welcome?.en?.text ?? "",
      websiteUrl: b.websiteUrl ?? "",
    } : { ...emptyForm(), displayName: row.countryName.slice(0, DISPLAY_MAX), shortName: row.countryName.slice(0, SHORT_MAX) });
    setLoaded(true);
  }, [q.data, loaded, row.countryName]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setColor = (r: BrandingRole, v: string) => setForm((f) => ({ ...f, colors: { ...f.colors, [r]: v } }));

  const colorsValid = ROLES.every((r) => HEX_RE.test(form.colors[r]));
  const calc = usableColors(form.colors);
  const failure = colorsValid ? firstContrastFailure(calc) : null;

  const dn = form.displayName.trim();
  const sn = form.shortName.trim();
  const url = form.websiteUrl.trim();
  const enFilled = form.enTitle.trim() !== "" || form.enText.trim() !== "";
  const enComplete = form.enTitle.trim() !== "" && form.enText.trim() !== "";
  const urlValid = url === "" || (/^https:\/\/\S+$/i.test(url) && url.length <= URL_MAX);
  const problems = useMemo(() => {
    const p: string[] = [];
    if (dn.length < 1 || dn.length > DISPLAY_MAX) p.push(t("countryBranding.check.displayName", { max: DISPLAY_MAX }));
    if (sn.length < 1 || sn.length > SHORT_MAX) p.push(t("countryBranding.check.shortName", { max: SHORT_MAX }));
    if (!colorsValid) p.push(t("countryBranding.check.colors"));
    const ft = form.frTitle.trim(), fx = form.frText.trim();
    if (ft.length < 1 || ft.length > TITLE_MAX || fx.length < 1 || fx.length > TEXT_MAX) p.push(t("countryBranding.check.welcomeFr", { title: TITLE_MAX, text: TEXT_MAX }));
    if (enFilled && (!enComplete || form.enTitle.trim().length > TITLE_MAX || form.enText.trim().length > TEXT_MAX)) p.push(t("countryBranding.check.welcomeEn"));
    if (!urlValid) p.push(t("countryBranding.check.website", { max: URL_MAX }));
    // RG-PAYS-10 — une configuration ACTIVE doit passer toutes les paires ; inactive = brouillon accepté.
    if (form.active && failure) {
      p.push(t("countryBranding.check.contrast", {
        pair: `${t(`countryBranding.roles.${failure.foreground}`)} / ${t(`countryBranding.roles.${failure.background}`)}`,
        ratio: fmtRatio(failure.ratio, locale),
      }));
    }
    return p;
  }, [dn, sn, colorsValid, form, enFilled, enComplete, urlValid, failure, t, locale]);

  const saveM = useMutation({
    mutationFn: () => {
      const colors = {} as BrandingColors;
      for (const r of ROLES) colors[r] = form.colors[r].toUpperCase();
      const req: CountryBrandingRequest = {
        active: form.active,
        displayName: dn,
        shortName: sn,
        colors,
        welcome: {
          fr: { title: form.frTitle.trim(), text: form.frText.trim() },
          en: enComplete ? { title: form.enTitle.trim(), text: form.enText.trim() } : null,
        },
        websiteUrl: url || null,
      };
      return saveCountryBranding(row.countryIso, req);
    },
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["country-branding"] });
      push({ kind: "ok", title: t("countryBranding.savedToast", { name: row.countryName }), msg: t("countryBranding.savedMsg", { version: b.version }) });
      onClose();
    },
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e, locale) }),
  });

  const previewWelcome = previewLang === "en" && enComplete
    ? { title: form.enTitle, text: form.enText }
    : { title: form.frTitle, text: form.frText };

  return (
    <>
      <TopBar
        title={t("countryBranding.editorTitle", { name: row.countryName })}
        crumbs={[t("common.jexcellence"), t("nav.countries"), row.countryName]}
        actions={
          <>
            <Button variant="ghost" iconL={<Icons.ChevLeft size={14} />} onClick={onClose}>{t("countryBranding.back")}</Button>
            <Button variant="primary" disabled={!loaded || problems.length > 0 || saveM.isPending} onClick={() => saveM.mutate()}>
              {saveM.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      />
      <div className="content">
        {q.isLoading || (!loaded && !q.isError) ? (
          <div style={{ color: "var(--ink-500)" }}>{t("common.loading")}</div>
        ) : q.isError ? (
          <div style={{ color: "var(--err)" }}>{errMsg(t, q.error, locale)}</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 24, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
              {/* État */}
              <div className="card card-pad">
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <Toggle checked={form.active} onChange={(v) => set("active", v)} label={t("countryBranding.active")} />
                  {q.data ? (
                    <span style={{ color: "var(--ink-500)", fontSize: 12.5 }}>
                      {t("countryBranding.versionInfo", { version: q.data.version, date: fmtDateTime(q.data.updatedAt, locale) })}
                      {q.data.updatedByName && ` · ${q.data.updatedByName}`}
                    </span>
                  ) : (
                    <Badge tone="gray">{t("countryBranding.status.none")}</Badge>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 8 }}>
                  {form.active ? t("countryBranding.activeHint") : t("countryBranding.draftHint")}
                </div>
              </div>

              {/* Identité */}
              <div className="card card-pad">
                <h3 className="section-title" style={{ marginTop: 0 }}>{t("countryBranding.sectionIdentity")}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label={t("countryBranding.displayName")} hint={t("countryBranding.displayNameHint", { count: dn.length, max: DISPLAY_MAX })}>
                    <Input value={form.displayName} maxLength={DISPLAY_MAX} onChange={(e) => set("displayName", e.target.value)} />
                  </Field>
                  <Field label={t("countryBranding.shortName")} hint={t("countryBranding.shortNameHint", { count: sn.length, max: SHORT_MAX })}>
                    <Input value={form.shortName} maxLength={SHORT_MAX} onChange={(e) => set("shortName", e.target.value)} />
                  </Field>
                </div>
                <Field label={t("countryBranding.website")} hint={t("countryBranding.websiteHint")} style={{ marginTop: 12 }}>
                  <Input value={form.websiteUrl} maxLength={URL_MAX} placeholder="https://" onChange={(e) => set("websiteUrl", e.target.value)} />
                </Field>
                <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 8 }}>{t("countryBranding.logoHint", { iso: row.countryIso })}</div>
              </div>

              {/* Couleurs */}
              <div className="card card-pad">
                <h3 className="section-title" style={{ marginTop: 0 }}>{t("countryBranding.sectionColors")}</h3>
                <p className="section-sub">{t("countryBranding.colorsHint")}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                  {ROLES.map((r) => {
                    const v = form.colors[r];
                    const ok = HEX_RE.test(v);
                    return (
                      <Field key={r} label={t(`countryBranding.roles.${r}`)} hint={t(`countryBranding.roleHints.${r}`)}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="color"
                            aria-label={t(`countryBranding.roles.${r}`)}
                            value={ok ? v.toLowerCase() : SHEPHR_COLORS[r].toLowerCase()}
                            onChange={(e) => setColor(r, e.target.value.toUpperCase())}
                            style={{ width: 40, height: 34, padding: 0, border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "none", cursor: "pointer", flexShrink: 0 }}
                          />
                          <Input
                            value={v}
                            maxLength={7}
                            spellCheck={false}
                            style={{ fontFamily: "var(--font-mono)", borderColor: ok ? undefined : "var(--err)" }}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              setColor(r, raw.startsWith("#") ? raw : `#${raw}`);
                            }}
                            onBlur={() => { if (HEX_RE.test(v)) setColor(r, v.toUpperCase()); }}
                          />
                        </div>
                      </Field>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12 }}>
                  <Button size="sm" variant="ghost" onClick={() => set("colors", { ...SHEPHR_COLORS })}>{t("countryBranding.resetColors")}</Button>
                </div>
              </div>

              {/* Contraste — RG-PAYS-10 */}
              <div className="card card-pad">
                <h3 className="section-title" style={{ marginTop: 0 }}>{t("countryBranding.sectionContrast")}</h3>
                <p className="section-sub">{t("countryBranding.contrastHint", { min: MIN_CONTRAST.toLocaleString(locale) })}</p>
                {!colorsValid ? (
                  <div style={{ color: "var(--ink-500)", fontSize: 13 }}>{t("countryBranding.check.colors")}</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {CONTRAST_PAIRS.map(([fg, bg]) => {
                      const ratio = contrastRatio(calc[fg], calc[bg]);
                      const pass = ratio >= MIN_CONTRAST;
                      return (
                        <div key={`${fg}-${bg}`} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                          <span
                            aria-hidden
                            style={{
                              width: 44, height: 26, borderRadius: 6, background: calc[bg], color: calc[fg],
                              border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 600, fontSize: 13, flexShrink: 0,
                            }}
                          >
                            Aa
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            {t(`countryBranding.roles.${fg}`)} <span style={{ color: "var(--ink-400)" }}>/</span> {t(`countryBranding.roles.${bg}`)}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--ink-700)" }}>{fmtRatio(ratio, locale)}</span>
                          <Badge tone={pass ? "ok" : "err"}>{pass ? t("countryBranding.contrastOk") : t("countryBranding.contrastFail")}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
                {failure && !form.active && (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--warn)" }}>{t("countryBranding.contrastDraft")}</div>
                )}
              </div>

              {/* Texte d'accueil */}
              <div className="card card-pad">
                <h3 className="section-title" style={{ marginTop: 0 }}>{t("countryBranding.sectionWelcome")}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                  {(["fr", "en"] as const).map((lng) => {
                    const titleK = lng === "fr" ? "frTitle" : "enTitle";
                    const textK = lng === "fr" ? "frText" : "enText";
                    return (
                      <div key={lng} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {t(`countryBranding.welcome.${lng}`)}
                          <span style={{ color: "var(--ink-500)", fontWeight: 400 }}> — {t(lng === "fr" ? "countryBranding.welcome.required" : "countryBranding.welcome.optional")}</span>
                        </div>
                        <Field label={t("countryBranding.welcome.title")} hint={t("countryBranding.counter", { count: form[titleK].trim().length, max: TITLE_MAX })}>
                          <Input value={form[titleK]} maxLength={TITLE_MAX} onChange={(e) => set(titleK, e.target.value)} />
                        </Field>
                        <Field label={t("countryBranding.welcome.text")} hint={t("countryBranding.counter", { count: form[textK].trim().length, max: TEXT_MAX })}>
                          <textarea className="input" rows={4} maxLength={TEXT_MAX} value={form[textK]} onChange={(e) => set(textK, e.target.value)} />
                        </Field>
                      </div>
                    );
                  })}
                </div>
              </div>

              {problems.length > 0 && (
                <div className="card card-pad" style={{ borderColor: "var(--warn)" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, marginBottom: 6, color: "var(--warn)" }}>
                    <Icons.Warning size={16} /> {t("countryBranding.check.title")}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--ink-700)" }}>
                    {problems.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {/* Aperçu format téléphone */}
            <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{t("countryBranding.preview.title")}</span>
                <div className="tabs" style={{ marginBottom: 0, borderBottom: "none" }}>
                  {(["fr", "en"] as const).map((lng) => (
                    <button key={lng} type="button" className={`tab ${previewLang === lng ? "active" : ""}`} onClick={() => setPreviewLang(lng)}>
                      {lng.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <BrandingPreview
                colors={calc}
                displayName={form.displayName}
                shortName={form.shortName}
                welcome={previewWelcome}
                websiteUrl={form.websiteUrl}
              />
              {previewLang === "en" && !enComplete && (
                <div style={{ fontSize: 12, color: "var(--ink-500)", textAlign: "center" }}>{t("countryBranding.preview.enFallback")}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
