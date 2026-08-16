import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge, Field, Input, Pagination, Select, Table, TopBar } from "@/components/primitives";
import { getDashboard, listAuditLogs, type AuditLogResponse } from "@/services/auditService";
import {
  fetchMinistryStructure, listAssemblyChanges, listAssemblyHistory,
  type AssemblyChangeRow, type AssemblyCreationRow,
} from "@/services/orgService";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";

const ACTIONS = ["", "SUBSCRIPTION_CREATED", "SUBSCRIPTION_SUSPENDED", "MODULE_UPDATED"];

/** Palier C4 : 25 lignes par page, comme la liste des comptes — une page qui tient à l'écran. */
const HISTORY_PAGE_SIZE = 25;

/** Les deux journaux de structure : ce qui a été CRÉÉ, et qui a BOUGÉ. Mêmes filtres, même garde. */
type HistoryTab = "creations" | "changes";

function fmtDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 130, textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--ink-900)" }}>{value}</div>
      <div style={{ color: "var(--ink-500)", fontSize: 13 }}>{label}</div>
    </div>
  );
}

export default function AuditPage() {
  const { t, i18n } = useTranslation();
  const dateLocale = (i18n.resolvedLanguage || i18n.language) === "en" ? "en-GB" : "fr-FR";
  const [action, setAction] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  // Historiques de structure : filtres géographiques en cascade + pagination serveur, PARTAGÉS par
  // les deux onglets — le backend prend exactement les mêmes paramètres des deux côtés.
  const [tab, setTab] = useState<HistoryTab>("creations");
  const [histMinistryId, setHistMinistryId] = useState("");
  const [fCountry, setFCountry] = useState("");
  const [fZone, setFZone] = useState("");
  const [fCity, setFCity] = useState("");
  const [histPage, setHistPage] = useState(0);

  const actionLabel = (a: string) => i18n.exists(`audit.actions.${a}`) ? t(`audit.actions.${a}`) : a;

  const dashQ = useQuery({ queryKey: ["dashboard"], queryFn: getDashboard });
  const logsQ = useQuery({
    queryKey: ["audit-logs", action, actorEmail],
    queryFn: () => listAuditLogs({ action: action || undefined, actorEmail: actorEmail || undefined, limit: 200 }),
  });

  const cols = [
    { label: t("audit.colDate"), render: (r: AuditLogResponse) => <span style={{ color: "var(--ink-500)" }}>{fmtDateTime(r.createdAt, dateLocale)}</span> },
    { label: t("audit.colActor"), render: (r: AuditLogResponse) => <span>{r.actorEmail ?? "—"}</span> },
    { label: t("audit.colAction"), render: (r: AuditLogResponse) => <Badge tone="earth">{actionLabel(r.action)}</Badge> },
    { label: t("audit.colEntity"), render: (r: AuditLogResponse) => <span style={{ color: "var(--ink-600)" }}>{r.entityType ?? "—"}</span> },
    { label: t("audit.colDetail"), render: (r: AuditLogResponse) => <span style={{ color: "var(--ink-700)" }}>{r.summary ?? "—"}</span> },
  ];

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });

  // Les DTO d'historique ne portent que des NOMS de lieu (créations) ou des ids figés au moment du
  // déplacement (changements) : les sélecteurs doivent tirer leurs ids du référentiel de structure,
  // ouvert à tout membre du ministère depuis RG-BQ-12. Même clé de cache que la page Utilisateurs.
  const structureQ = useQuery({
    queryKey: ["ministry-structure", histMinistryId],
    queryFn: () => fetchMinistryStructure(histMinistryId),
  });
  const org = structureQ.data;

  // Un seul jeu de filtres pour les deux onglets. ⚠ Sur l'onglet « changements », ils portent sur
  // l'assemblée d'ARRIVÉE : « les changements de ma région » = les gens qui y sont arrivés.
  const histFilters = {
    ministryId: histMinistryId || undefined,
    countryId: fCountry || undefined,
    zoneId: fZone || undefined,
    localityId: fCity || undefined,
    size: HISTORY_PAGE_SIZE,
  };

  const creationsQ = useQuery({
    queryKey: ["assembly-history", histMinistryId, fCountry, fZone, fCity, histPage],
    queryFn: () => listAssemblyHistory({ ...histFilters, page: histPage }),
    enabled: tab === "creations",
    placeholderData: (prev) => prev, // pagination sans clignotement
  });

  const changesQ = useQuery({
    queryKey: ["assembly-changes", histMinistryId, fCountry, fZone, fCity, histPage],
    queryFn: () => listAssemblyChanges({ ...histFilters, page: histPage }),
    enabled: tab === "changes",
    placeholderData: (prev) => prev,
  });

  // Retour en première page dès qu'un critère ou l'onglet change : rester page 4 sur un résultat
  // d'une page afficherait une liste vide.
  useEffect(() => { setHistPage(0); }, [histMinistryId, fCountry, fZone, fCity, tab]);

  const creationCols = [
    { label: t("audit.colAssembly"), render: (r: AssemblyCreationRow) => <span style={{ fontWeight: 500 }}>{r.name}</span> },
    { label: t("audit.colCity"), render: (r: AssemblyCreationRow) => <span style={{ color: "var(--ink-600)" }}>{r.cityName ?? "—"}</span> },
    { label: t("audit.colRegion"), render: (r: AssemblyCreationRow) => <span style={{ color: "var(--ink-600)" }}>{r.regionName ?? "—"}</span> },
    { label: t("audit.colNation"), render: (r: AssemblyCreationRow) => <span style={{ color: "var(--ink-600)" }}>{r.nationName ?? "—"}</span> },
    {
      label: t("audit.colCreatedBy"),
      // createdByName null = assemblée créée avant la migration org/18 : l'auteur n'a pas été tracé.
      render: (r: AssemblyCreationRow) => (
        r.createdByName
          ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{r.createdByName}</span>
              {r.createdByRole && <Badge tone="earth">{t(`responsables.role.${r.createdByRole}`)}</Badge>}
            </div>
          )
          : <span style={{ color: "var(--ink-400)" }}>—</span>
      ),
    },
    { label: t("audit.colDate"), render: (r: AssemblyCreationRow) => <span style={{ color: "var(--ink-500)" }}>{fmtDate(r.createdAt, dateLocale)}</span> },
  ];

  const changeCols = [
    {
      label: t("audit.colPerson"),
      // userName null = compte supprimé depuis : la ligne d'historique, elle, survit.
      render: (r: AssemblyChangeRow) => (
        <span style={{ fontWeight: 500 }}>{r.userName ?? t("audit.deletedAccount")}</span>
      ),
    },
    {
      label: t("audit.colFrom"),
      // fromUnitName null = premier rattachement (la personne n'était nulle part).
      render: (r: AssemblyChangeRow) => (
        r.fromUnitName
          ? <span style={{ color: "var(--ink-600)" }}>{r.fromUnitName}</span>
          : <span style={{ color: "var(--ink-400)" }} title={t("audit.firstAttachmentHint")}>—</span>
      ),
    },
    { label: t("audit.colTo"), render: (r: AssemblyChangeRow) => <span style={{ color: "var(--ink-700)", fontWeight: 500 }}>{r.toUnitName ?? "—"}</span> },
    {
      label: t("audit.colPlace"),
      // Lieu de l'assemblée d'ARRIVÉE, figé au moment du déplacement.
      render: (r: AssemblyChangeRow) => (
        <span style={{ color: "var(--ink-500)" }}>
          {[r.cityName, r.regionName, r.nationName].filter(Boolean).join(" · ") || "—"}
        </span>
      ),
    },
    {
      label: t("audit.colChangedBy"),
      render: (r: AssemblyChangeRow) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{r.changedByName ?? "—"}</span>
          <Badge tone={r.source === "SELF" ? "gray" : "earth"}>{t(`audit.source.${r.source}`)}</Badge>
        </div>
      ),
    },
    { label: t("audit.colDate"), render: (r: AssemblyChangeRow) => <span style={{ color: "var(--ink-500)" }}>{fmtDateTime(r.changedAt, dateLocale)}</span> },
  ];

  const activeQ = tab === "creations" ? creationsQ : changesQ;
  const creationRows = (creationsQ.data?.content ?? []).map((r) => ({ ...r, _key: r.unitId }));
  const changeRows = (changesQ.data?.content ?? []).map((r) => ({ ...r, _key: r.id }));
  const histCount = tab === "creations" ? creationRows.length : changeRows.length;
  const histTotal = activeQ.data?.totalElements ?? 0;
  const histPageCount = activeQ.data?.totalPages ?? 0;

  const rows = logsQ.data ?? [];
  const d = dashQ.data;

  return (
    <>
      <TopBar title={t("audit.title")} crumbs={[t("common.jexcellence"), t("nav.audit")]} />
      <div className="content">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <Stat label={t("audit.statMinistries")} value={d?.ministries ?? 0} />
          <Stat label={t("audit.statUsers")} value={d?.users ?? 0} />
          <Stat label={t("audit.statModules")} value={d?.modules ?? 0} />
          <Stat label={t("audit.statActiveSubscriptions")} value={d?.activeSubscriptions ?? 0} />
          <Stat label={t("audit.statSuspendedSubscriptions")} value={d?.suspendedSubscriptions ?? 0} />
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line,#eee)", flexWrap: "wrap" }}>
            <span style={{ color: "var(--ink-600)" }}>{t("audit.sensitiveActions")}</span>
            <Select value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTIONS.map((a) => <option key={a} value={a}>{a ? actionLabel(a) : t("audit.allActions")}</option>)}
            </Select>
            <Input placeholder={t("audit.actorFilterPlaceholder")} value={actorEmail} onChange={(e) => setActorEmail(e.target.value)} />
          </div>
          {logsQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("audit.empty")}</div>
          ) : (
            <Table columns={cols} rows={rows.map((r) => ({ ...r, _key: r.id }))} zebra />
          )}
        </div>

        {/* Historiques de STRUCTURE, section distincte du journal d'audit : ce ne sont pas des
            actions sensibles de plateforme mais un suivi de terrain. Deux onglets, un seul jeu de
            filtres — les deux endpoints prennent exactement les mêmes paramètres. */}
        <div className="card" style={{ padding: 0, marginTop: 18 }}>
          {/* Pas de bordure basse ici : `.tabs` porte déjà la sienne (sinon double filet). */}
          <div style={{ padding: "12px 16px 0" }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>{t("audit.structureHistoryTitle")}</div>
            <div className="tabs" style={{ marginBottom: 0 }}>
              <button className={`tab ${tab === "creations" ? "active" : ""}`} onClick={() => setTab("creations")}>
                {t("audit.tabCreations")}
              </button>
              <button className={`tab ${tab === "changes" ? "active" : ""}`} onClick={() => setTab("changes")}>
                {t("audit.tabChanges")}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, padding: "12px 16px", flexWrap: "wrap", borderBottom: "1px solid var(--line,#eee)" }}>
            {/* Vide = TOUS les ministères ; le backend restreint de lui-même un acteur non SUPER_ADMIN
                (et refuse en 403 un ministère qui n'est pas le sien — ce n'est pas un repli). */}
            <Field label={t("subscriptions.level.MINISTRY")}>
              <Select value={histMinistryId} onChange={(e) => {
                setHistMinistryId(e.target.value); setFCountry(""); setFZone(""); setFCity("");
              }}>
                <option value="">{t("audit.allMinistries")}</option>
                {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
            <Field label={t("subscriptions.level.COUNTRY")}>
              <Select value={fCountry} onChange={(e) => { setFCountry(e.target.value); setFZone(""); setFCity(""); }}>
                <option value="">{t("audit.allNations")}</option>
                {(org?.countries ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={t("subscriptions.level.ZONE")}>
              <Select value={fZone} onChange={(e) => { setFZone(e.target.value); setFCity(""); }}>
                <option value="">{t("audit.allRegions")}</option>
                {(org?.zones ?? [])
                  .filter((z) => !fCountry || z.countryId === fCountry)
                  .map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </Select>
            </Field>
            <Field label={t("subscriptions.level.LOCALITY")}>
              <Select value={fCity} onChange={(e) => setFCity(e.target.value)}>
                <option value="">{t("audit.allCities")}</option>
                {(org?.localities ?? [])
                  .filter((l) => !fZone || l.zoneId === fZone)
                  .map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          </div>

          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line,#eee)", color: "var(--ink-400)", fontSize: 12.5 }}>
            {/* Deux pièges de lecture, écrits à l'écran plutôt que découverts. */}
            {tab === "creations" ? t("audit.creationsScopeHint") : t("audit.changesScopeHint")}
          </div>

          {activeQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : activeQ.isError ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>
              {activeQ.error instanceof Error ? activeQ.error.message : t("common.error")}
            </div>
          ) : histCount === 0 ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>
              {tab === "creations" ? t("audit.assemblyHistoryEmpty") : t("audit.assemblyChangesEmpty")}
            </div>
          ) : (
            <>
              {tab === "creations"
                ? <Table columns={creationCols} rows={creationRows} zebra />
                : <Table columns={changeCols} rows={changeRows} zebra />}
              <Pagination
                page={histPage + 1}
                pageCount={histPageCount}
                total={histTotal}
                perPage={HISTORY_PAGE_SIZE}
                onPage={(p) => setHistPage(p - 1)}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
