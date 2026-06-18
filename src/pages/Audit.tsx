import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge, Input, Select, Table, TopBar } from "@/components/primitives";
import { getDashboard, listAuditLogs, type AuditLogResponse } from "@/services/auditService";

const ACTIONS = ["", "SUBSCRIPTION_CREATED", "SUBSCRIPTION_SUSPENDED", "MODULE_UPDATED"];

function fmtDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
      </div>
    </>
  );
}
