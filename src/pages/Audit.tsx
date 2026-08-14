import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge, Input, Pagination, Select, Table, TopBar } from "@/components/primitives";
import { getDashboard, listAuditLogs, type AuditLogResponse } from "@/services/auditService";
import { listAssemblyHistory, type AssemblyCreationRow } from "@/services/orgService";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";

const ACTIONS = ["", "SUBSCRIPTION_CREATED", "SUBSCRIPTION_SUSPENDED", "MODULE_UPDATED"];

/** Palier C4 : 25 lignes par page, comme la liste des comptes — une page qui tient à l'écran. */
const HISTORY_PAGE_SIZE = 25;

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
  // Historique des créations d'assemblées (palier C4) : filtre ministère + pagination serveur.
  const [histMinistryId, setHistMinistryId] = useState("");
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

  const historyQ = useQuery({
    queryKey: ["assembly-history", histMinistryId, histPage],
    queryFn: () => listAssemblyHistory({
      ministryId: histMinistryId || undefined,
      page: histPage,
      size: HISTORY_PAGE_SIZE,
    }),
    placeholderData: (prev) => prev, // pagination sans clignotement
  });

  // Retour en première page au changement de ministère : rester page 4 sur un résultat d'une page
  // afficherait une liste vide.
  useEffect(() => { setHistPage(0); }, [histMinistryId]);

  const histCols = [
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

  const histRows = (historyQ.data?.content ?? []).map((r) => ({ ...r, _key: r.unitId }));
  const histTotal = historyQ.data?.totalElements ?? 0;
  const histPageCount = historyQ.data?.totalPages ?? 0;

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

        {/* Palier C4 — historique des créations d'assemblées, section distincte du journal d'audit :
            ce ne sont pas des actions sensibles de plateforme mais un suivi de terrain. */}
        <div className="card" style={{ padding: 0, marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line,#eee)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{t("audit.assemblyHistoryTitle")}</span>
            {/* Vide = TOUS les ministères ; le backend restreint de lui-même un acteur non SUPER_ADMIN. */}
            <Select value={histMinistryId} onChange={(e) => setHistMinistryId(e.target.value)}>
              <option value="">{t("audit.allMinistries")}</option>
              {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>
          {historyQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : historyQ.isError ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>
              {historyQ.error instanceof Error ? historyQ.error.message : t("common.error")}
            </div>
          ) : histRows.length === 0 ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("audit.assemblyHistoryEmpty")}</div>
          ) : (
            <>
              <Table columns={histCols} rows={histRows} zebra />
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
