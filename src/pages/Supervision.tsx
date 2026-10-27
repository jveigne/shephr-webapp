import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge, Field, Input, Pagination, Select, Table, TopBar } from "@/components/primitives";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";
import {
  listSupervisionLeaders, listSupervisionRequests, SUPERVISION_STATUSES,
  type AdminSupervisionLeaderRow, type AdminSupervisionRequestRow, type SupervisionRequestStatus,
} from "@/services/supervisionService";
import { useDebounced } from "@/hooks/useDebounced";

// D-HIE-08 (JP 28/10, lot HIE) — back-office « Supervision » : historique des demandes de supervision
// descendantes (créée, validée, refusée, annulée, retirée, remplacée) et vue « Dirigeants » pour repérer qui
// pourrait avoir besoin de l'offre Caleb (`HIERARCHIE_SUIVI`). LECTURE SEULE (RG-HIE-34) : aucun bouton
// d'action. Contrat §7.3 du plan docs/shephr/28_10_2026/01_Plan_Hierarchie_3_Pages.md.
// ⚠ Axe CHAÎNE (`supervisor_id`), jamais la géographie (D-ABO-31).

const PAGE_SIZE = 25;

type Tab = "history" | "leaders";
type CalebFilter = "" | "yes" | "no";

const STATUS_TONE: Record<SupervisionRequestStatus, "green" | "earth" | "gray" | "ok" | "warn" | "err"> = {
  PENDING: "warn",
  ACCEPTED: "ok",
  REFUSED: "err",
  CANCELED: "gray",
  REVOKED: "earth",
  REPLACED: "gray",
};

