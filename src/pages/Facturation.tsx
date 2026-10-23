import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Drawer, Field, IconButton, Input, Modal, Pagination, Select, Table, TopBar } from "@/components/primitives";
import { RemoteUserCombobox } from "@/components/UserCombobox";
import { useToasts } from "@/context/ToastContext";
import { useDebounced } from "@/hooks/useDebounced";
import { apiErrorCode, saveBlob } from "@/services/api";
import { listMinistries } from "@/services/ministryService";
import {
  activateOffer,
  archiveOffer,
  cancelBillingSubscription,
  createOffer,
  createPromoCode,
  deletePromoCode,
  disablePromoCode,
  downloadInvoicePdf,
  enablePromoCode,
  exportInvoicesCsv,
  getBillingOverview,
  getBillingSubscription,
  listBillingSubscriptions,
  listInvoices,
  listOffers,
  listPromoCodes,
  listPromoCodeSubscriptions,
  patchBillingSubscription,
  resendInvoice,
  updateOffer,
  updatePromoCode,
  type AdminInvoice,
  type AdminOffer,
  type AdminPromoCode,
  type AdminSubscription,
  type AdminSubscriptionPatch,
  type BillingAddress,
  type BillingSubscriptionStatus,
  type OfferRequest,
  type PromoCodeStatus,
} from "@/services/billingService";

// D-ABO-15 (JP 23/10) — page « Facturation » du back-office : abonnements PAYANTS, factures,
// offres, codes promo, export. La page /abonnements garde son rôle (accès aux modules) :
// D-ABO-01, rien ici n'active ni ne coupe un module.

type Tab = "overview" | "subscriptions" | "invoices" | "offers" | "promo";
const PAGE_SIZE = 25;
const SUB_STATUSES: BillingSubscriptionStatus[] = ["PENDING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"];

// ---------- Formatage (§6.4 : montants formatés côté client, l'API ne renvoie que des centimes) ----------

function useLocale(): string {
  const { i18n } = useTranslation();
  return (i18n.resolvedLanguage || i18n.language) === "en" ? "en-GB" : "fr-FR";
}

function money(cents: number | null | undefined, currency: string, locale: string): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency || "EUR" }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function fmtDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** « 99,99 » / « 99.99 » → 9999 ; NaN si illisible. */
function parseCents(v: string): number {
  const n = Number(v.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** ISO (UTC) → valeur d'un `<input type="datetime-local">` dans le fuseau du navigateur. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatAddress(a: BillingAddress): string | null {
  if (!a) return null;
  if (typeof a === "string") return a.trim() || null;
  const parts = Object.values(a).filter((x): x is string => !!x && x.trim() !== "");
  return parts.length ? parts.join("\n") : null;
}

/** §9 — chaque code est traduit (`billing.errors.*`), repli sur le message du serveur. */
function errMsg(t: TFunction, e: unknown): string {
  const code = apiErrorCode(e);
  if (code) {
    const key = `billing.errors.${code}`;
    const tr = t(key);
    if (tr !== key) return tr;
  }
  return e instanceof Error ? e.message : t("common.error");
}

function subTone(s: BillingSubscriptionStatus): "ok" | "warn" | "gray" | "earth" {
  if (s === "ACTIVE") return "ok";
  if (s === "PAST_DUE") return "warn";
  if (s === "PENDING") return "earth";
  return "gray";
}

function promoTone(s: PromoCodeStatus): "ok" | "warn" | "gray" | "earth" {
  if (s === "ACTIVE") return "ok";
  if (s === "UPCOMING") return "earth";
  if (s === "EXHAUSTED") return "warn";
  return "gray";
}

function SubStatusBadge({ s }: { s: Pick<AdminSubscription, "status" | "cancelAtPeriodEnd" | "amountMismatch"> }) {
  const { t } = useTranslation();
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      <Badge tone={subTone(s.status)} dot>{t(`billing.status.${s.status}`)}</Badge>
      {s.cancelAtPeriodEnd && s.status !== "CANCELED" && <Badge tone="earth">{t("billing.subs.cancelAtPeriodEnd")}</Badge>}
      {s.amountMismatch && <Badge tone="err">{t("billing.alertKind.AMOUNT_MISMATCH")}</Badge>}
    </span>
  );
}

function useDownload() {
  const { t } = useTranslation();
  const { push } = useToasts();
  return async (fn: () => Promise<{ blob: Blob; filename: string }>) => {
    try {
      const { blob, filename } = await fn();
      saveBlob(blob, filename);
    } catch (e) {
      push({ kind: "error", title: t("billing.downloadFailed"), msg: errMsg(t, e) });
    }
  };
}

// =====================================================================================

export default function FacturationPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("overview");
  // Une alerte de la vue d'ensemble ouvre l'onglet Abonnements filtré sur sa référence.
  const [subSeed, setSubSeed] = useState<{ search: string; n: number }>({ search: "", n: 0 });

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: t("billing.tabs.overview") },
    { id: "subscriptions", label: t("billing.tabs.subscriptions") },
    { id: "invoices", label: t("billing.tabs.invoices") },
    { id: "offers", label: t("billing.tabs.offers") },
    { id: "promo", label: t("billing.tabs.promo") },
  ];

  return (
    <>
      <TopBar title={t("billing.title")} crumbs={[t("common.jexcellence"), t("billing.title")]} />
      <div className="content">
        <p className="section-sub" style={{ marginTop: 0 }}>{t("billing.intro")}</p>
        <div className="tabs">
          {tabs.map((x) => (
            <button key={x.id} className={`tab ${tab === x.id ? "active" : ""}`} onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        {tab === "overview" && (
          <OverviewTab onOpenReference={(ref) => { setSubSeed((s) => ({ search: ref, n: s.n + 1 })); setTab("subscriptions"); }} />
        )}
        {tab === "subscriptions" && <SubscriptionsTab key={subSeed.n} initialSearch={subSeed.search} />}
        {tab === "invoices" && <InvoicesTab />}
        {tab === "offers" && <OffersTab />}
        {tab === "promo" && <PromoTab />}
      </div>
    </>
  );
}

// ---------- Vue d'ensemble ----------

function OverviewTab({ onOpenReference }: { onOpenReference: (ref: string) => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const q = useQuery({ queryKey: ["billing", "overview"], queryFn: getBillingOverview });

  if (q.isLoading) return <div style={{ color: "var(--ink-500)" }}>{t("common.loading")}</div>;
  if (q.isError || !q.data) return <div style={{ color: "var(--ink-500)" }}>{errMsg(t, q.error)}</div>;
  const o = q.data;

  const kpis = [
    { lbl: t("billing.overview.active"), val: String(o.activeCount) },
    { lbl: t("billing.overview.pastDue"), val: String(o.pastDueCount) },
    { lbl: t("billing.overview.mrr"), val: money(o.mrrCents, o.currency, locale) },
    { lbl: t("billing.overview.collected"), val: money(o.collectedThisMonthCents, o.currency, locale) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div key={k.lbl} className="kpi">
            <span className="deco" />
            <div className="lbl">{k.lbl}</div>
            <div className="val">{k.val}</div>
          </div>
        ))}
      </div>
      <div style={{ color: "var(--ink-500)", fontSize: 13.5 }}>
        {t("billing.overview.canceledThisMonth", { count: o.canceledThisMonth })}
      </div>
      <div className="card">
        <h3 style={{ margin: "0 0 10px" }}>{t("billing.overview.alerts")}</h3>
        {o.alerts.length === 0 ? (
          <p style={{ color: "var(--ink-500)", margin: 0 }}>{t("billing.overview.noAlerts")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {o.alerts.map((a, i) => (
              <div key={`${a.reference}-${a.kind}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Badge tone={a.kind === "PAST_DUE" ? "warn" : "err"}>{t(`billing.alertKind.${a.kind}`)}</Badge>
                <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{a.reference}</span>
                <Button variant="ghost" size="sm" onClick={() => onOpenReference(a.reference)}>{t("billing.overview.open")}</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Abonnements ----------

function SubscriptionsTab({ initialSearch }: { initialSearch: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [status, setStatus] = useState<BillingSubscriptionStatus | "">("");
  const [ministryId, setMinistryId] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const debounced = useDebounced(search);

  useEffect(() => { setPage(1); }, [status, ministryId, debounced]);

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const listQ = useQuery({
    queryKey: ["billing", "subscriptions", status, ministryId, debounced, page],
    queryFn: () => listBillingSubscriptions({ status, ministryId, search: debounced, page: page - 1, size: PAGE_SIZE }),
  });

  const rows = (listQ.data?.content ?? []).map((s) => ({ ...s, _key: s.id }));
  const total = listQ.data?.totalElements ?? 0;
  const pageCount = listQ.data?.totalPages ?? 0;

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: "flex", gap: 12, padding: "12px 16px", flexWrap: "wrap", borderBottom: "1px solid var(--line,#eee)" }}>
        <Field label={t("billing.subs.search")}>
          <Input icon={<Icons.Search size={14} />} placeholder={t("billing.subs.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Field label={t("billing.subs.status")}>
          <Select value={status} onChange={(e) => setStatus(e.target.value as BillingSubscriptionStatus | "")}>
            <option value="">{t("billing.all")}</option>
            {SUB_STATUSES.map((s) => <option key={s} value={s}>{t(`billing.status.${s}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("billing.subs.ministry")}>
          <Select value={ministryId} onChange={(e) => setMinistryId(e.target.value)}>
            <option value="">{t("billing.allMinistries")}</option>
            {(ministriesQ.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
      </div>
      {listQ.isLoading ? (
        <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
      ) : listQ.isError ? (
        <div style={{ padding: 24, color: "var(--ink-500)" }}>{errMsg(t, listQ.error)}</div>
      ) : (
        <>
          <Table
            rows={rows}
            onRowClick={(s: AdminSubscription) => setOpenId(s.id)}
            columns={[
              { label: t("billing.subs.reference"), render: (s: AdminSubscription) => <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{s.reference}</span> },
              {
                label: t("billing.subs.payer"),
                render: (s: AdminSubscription) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>{s.payerName ?? "—"}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{s.payerEmail ?? ""}</div>
                  </div>
                ),
              },
              { label: t("billing.subs.ministry"), render: (s: AdminSubscription) => s.ministryName ?? <span style={{ color: "var(--ink-400)" }}>{t("billing.subs.noMinistry")}</span> },
              { label: t("billing.subs.offer"), render: (s: AdminSubscription) => s.offerName },
              {
                label: t("billing.subs.price"),
                render: (s: AdminSubscription) => (
                  <span>
                    {money(s.priceCents, s.currency, locale)} {t(`billing.per.${s.billingPeriod}`)}
                    {s.promoCode && <> <Badge tone="earth">{s.promoCode}{s.discountPercent != null ? ` −${s.discountPercent} %` : ""}</Badge></>}
                  </span>
                ),
              },
              { label: t("billing.subs.status"), render: (s: AdminSubscription) => <SubStatusBadge s={s} /> },
              { label: t("billing.subs.nextDue"), render: (s: AdminSubscription) => fmtDate(s.currentPeriodEnd, locale) },
            ]}
          />
          {pageCount > 1 && <Pagination page={page} pageCount={pageCount} total={total} perPage={PAGE_SIZE} onPage={setPage} />}
        </>
      )}
      {openId && <SubscriptionDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function SubscriptionDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { push } = useToasts();
  const download = useDownload();

  const q = useQuery({ queryKey: ["billing", "subscription", id], queryFn: () => getBillingSubscription(id) });
  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const s = q.data;

  const [ministryId, setMinistryId] = useState("");
  const [payerId, setPayerId] = useState("");
  const [notes, setNotes] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  // Formulaire réaligné à chaque relecture (après une écriture ou à l'ouverture).
  useEffect(() => {
    if (!s) return;
    setMinistryId(s.ministryId ?? "");
    setPayerId(s.payerUserId);
    setNotes(s.notes ?? "");
  }, [s]);

  const patchM = useMutation({
    mutationFn: (p: AdminSubscriptionPatch) => patchBillingSubscription(id, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      push({ kind: "ok", title: t("billing.subs.savedToast"), msg: "" });
    },
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const cancelM = useMutation({
    mutationFn: (immediately: boolean) => cancelBillingSubscription(id, immediately),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      setCancelOpen(false);
      // RG-ABO-08 — le statut final arrive par l'événement Stripe, pas par cette réponse.
      push({ kind: "ok", title: t("billing.subs.cancelRequestedToast"), msg: t("billing.subs.cancelRequestedHint") });
    },
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const resendM = useMutation({
    mutationFn: (number: string) => resendInvoice(number),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["billing"] }); push({ kind: "ok", title: t("billing.invoices.resentToast"), msg: "" }); },
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const address = s ? formatAddress(s.billingAddress) : null;
  // Même règle que le serveur (contrat §12, ABO2) : CANCELED, EXPIRED ou sans abonnement Stripe (PENDING)
  // → 422 BILLING_SUBSCRIPTION_NOT_ACTIVE ; on ne propose donc pas « Résilier » dans ces cas.
  const canCancel = !!s && s.status !== "CANCELED" && s.status !== "EXPIRED" && !!s.stripeSubscriptionId;

  const info: [string, ReactNode][] = s ? [
    [t("billing.subs.offer"), s.offerName],
    [t("billing.subs.listPrice"), `${money(s.listPriceCents, s.currency, locale)} ${t(`billing.per.${s.billingPeriod}`)}`],
    [t("billing.subs.discount"), s.promoCode ? `${s.promoCode}${s.discountPercent != null ? ` (−${s.discountPercent} %)` : ""}` : "—"],
    [t("billing.subs.price"), `${money(s.priceCents, s.currency, locale)} ${t(`billing.per.${s.billingPeriod}`)}`],
    [t("billing.subs.createdAt"), fmtDateTime(s.createdAt, locale)],
    [t("billing.subs.activatedAt"), fmtDateTime(s.activatedAt, locale)],
    [t("billing.subs.nextDue"), fmtDate(s.currentPeriodEnd, locale)],
    [t("billing.subs.canceledAt"), fmtDateTime(s.canceledAt, locale)],
    [t("billing.subs.payer"), `${s.payerName ?? "—"}${s.payerEmail ? ` · ${s.payerEmail}` : ""}`],
    [t("billing.subs.billingAddress"), address ? <span style={{ whiteSpace: "pre-line" }}>{address}</span> : "—"],
    [t("billing.subs.stripeCustomer"), <code key="c">{s.stripeCustomerId ?? "—"}</code>],
    [t("billing.subs.stripeSubscription"), <code key="s">{s.stripeSubscriptionId ?? "—"}</code>],
  ] : [];

  return (
    <>
      <Drawer open onClose={onClose} title={s?.reference ?? t("common.loading")} sub={s ? s.offerName : undefined}>
        {q.isLoading ? (
          <div style={{ color: "var(--ink-500)" }}>{t("common.loading")}</div>
        ) : q.isError || !s ? (
          <div style={{ color: "var(--ink-500)" }}>{errMsg(t, q.error)}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <SubStatusBadge s={s} />

            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 13.5 }}>
              {info.map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <span style={{ color: "var(--ink-500)" }}>{k}</span>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{v}</span>
                </div>
              ))}
            </div>

            {/* D-ABO-05 — ministère lié, modifiable ; « aucun » = délier (ministryId: null explicite). */}
            <div>
              <h4 style={{ margin: "0 0 8px" }}>{t("billing.subs.ministry")}</h4>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <Select value={ministryId} onChange={(e) => setMinistryId(e.target.value)}>
                  <option value="">{t("billing.subs.noMinistry")}</option>
                  {(ministriesQ.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
                <Button size="sm" variant="primary" disabled={patchM.isPending || ministryId === (s.ministryId ?? "")}
                  onClick={() => patchM.mutate({ ministryId: ministryId || null })}>
                  {t("common.save")}
                </Button>
              </div>
              {/* D-ABO-15 — lien vers la couverture de modules du ministère, pour que JP décide (D-ABO-01). */}
              {s.ministryId && (
                <Button size="sm" variant="ghost" style={{ marginTop: 8 }} iconR={<Icons.ArrowRight size={14} />}
                  onClick={() => navigate(`/abonnements?ministryId=${encodeURIComponent(s.ministryId!)}`)}>
                  {t("billing.subs.moduleAccessLink")}
                </Button>
              )}
            </div>

            {/* D-ABO-07 — le SUPER_ADMIN peut changer le payeur. */}
            <div>
              <h4 style={{ margin: "0 0 8px" }}>{t("billing.subs.changePayer")}</h4>
              <RemoteUserCombobox
                label={t("billing.subs.payer")}
                value={payerId}
                selected={s.payerUserId === payerId ? { id: s.payerUserId, fullName: s.payerName ?? "—", username: "", email: s.payerEmail ?? "" } : undefined}
                onChange={(v) => setPayerId(v)}
                t={t}
              />
              <Button size="sm" variant="primary" disabled={patchM.isPending || !payerId || payerId === s.payerUserId}
                onClick={() => patchM.mutate({ payerUserId: payerId })}>
                {t("billing.subs.savePayer")}
              </Button>
            </div>

            <div>
              <h4 style={{ margin: "0 0 8px" }}>{t("billing.subs.notes")}</h4>
              <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <Button size="sm" variant="primary" style={{ marginTop: 8 }} disabled={patchM.isPending || notes === (s.notes ?? "")}
                onClick={() => patchM.mutate({ notes: notes.trim() ? notes : null })}>
                {t("common.save")}
              </Button>
            </div>

            <div>
              <h4 style={{ margin: "0 0 8px" }}>{t("billing.subs.invoices")}</h4>
              {s.invoices.length === 0 ? (
                <p style={{ color: "var(--ink-500)", margin: 0 }}>{t("billing.subs.noInvoices")}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {s.invoices.map((inv) => (
                    <div key={inv.number} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{inv.number}</span>
                      <span style={{ color: "var(--ink-500)" }}>{fmtDate(inv.issuedAt, locale)}</span>
                      <span>{money(inv.totalCents, inv.currency, locale)}</span>
                      {!inv.emailedAt && <Badge tone="warn">{t("billing.invoices.notEmailed")}</Badge>}
                      <span style={{ flex: 1 }} />
                      <IconButton icon={<Icons.Download size={15} />} title={t("billing.invoices.pdf")} onClick={() => download(() => downloadInvoicePdf(inv.number))} />
                      <IconButton icon={<Icons.Mail size={15} />} title={t("billing.invoices.resend")} disabled={resendM.isPending} onClick={() => resendM.mutate(inv.number)} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canCancel && (
              <Button variant="danger" onClick={() => setCancelOpen(true)}>{t("billing.subs.cancel")}</Button>
            )}
          </div>
        )}
      </Drawer>

      {/* D-ABO-11 — le SUPER_ADMIN résilie à la fin de la période payée ou immédiatement. */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t("billing.subs.cancelTitle")}
        sub={s?.reference}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>{t("common.close")}</Button>
            <Button variant="secondary" disabled={cancelM.isPending} onClick={() => cancelM.mutate(false)}>{t("billing.subs.cancelAtEnd")}</Button>
            <Button variant="danger" disabled={cancelM.isPending} onClick={() => cancelM.mutate(true)}>{t("billing.subs.cancelNow")}</Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{t("billing.subs.cancelBody", { date: fmtDate(s?.currentPeriodEnd, locale) })}</p>
      </Modal>
    </>
  );
}

// ---------- Factures ----------

function InvoicesTab() {
  const { t } = useTranslation();
  const locale = useLocale();
  const qc = useQueryClient();
  const { push } = useToasts();
  const download = useDownload();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  useEffect(() => { setPage(1); }, [from, to, debounced]);

  const listQ = useQuery({
    queryKey: ["billing", "invoices", from, to, debounced, page],
    queryFn: () => listInvoices({ from, to, search: debounced, page: page - 1, size: PAGE_SIZE }),
  });

  const resendM = useMutation({
    mutationFn: (number: string) => resendInvoice(number),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["billing"] }); push({ kind: "ok", title: t("billing.invoices.resentToast"), msg: "" }); },
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const rows = (listQ.data?.content ?? []).map((i) => ({ ...i, _key: i.number }));
  const total = listQ.data?.totalElements ?? 0;
  const pageCount = listQ.data?.totalPages ?? 0;

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: "flex", gap: 12, padding: "12px 16px", flexWrap: "wrap", alignItems: "flex-end", borderBottom: "1px solid var(--line,#eee)" }}>
        <Field label={t("billing.invoices.from")}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t("billing.invoices.to")}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label={t("billing.subs.search")}>
          <Input icon={<Icons.Search size={14} />} placeholder={t("billing.invoices.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <div style={{ marginLeft: "auto", paddingBottom: 6 }}>
          <Button variant="primary" size="sm" iconL={<Icons.Export size={15} />}
            onClick={() => download(() => exportInvoicesCsv(from || undefined, to || undefined))}>
            {t("billing.invoices.exportCsv")}
          </Button>
        </div>
      </div>
      <div style={{ padding: "8px 16px", fontSize: 12.5, color: "var(--ink-400)", borderBottom: "1px solid var(--line,#eee)" }}>
        {t("billing.invoices.periodHint")}
      </div>
      {listQ.isLoading ? (
        <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
      ) : listQ.isError ? (
        <div style={{ padding: 24, color: "var(--ink-500)" }}>{errMsg(t, listQ.error)}</div>
      ) : (
        <>
          <Table
            rows={rows}
            columns={[
              { label: t("billing.invoices.number"), render: (i: AdminInvoice) => <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{i.number}</span> },
              { label: t("billing.invoices.date"), render: (i: AdminInvoice) => fmtDate(i.issuedAt, locale) },
              {
                label: t("billing.invoices.client"),
                render: (i: AdminInvoice) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>{i.payerName ?? "—"}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{i.payerEmail ?? ""}</div>
                  </div>
                ),
              },
              { label: t("billing.subs.ministry"), render: (i: AdminInvoice) => i.ministryName ?? "—" },
              {
                label: t("billing.subs.offer"),
                render: (i: AdminInvoice) => (
                  <div>
                    <div>{i.offerName}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-500)", fontFamily: "var(--font-mono, monospace)" }}>{i.subscriptionReference}</div>
                  </div>
                ),
              },
              {
                label: t("billing.invoices.discount"),
                render: (i: AdminInvoice) => i.promoCode ? `${i.promoCode} · −${money(i.discountCents, i.currency, locale)}` : "—",
              },
              {
                label: t("billing.invoices.amounts"),
                render: (i: AdminInvoice) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>{money(i.totalCents, i.currency, locale)} {t("billing.ttc")}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
                      {t("billing.invoices.netVat", { net: money(i.netCents, i.currency, locale), vat: money(i.vatCents, i.currency, locale), rate: i.vatRate })}
                    </div>
                    {i.refundedCents > 0 && <Badge tone="warn">{t("billing.invoices.refunded", { amount: money(i.refundedCents, i.currency, locale) })}</Badge>}
                  </div>
                ),
              },
              {
                label: t("billing.invoices.emailed"),
                render: (i: AdminInvoice) => i.emailedAt
                  ? <span style={{ fontSize: 12.5 }}>{fmtDateTime(i.emailedAt, locale)}</span>
                  : <Badge tone="warn">{t("billing.invoices.notEmailed")}</Badge>,
              },
              {
                label: "",
                render: (i: AdminInvoice) => (
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <Button size="sm" variant="ghost" iconL={<Icons.Download size={14} />} onClick={() => download(() => downloadInvoicePdf(i.number))}>
                      {t("billing.invoices.pdf")}
                    </Button>
                    <Button size="sm" variant="ghost" iconL={<Icons.Mail size={14} />} disabled={resendM.isPending} onClick={() => resendM.mutate(i.number)}>
                      {t("billing.invoices.resend")}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
          {pageCount > 1 && <Pagination page={page} pageCount={pageCount} total={total} perPage={PAGE_SIZE} onPage={setPage} />}
        </>
      )}
    </div>
  );
}

// ---------- Offres ----------

interface OfferForm {
  code: string; name: string; nameEn: string; description: string; descriptionEn: string;
  price: string; vatRate: string; displayOrder: string; active: boolean;
}
const OFFER_EMPTY: OfferForm = { code: "", name: "", nameEn: "", description: "", descriptionEn: "", price: "", vatRate: "20", displayOrder: "0", active: true };
const OFFER_CODE_RE = /^[a-z0-9-]{3,40}$/; // RG-ABO-01

function OffersTab() {
  const { t } = useTranslation();
  const locale = useLocale();
  const qc = useQueryClient();
  const { push } = useToasts();
  const q = useQuery({ queryKey: ["billing", "offers"], queryFn: listOffers });
  const [editing, setEditing] = useState<AdminOffer | "new" | null>(null);
  const [form, setForm] = useState<OfferForm>(OFFER_EMPTY);

  const open = (o: AdminOffer | "new") => {
    setEditing(o);
    setForm(o === "new" ? OFFER_EMPTY : {
      code: o.code, name: o.name, nameEn: o.nameEn ?? "", description: o.description ?? "", descriptionEn: o.descriptionEn ?? "",
      price: (o.priceCents / 100).toFixed(2), vatRate: String(o.vatRate), displayOrder: String(o.displayOrder), active: o.active,
    });
  };

  const priceCents = parseCents(form.price);
  const vatRate = Number(form.vatRate.replace(",", "."));
  const valid = OFFER_CODE_RE.test(form.code) && form.name.trim() !== "" && priceCents > 0 && Number.isFinite(vatRate) && vatRate >= 0;

  const saveM = useMutation({
    mutationFn: () => {
      // D-ABO-03 — V1 : EUR et MONTHLY seuls (le serveur refuse le reste).
      const req: OfferRequest = {
        code: form.code, name: form.name.trim(), nameEn: form.nameEn.trim() || null,
        description: form.description.trim() || null, descriptionEn: form.descriptionEn.trim() || null,
        priceCents, currency: "EUR", billingPeriod: "MONTHLY", vatRate,
        active: form.active, displayOrder: Number(form.displayOrder) || 0,
      };
      return editing === "new" ? createOffer(req) : updateOffer((editing as AdminOffer).id, req);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["billing"] }); setEditing(null); push({ kind: "ok", title: t("billing.offers.savedToast"), msg: "" }); },
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const toggleM = useMutation({
    mutationFn: (o: AdminOffer) => (o.active ? archiveOffer(o.id) : activateOffer(o.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing"] }),
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const rows = (q.data ?? []).map((o) => ({ ...o, _key: o.id }));

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line,#eee)" }}>
        <span style={{ color: "var(--ink-500)", fontSize: 13.5 }}>{t("billing.offers.hint")}</span>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="primary" size="sm" iconL={<Icons.Plus size={15} />} onClick={() => open("new")}>{t("billing.offers.create")}</Button>
        </div>
      </div>
      {q.isLoading ? (
        <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
      ) : q.isError ? (
        <div style={{ padding: 24, color: "var(--ink-500)" }}>{errMsg(t, q.error)}</div>
      ) : (
        <Table
          rows={rows}
          columns={[
            { label: t("billing.offers.order"), render: (o: AdminOffer) => o.displayOrder },
            { label: t("billing.offers.code"), render: (o: AdminOffer) => <code>{o.code}</code> },
            {
              label: t("billing.offers.name"),
              render: (o: AdminOffer) => (
                <div>
                  <div style={{ fontWeight: 500 }}>{o.name}</div>
                  {o.nameEn && <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{o.nameEn}</div>}
                </div>
              ),
            },
            { label: t("billing.subs.price"), render: (o: AdminOffer) => `${money(o.priceCents, o.currency, locale)} ${t("billing.ttc")} ${t(`billing.per.${o.billingPeriod}`)}` },
            { label: t("billing.offers.vat"), render: (o: AdminOffer) => `${o.vatRate} %` },
            { label: t("billing.offers.subscriptions"), render: (o: AdminOffer) => o.subscriptionCount },
            { label: t("billing.subs.status"), render: (o: AdminOffer) => <Badge tone={o.active ? "ok" : "gray"} dot>{o.active ? t("billing.offers.active") : t("billing.offers.archived")}</Badge> },
            {
              label: "",
              render: (o: AdminOffer) => (
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <Button size="sm" variant="ghost" onClick={() => open(o)}>{t("common.update")}</Button>
                  <Button size="sm" variant={o.active ? "ghost" : "primary"} disabled={toggleM.isPending} onClick={() => toggleM.mutate(o)}>
                    {o.active ? t("billing.offers.archive") : t("billing.offers.activate")}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing === "new" ? t("billing.offers.create") : t("billing.offers.edit")}
        sub={t("billing.offers.priceFrozenHint")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
            <Button variant="primary" disabled={!valid || saveM.isPending} onClick={() => saveM.mutate()}>
              {saveM.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={t("billing.offers.code")} hint={editing === "new" ? t("billing.offers.codeHint") : t("billing.offers.codeImmutable")}>
            <Input value={form.code} disabled={editing !== "new"} maxLength={40}
              onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("billing.offers.nameFr")}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t("billing.offers.nameEn")}><Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("billing.offers.descriptionFr")}>
              <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label={t("billing.offers.descriptionEn")}>
              <textarea className="input" rows={3} value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <Field label={t("billing.offers.priceTtc")} hint={Number.isFinite(priceCents) && priceCents > 0 ? money(priceCents, "EUR", locale) : undefined}>
              <Input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </Field>
            <Field label={t("billing.offers.vat")}><Input inputMode="decimal" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} /></Field>
            <Field label={t("billing.offers.currencyPeriod")} hint={t("billing.offers.v1Hint")}>
              <Input value={`EUR · ${t("billing.period.MONTHLY")}`} disabled />
            </Field>
            <Field label={t("billing.offers.order")}><Input type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} /></Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------- Codes promo ----------

interface PromoForm { code: string; percentOff: string; startsAt: string; endsAt: string; maxRedemptions: string; label: string }
const PROMO_EMPTY: PromoForm = { code: "", percentOff: "", startsAt: "", endsAt: "", maxRedemptions: "", label: "" };
const PROMO_CODE_RE = /^[A-Z0-9-]{4,32}$/; // RG-ABO-03

function PromoTab() {
  const { t } = useTranslation();
  const locale = useLocale();
  const qc = useQueryClient();
  const { push } = useToasts();
  const q = useQuery({ queryKey: ["billing", "promo-codes"], queryFn: listPromoCodes });
  const [editing, setEditing] = useState<AdminPromoCode | "new" | null>(null);
  const [form, setForm] = useState<PromoForm>(PROMO_EMPTY);
  const [subsOf, setSubsOf] = useState<AdminPromoCode | null>(null);
  const [toDelete, setToDelete] = useState<AdminPromoCode | null>(null);

  const open = (p: AdminPromoCode | "new") => {
    setEditing(p);
    setForm(p === "new" ? PROMO_EMPTY : {
      code: p.code, percentOff: String(p.percentOff), startsAt: toLocalInput(p.startsAt), endsAt: toLocalInput(p.endsAt),
      maxRedemptions: p.maxRedemptions != null ? String(p.maxRedemptions) : "", label: p.label ?? "",
    });
  };

  const percent = Number(form.percentOff);
  const max = form.maxRedemptions.trim() === "" ? null : Number(form.maxRedemptions);
  const valid = PROMO_CODE_RE.test(form.code) && Number.isInteger(percent) && percent >= 1 && percent <= 90
    && (max === null || (Number.isInteger(max) && max > 0))
    // Même contrôle que le serveur (400 PROMO_CODE_INVALID_PERIOD, contrat §12) : fin strictement après le début.
    && !(form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt));

  const saveM = useMutation({
    mutationFn: () => {
      const req = {
        code: form.code, percentOff: percent,
        startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt),
        maxRedemptions: max, label: form.label.trim() || null,
      };
      return editing === "new" ? createPromoCode(req) : updatePromoCode((editing as AdminPromoCode).id, req);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["billing"] }); setEditing(null); push({ kind: "ok", title: t("billing.promo.savedToast"), msg: "" }); },
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const toggleM = useMutation({
    mutationFn: (p: AdminPromoCode) => (p.active ? disablePromoCode(p.id) : enablePromoCode(p.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing"] }),
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const deleteM = useMutation({
    mutationFn: (p: AdminPromoCode) => deletePromoCode(p.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["billing"] }); setToDelete(null); push({ kind: "ok", title: t("billing.promo.deletedToast"), msg: "" }); },
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const rows = (q.data ?? []).map((p) => ({ ...p, _key: p.id }));

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line,#eee)" }}>
        <span style={{ color: "var(--ink-500)", fontSize: 13.5 }}>{t("billing.promo.hint")}</span>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="primary" size="sm" iconL={<Icons.Plus size={15} />} onClick={() => open("new")}>{t("billing.promo.create")}</Button>
        </div>
      </div>
      {q.isLoading ? (
        <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
      ) : q.isError ? (
        <div style={{ padding: 24, color: "var(--ink-500)" }}>{errMsg(t, q.error)}</div>
      ) : (
        <Table
          rows={rows}
          columns={[
            { label: t("billing.promo.code"), render: (p: AdminPromoCode) => <code>{p.code}</code> },
            { label: t("billing.promo.label"), render: (p: AdminPromoCode) => p.label ?? "—" },
            { label: t("billing.promo.percentOff"), render: (p: AdminPromoCode) => `−${p.percentOff} %` },
            {
              label: t("billing.promo.validity"),
              render: (p: AdminPromoCode) => `${p.startsAt ? fmtDate(p.startsAt, locale) : "…"} → ${p.endsAt ? fmtDate(p.endsAt, locale) : "∞"}`,
            },
            { label: t("billing.promo.uses"), render: (p: AdminPromoCode) => `${p.redemptionCount} / ${p.maxRedemptions ?? "∞"}` },
            { label: t("billing.subs.status"), render: (p: AdminPromoCode) => <Badge tone={promoTone(p.status)} dot>{t(`billing.promoStatus.${p.status}`)}</Badge> },
            {
              label: "",
              render: (p: AdminPromoCode) => (
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <Button size="sm" variant="ghost" onClick={() => setSubsOf(p)}>{t("billing.promo.subscriptions")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => open(p)}>{t("common.update")}</Button>
                  <Button size="sm" variant="ghost" disabled={toggleM.isPending} onClick={() => toggleM.mutate(p)}>
                    {p.active ? t("billing.promo.disable") : t("billing.promo.enable")}
                  </Button>
                  <IconButton danger icon={<Icons.Trash size={15} />} title={t("billing.promo.delete")} onClick={() => setToDelete(p)} />
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? t("billing.promo.create") : t("billing.promo.edit")}
        sub={t("billing.promo.formHint")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
            <Button variant="primary" disabled={!valid || saveM.isPending} onClick={() => saveM.mutate()}>
              {saveM.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("billing.promo.code")} hint={editing === "new" ? t("billing.promo.codeHint") : t("billing.offers.codeImmutable")}>
              <Input value={form.code} disabled={editing !== "new"} maxLength={32}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label={t("billing.promo.percentOff")} hint={t("billing.promo.percentHint")}>
              <Input type="number" min={1} max={90} value={form.percentOff} onChange={(e) => setForm({ ...form, percentOff: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("billing.promo.startsAt")} hint={t("billing.promo.startsHint")}>
              <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </Field>
            <Field label={t("billing.promo.endsAt")} hint={t("billing.promo.endsHint")}>
              <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
            <Field label={t("billing.promo.maxRedemptions")} hint={t("billing.promo.maxHint")}>
              <Input type="number" min={1} value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} />
            </Field>
            <Field label={t("billing.promo.label")} hint={t("billing.promo.labelHint")}>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={t("billing.promo.deleteTitle")}
        sub={toDelete?.code}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>{t("common.cancel")}</Button>
            <Button variant="danger" disabled={deleteM.isPending} onClick={() => toDelete && deleteM.mutate(toDelete)}>{t("billing.promo.delete")}</Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{t("billing.promo.deleteBody")}</p>
      </Modal>

      {subsOf && <PromoSubscriptionsModal promo={subsOf} onClose={() => setSubsOf(null)} />}
    </div>
  );
}

function PromoSubscriptionsModal({ promo, onClose }: { promo: AdminPromoCode; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const q = useQuery({ queryKey: ["billing", "promo-subs", promo.id], queryFn: () => listPromoCodeSubscriptions(promo.id) });
  const rows = useMemo(() => (q.data ?? []).map((s) => ({ ...s, _key: s.id })), [q.data]);
  return (
    <Modal open onClose={onClose} size="lg" title={t("billing.promo.subscriptionsTitle", { code: promo.code })}
      footer={<Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>}>
      {q.isLoading ? (
        <div style={{ color: "var(--ink-500)" }}>{t("common.loading")}</div>
      ) : q.isError ? (
        <div style={{ color: "var(--ink-500)" }}>{errMsg(t, q.error)}</div>
      ) : (
        <Table
          rows={rows}
          columns={[
            { label: t("billing.subs.reference"), render: (s: AdminSubscription) => <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{s.reference}</span> },
            { label: t("billing.subs.payer"), render: (s: AdminSubscription) => `${s.payerName ?? "—"}${s.payerEmail ? ` · ${s.payerEmail}` : ""}` },
            { label: t("billing.subs.ministry"), render: (s: AdminSubscription) => s.ministryName ?? "—" },
            { label: t("billing.subs.price"), render: (s: AdminSubscription) => money(s.priceCents, s.currency, locale) },
            { label: t("billing.subs.status"), render: (s: AdminSubscription) => <SubStatusBadge s={s} /> },
          ]}
        />
      )}
    </Modal>
  );
}