function fmtDateTime(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Person({ name, email, fallback }: { name: string | null; email: string | null; fallback: string }) {
  return (
    <div>
      <div style={{ fontWeight: 500 }}>{name || fallback}</div>
      {email && <div style={{ color: "var(--ink-500)", fontSize: 12 }}>{email}</div>}
    </div>
  );
}

export default function SupervisionPage() {
  const { t, i18n } = useTranslation();
  const dateLocale = (i18n.resolvedLanguage || i18n.language) === "en" ? "en-GB" : "fr-FR";
  const [tab, setTab] = useState<Tab>("history");

  // Filtres partagés par les deux onglets : ministère et recherche.
  const [ministryId, setMinistryId] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  // Historique seul.
  const [status, setStatus] = useState<"" | SupervisionRequestStatus>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  // Dirigeants seul.
  const [caleb, setCaleb] = useState<CalebFilter>("");

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });

  const requestsQ = useQuery({
    queryKey: ["supervision-requests", ministryId, status, debouncedSearch, from, to, page],
    queryFn: () => listSupervisionRequests({
      ministryId: ministryId || undefined,
      status: status || undefined,
      search: debouncedSearch || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      size: PAGE_SIZE,
    }),
    enabled: tab === "history",
    placeholderData: (prev) => prev,
  });

  const leadersQ = useQuery({
    queryKey: ["supervision-leaders", ministryId, debouncedSearch, caleb],
    queryFn: () => listSupervisionLeaders({
      ministryId: ministryId || undefined,
      search: debouncedSearch || undefined,
      hasHierarchySuivi: caleb === "" ? undefined : caleb === "yes",
    }),
    enabled: tab === "leaders",
  });

  // Retour en première page dès qu'un critère change.
  useEffect(() => { setPage(0); }, [ministryId, status, debouncedSearch, from, to]);

  const unknown = t("supervision.deletedAccount");

  const historyCols = [
    { label: t("supervision.colCreatedAt"), render: (r: AdminSupervisionRequestRow) => <span style={{ color: "var(--ink-500)" }}>{fmtDateTime(r.createdAt, dateLocale)}</span> },
    { label: t("supervision.colRequester"), render: (r: AdminSupervisionRequestRow) => <Person name={r.requesterName} email={r.requesterEmail} fallback={unknown} /> },
    { label: t("supervision.colDesignee"), render: (r: AdminSupervisionRequestRow) => <Person name={r.designeeName} email={r.designeeEmail} fallback={unknown} /> },
    { label: t("supervision.colMinistry"), render: (r: AdminSupervisionRequestRow) => <span style={{ color: "var(--ink-600)" }}>{r.ministryName ?? "—"}</span> },
    { label: t("supervision.colStatus"), render: (r: AdminSupervisionRequestRow) => <Badge tone={STATUS_TONE[r.status]}>{t(`supervision.status.${r.status}`)}</Badge> },
    {
      label: t("supervision.colPreviousSupervisor"),
      // D-HIE-03 — valider REMPLACE le superviseur du désigné : on garde la trace de celui qui a été écarté.
      render: (r: AdminSupervisionRequestRow) => <span style={{ color: "var(--ink-600)" }}>{r.previousSupervisorName ?? "—"}</span>,
    },
    { label: t("supervision.colDecidedAt"), render: (r: AdminSupervisionRequestRow) => <span style={{ color: "var(--ink-500)" }}>{fmtDateTime(r.decidedAt, dateLocale)}</span> },
    { label: t("supervision.colClosedAt"), render: (r: AdminSupervisionRequestRow) => <span style={{ color: "var(--ink-500)" }}>{fmtDateTime(r.closedAt, dateLocale)}</span> },
    { label: t("supervision.colEndedBy"), render: (r: AdminSupervisionRequestRow) => <span style={{ color: "var(--ink-600)" }}>{r.endedByName ?? "—"}</span> },
  ];

  const leaderCols = [
    { label: t("supervision.colLeader"), render: (r: AdminSupervisionLeaderRow) => <Person name={r.fullName} email={r.email} fallback={unknown} /> },
    { label: t("supervision.colMinistry"), render: (r: AdminSupervisionLeaderRow) => <span style={{ color: "var(--ink-600)" }}>{r.ministryName ?? "—"}</span> },
    { label: t("supervision.colFollowed"), render: (r: AdminSupervisionLeaderRow) => <span style={{ fontWeight: 600 }}>{r.followedCount}</span> },
    { label: t("supervision.colAccepted"), render: (r: AdminSupervisionLeaderRow) => <span>{r.acceptedCount}</span> },
    { label: t("supervision.colPending"), render: (r: AdminSupervisionLeaderRow) => <span>{r.pendingCount}</span> },
    { label: t("supervision.colRefused"), render: (r: AdminSupervisionLeaderRow) => <span>{r.refusedCount}</span> },
    {
      label: t("supervision.colCaleb"),
      // Droit personnel calculé par le serveur (D-ABO-36), jamais déduit ici.
      render: (r: AdminSupervisionLeaderRow) => (
        <Badge tone={r.hasHierarchySuivi ? "ok" : "gray"}>{r.hasHierarchySuivi ? t("supervision.calebYes") : t("supervision.calebNo")}</Badge>
      ),
    },
  ];

  const activeQ = tab === "history" ? requestsQ : leadersQ;
  const historyRows = (requestsQ.data?.content ?? []).map((r) => ({ ...r, _key: r.id }));
  const leaderRows = (leadersQ.data ?? []).map((r) => ({ ...r, _key: r.userId }));
  const count = tab === "history" ? historyRows.length : leaderRows.length;

  return (
    <>
      <TopBar title={t("supervision.title")} crumbs={[t("common.jexcellence"), t("nav.supervision")]} />
      <div className="content">
        <p style={{ color: "var(--ink-600)", marginTop: 0, marginBottom: 16, maxWidth: 820 }}>{t("supervision.intro")}</p>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "12px 16px 0" }}>
            <div className="tabs" style={{ marginBottom: 0 }}>
              <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
                {t("supervision.tabHistory")}
              </button>
              <button className={`tab ${tab === "leaders" ? "active" : ""}`} onClick={() => setTab("leaders")}>
                {t("supervision.tabLeaders")}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, padding: "12px 16px", flexWrap: "wrap", borderBottom: "1px solid var(--line,#eee)" }}>
            <Field label={t("supervision.filterMinistry")}>
              <Select value={ministryId} onChange={(e) => setMinistryId(e.target.value)}>
                <option value="">{t("supervision.allMinistries")}</option>
                {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
            <Field label={t("supervision.filterSearch")}>
              <Input
                placeholder={tab === "history" ? t("supervision.searchHistoryPlaceholder") : t("supervision.searchLeadersPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
            {tab === "history" ? (
              <>
                <Field label={t("supervision.filterStatus")}>
                  <Select value={status} onChange={(e) => setStatus(e.target.value as "" | SupervisionRequestStatus)}>
                    <option value="">{t("supervision.allStatuses")}</option>
                    {SUPERVISION_STATUSES.map((s) => <option key={s} value={s}>{t(`supervision.status.${s}`)}</option>)}
                  </Select>
                </Field>
                <Field label={t("supervision.filterFrom")}>
                  <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                </Field>
                <Field label={t("supervision.filterTo")}>
                  <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
                </Field>
              </>
            ) : (
              <Field label={t("supervision.filterCaleb")}>
                <Select value={caleb} onChange={(e) => setCaleb(e.target.value as CalebFilter)}>
                  <option value="">{t("supervision.calebAll")}</option>
                  <option value="yes">{t("supervision.calebYes")}</option>
                  <option value="no">{t("supervision.calebNo")}</option>
                </Select>
              </Field>
            )}
          </div>

          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line,#eee)", color: "var(--ink-400)", fontSize: 12.5 }}>
            {tab === "history" ? t("supervision.historyHint") : t("supervision.leadersHint")}
          </div>

          {activeQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : activeQ.isError ? (
            <div style={{ padding: 24, color: "var(--err)" }}>
              {activeQ.error instanceof Error ? activeQ.error.message : t("common.error")}
            </div>
          ) : count === 0 ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>
              {tab === "history" ? t("supervision.historyEmpty") : t("supervision.leadersEmpty")}
            </div>
          ) : tab === "history" ? (
            <>
              <Table columns={historyCols} rows={historyRows} zebra />
              <Pagination
                page={page + 1}
                pageCount={requestsQ.data?.totalPages ?? 0}
                total={requestsQ.data?.totalElements ?? 0}
                perPage={PAGE_SIZE}
                onPage={(p) => setPage(p - 1)}
              />
            </>
          ) : (
            <>
              <Table columns={leaderCols} rows={leaderRows} zebra />
              {/* Le serveur plafonne à 500 lignes : on le dit plutôt que de laisser croire à une liste complète. */}
              {leaderRows.length >= 500 && (
                <div style={{ padding: "10px 16px", color: "var(--ink-500)", fontSize: 12.5 }}>{t("supervision.leadersCapped")}</div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
