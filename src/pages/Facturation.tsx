import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Checkbox, Drawer, Field, IconButton, Input, Modal, Pagination, Select, Table, TopBar } from "@/components/primitives";
import { RemoteUserCombobox } from "@/components/UserCombobox";
import { useToasts } from "@/context/ToastContext";
import { useDebounced } from "@/hooks/useDebounced";
import { apiErrorCode, saveBlob } from "@/services/api";
import { listMinistries } from "@/services/ministryService";
import { listLocalities, listModules } from "@/services/subscriptionService";
import {
  activateOffer,
  archiveOffer,
  cancelBillingSubscription,
  createManualSubscription,
  createOffer,
  createPromoCode,
  createVoucherBatch,
  EXPIRING_WINDOWS,
  deletePromoCode,
  disablePromoCode,
  downloadInvoicePdf,
  enablePromoCode,
  exportInvoicesCsv,
  exportVoucherCodesCsv,
  formatVoucherCode,
  getBillingOverview,
  getBillingSubscription,
  listBillingSubscriptions,
  listExpiringSubscriptions,
  listInvoices,
  listOffers,
  listPromoCodes,
  listPromoCodeSubscriptions,
  listVoucherBatches,
  listVoucherCodes,
  patchBillingSubscription,
  resendInvoice,
  revokeVoucher,
  updateOffer,
  updatePromoCode,
  BILLING_CURRENCIES,
  type AdminInvoice,
  type AdminExpiringSubscription,
  type AdminOffer,
  type AdminPlanCount,
  type AdminPromoCode,
  type AdminSubscription,
  type AdminSubscriptionPatch,
  type BillingAddress,
  type BillingCurrency,
  type BillingPeriod,
  type BillingSource,
  type BillingSubscriptionStatus,
  type ExpiringWindow,
  type ManualSubscriptionRequest,
  type OfferRequest,
  type PlanScope,
  type PromoCodeStatus,
  type VoucherBatch,
  type VoucherCode,
  type VoucherStatus,
} from "@/services/billingService";
import type { AdminUserResponse, ModuleRole } from "@/services/userService";

// D-ABO-15 (JP 23/10) — page « Facturation » du back-office : abonnements PAYANTS, factures,
// offres, codes promo, export. La page /abonnements garde son rôle (accès aux modules) :
// D-ABO-01, rien ici n'active ni ne coupe un module.
// D-ABO-16..20 (JP 27/10, lot pro-plan PP-O1) — EXCEPTION : les offres à PLAN (`planCode`, ex.
// EGLISE_VILLE) ouvrent leurs codes de droit à une VILLE tant que l'abonnement ouvre droit (`entitled`,
// calculé par le serveur). Activation manuelle d'une ville (source MANUEL, RG-ABO-29), prolongation,
// fin ; la couverture /abonnements (sub_subscription) n'est ni lue ni écrite ici (D-ABO-17).
// D-ABO-31.. (JP 27/10, « Suivi de ma hiérarchie ») — un plan a une PORTÉE : Ville (`LOCALITY`) ou
// Dirigeant (`USER`, personnelle : le bénéficiaire est le payeur, axe CHAÎNE de leadership). Choisie à la
// création de l'offre, immuable ; l'activation manuelle d'un plan USER désigne un dirigeant, pas une ville.
// D-OFF-08 (JP 27/10, lot « Offres Caleb / Néhémie ») — onglet « Vouchers » : lots de codes liés à un ministère,
// pour une offre à formule (Caleb ou Néhémie), d'une durée en jours fixée ici ; un code saisi sur le web crée ou
// prolonge un abonnement `source = VOUCHER` (droits d'un MANUEL, aucune facture). Champ « prix local »
// (`localPriceLabel`, information seulement) dans le formulaire des offres.
// D-OFF-10.. / §3.8 (JP 27/10) — libellés commerciaux « Offre Caleb » (DIRIGEANT_HIERARCHIE) et « Offre Néhémie »
// (EGLISE_VILLE) : le nom vient du serveur (`bil_offer.name`), le sous-titre de `billing.planNames.*`.
// D-BER-04 (JP 29/10, lot BER) — onglet « Expirent bientôt » : plans (Caleb ET Néhémie) dont la fin programmée
// (fin manuelle MANUEL / VOUCHER, fin de période Stripe résilié, fin de grâce PAST_DUE) tombe dans 7 / 30 / 60 jours
// (défaut 30), calculée et triée par le SERVEUR (`GET /admin/billing/subscriptions/expiring`, Europe/Paris) ;
// « Prolonger » MANUEL / VOUCHER = PATCH `manualEndDate` existant. L'activation manuelle d'un Caleb individuel
// (`userId` + date de fin, RG-BER-36) reste dans l'onglet Abonnements.

type Tab = "overview" | "subscriptions" | "expiring" | "invoices" | "offers" | "promo" | "vouchers";
const PAGE_SIZE = 25;
const SUB_STATUSES: BillingSubscriptionStatus[] = ["PENDING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"];
const SOURCES: BillingSource[] = ["STRIPE", "MANUEL", "VOUCHER"];
/** D-OFF-08 (JP 27/10) — quantité maximale d'un lot de vouchers. */
const VOUCHER_MAX_QUANTITY = 500;
/** = `BillingVoucherBatch.MAX_DURATION_DAYS` (CHECK duration_days BETWEEN 1 AND 3660). */
const VOUCHER_MAX_DURATION_DAYS = 3660;
const VOUCHER_STATUSES: VoucherStatus[] = ["ACTIVE", "USED", "REVOKED"];
/** D-ABO-20 / RG-ABO-31 (JP 27/10) — délai de grâce d'un plan en PAST_DUE, depuis `pastDueSince`. */
const GRACE_DAYS = 14;
/** §6 — filtre `planCode=NONE` = offres sans plan. */
const PLAN_NONE = "NONE";
const PLAN_SCOPES: PlanScope[] = ["LOCALITY", "USER"];
/**
 * D-ABO-31 (JP 27/10) — portée d'une offre ; un plan sans `planScope` (serveur antérieur à la portée) est une
 * ville, seule portée d'alors.
 */
function offerScope(o: Pick<AdminOffer, "planCode" | "planScope">): PlanScope | null {
  if (!o.planCode) return null;
  return o.planScope ?? "LOCALITY";
}
/**
 * §3.8 (JP 27/10) — sous-titre commercial d'un plan connu (« Le suivi de ma hiérarchie » / « Le suivi de toute ma
 * ville ») ; null pour un autre code (le code technique reste affiché à côté).
 */
function planSubtitle(t: TFunction, planCode: string | null | undefined): string | null {
  if (!planCode) return null;
  const key = `billing.planNames.${planCode}`;
  const tr = t(key);
  return tr === key ? null : tr;
}
/** D-ABO-31 — portée d'un abonnement : bénéficiaire personnel → USER, sinon la portée de son offre. */
function subScope(s: Pick<AdminSubscription, "planCode" | "beneficiaryUserId" | "localityId">, offers: AdminOffer[]): PlanScope | null {
  if (!s.planCode) return null;
  if (s.beneficiaryUserId) return "USER";
  if (s.localityId) return "LOCALITY";
  const o = offers.find((x) => x.planCode === s.planCode);
  return o ? offerScope(o) : "LOCALITY";
}
/**
 * D-ABO-31 (JP 27/10) — seul un DIRIGEANT (rang manager ≥ DIRIGEANT_UNITE, rôle Objectifs ou Dons) peut
 * porter un plan USER ; LEADER / SECRETARIAT / superAdmin non (même règle que `canSubscribePersonal`).
 * Filtre d'AFFICHAGE du sélecteur : le serveur reste juge (403 / 422).
 */
const MANAGER_ROLES: ModuleRole[] = ["DIRIGEANT_UNITE", "DIRIGEANT", "DIRIGEANT_SENIOR", "DIRIGEANT_COORDINATEUR"];
function isManagerAccount(u: AdminUserResponse): boolean {
  if (u.superAdmin) return false;
  return (!!u.goalRole && MANAGER_ROLES.includes(u.goalRole)) || (!!u.donationRole && MANAGER_ROLES.includes(u.donationRole));
}

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

/**
 * `LocalDate` (`YYYY-MM-DD`, ex. `manualEndDate`) → date affichée, SANS passer par l'UTC
 * (un `new Date("2027-01-31")` reculerait d'un jour à l'ouest de Greenwich).
 */
function fmtDay(ymd: string | null | undefined, locale: string): string {
  if (!ymd) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return "—";
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

/** §1 — « aujourd'hui » au fuseau métier Europe/Paris, en `YYYY-MM-DD` (borne basse d'une date de fin manuelle). */
function todayParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * R-BER-09 (29_10_2026/01 §12.5) — borne basse de « Prolonger » : le lendemain de la fin actuelle (prolonger ne
 * raccourcit jamais), et aujourd'hui au plus tôt (une fin passée — EXPIRED / CANCELED à réactiver — part d'aujourd'hui).
 * Calcul sur la date civile `YYYY-MM-DD`, sans fuseau.
 */
function minExtendDate(currentEnd: string | null | undefined, today: string): string {
  if (!currentEnd || !/^\d{4}-\d{2}-\d{2}$/.test(currentEnd)) return today;
  const [y, m, d] = currentEnd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return next > today ? next : today;
}

/**
 * D-OFF-08 (JP 27/10) — un VOUCHER suit les règles d'un MANUEL (droit jusqu'à `manualEndDate` incluse, ni Stripe
 * ni facture) : « hors Stripe » = MANUEL ou VOUCHER.
 */
function isOffStripe(source: BillingSource): boolean {
  return source === "MANUEL" || source === "VOUCHER";
}

/** Échéance affichée : `manualEndDate` pour un MANUEL / VOUCHER, sinon `currentPeriodEnd`. */
function dueLabel(s: Pick<AdminSubscription, "source" | "manualEndDate" | "currentPeriodEnd">, locale: string): string {
  return isOffStripe(s.source) ? fmtDay(s.manualEndDate, locale) : fmtDate(s.currentPeriodEnd, locale);
}

/** D-ABO-20 — fin de la grâce d'un plan impayé (`pastDueSince` + 14 j), pour information. */
function graceEnd(pastDueSince: string | null): string | null {
  if (!pastDueSince) return null;
  const d = new Date(pastDueSince);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + GRACE_DAYS);
  return d.toISOString();
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

/** D-ABO-20 — « Droit ouvert » n'a de sens que pour un plan (une offre sans plan n'ouvre jamais rien). */
function EntitledBadge({ s }: { s: Pick<AdminSubscription, "planCode" | "entitled"> }) {
  const { t } = useTranslation();
  if (!s.planCode) return <span style={{ color: "var(--ink-400)" }}>—</span>;
  return <Badge tone={s.entitled ? "ok" : "gray"} dot>{s.entitled ? t("billing.subs.entitledYes") : t("billing.subs.entitledNo")}</Badge>;
}

function ScopeBadge({ scope }: { scope: PlanScope | null }) {
  const { t } = useTranslation();
  if (!scope) return <span style={{ color: "var(--ink-400)" }}>—</span>;
  return <Badge tone={scope === "USER" ? "earth" : "green"}>{t(`billing.scope.${scope}`)}</Badge>;
}

function SourceBadge({ source }: { source: BillingSource }) {
  const { t } = useTranslation();
  return <Badge tone={source === "MANUEL" ? "earth" : source === "VOUCHER" ? "green" : "gray"}>{t(`billing.source.${source}`)}</Badge>;
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
    // D-BER-04 (JP 29/10) — après « Abonnements ».
    { id: "expiring", label: t("billing.expiring.tab") },
    { id: "invoices", label: t("billing.tabs.invoices") },
    { id: "offers", label: t("billing.tabs.offers") },
    { id: "promo", label: t("billing.tabs.promo") },
    { id: "vouchers", label: t("billing.tabs.vouchers") },
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
        {tab === "expiring" && <ExpiringTab />}
        {tab === "invoices" && <InvoicesTab />}
        {tab === "offers" && <OffersTab />}
        {tab === "promo" && <PromoTab />}
        {tab === "vouchers" && <VouchersTab />}
      </div>
    </>
  );
}

// ---------- Vue d'ensemble ----------

function OverviewTab({ onOpenReference }: { onOpenReference: (ref: string) => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const q = useQuery({ queryKey: ["billing", "overview"], queryFn: getBillingOverview });
  const offersQ = useQuery({ queryKey: ["billing", "offers"], queryFn: listOffers });
  const planName = (code: string) => (offersQ.data ?? []).find((o) => o.planCode === code)?.name ?? code;
  const planOffer = (code: string) => (offersQ.data ?? []).find((o) => o.planCode === code);

  if (q.isLoading) return <div style={{ color: "var(--ink-500)" }}>{t("common.loading")}</div>;
  if (q.isError || !q.data) return <div style={{ color: "var(--ink-500)" }}>{errMsg(t, q.error)}</div>;
  const o = q.data;

  // RG-CUR-17 (D-CUR-06, JP 28/10) — MRR et encaissé : UNE tuile par devise (`totals`, EUR d'abord), jamais de
  // somme ni de conversion entre devises. Serveur antérieur au lot (sans `totals`) : la ligne historique (EUR).
  const totals = o.totals && o.totals.length > 0
    ? o.totals
    : [{ currency: (o.currency || "EUR") as BillingCurrency, mrrCents: o.mrrCents, collectedThisMonthCents: o.collectedThisMonthCents }];
  const multi = totals.length > 1;
  const kpis = [
    { lbl: t("billing.overview.active"), val: String(o.activeCount) },
    { lbl: t("billing.overview.pastDue"), val: String(o.pastDueCount) },
    ...totals.map((c) => ({
      lbl: multi ? t("billing.overview.mrrIn", { currency: c.currency }) : t("billing.overview.mrr"),
      val: money(c.mrrCents, c.currency, locale),
    })),
    ...totals.map((c) => ({
      lbl: multi ? t("billing.overview.collectedIn", { currency: c.currency }) : t("billing.overview.collected"),
      val: money(c.collectedThisMonthCents, c.currency, locale),
    })),
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
      {/* Revue PP-O1 (27/10) — la tuile dit ce qu'elle compte. D-MKT-03, JP 28/10 : texte aligné sur le serveur
          (`monthlyRecurringCents`) — ACTIVE / PAST_DUE prélevés seulement (ni MANUEL ni VOUCHER), ANNUAL ÷ 12
          (Caleb annuel compris). */}
      <div style={{ color: "var(--ink-500)", fontSize: 12.5 }}>{t("billing.overview.mrrHint")}</div>
      {multi && <div style={{ color: "var(--ink-500)", fontSize: 12.5 }}>{t("billing.overview.perCurrencyHint")}</div>}
      <div style={{ color: "var(--ink-500)", fontSize: 13.5 }}>
        {t("billing.overview.canceledThisMonth", { count: o.canceledThisMonth })}
      </div>
      {/* D-ABO-20 (JP 27/10) — villes dont l'abonnement de plan ouvre droit maintenant, par source. */}
      <div className="card">
        <h3 style={{ margin: "0 0 4px" }}>{t("billing.overview.plansTitle")}</h3>
        <p className="section-sub" style={{ marginTop: 0 }}>{t("billing.overview.plansHint")}</p>
        {(o.plans ?? []).length === 0 ? (
          <p style={{ color: "var(--ink-500)", margin: 0 }}>{t("billing.overview.noPlans")}</p>
        ) : (
          <Table
            rows={(o.plans ?? []).map((p) => ({ ...p, _key: p.planCode }))}
            columns={[
              {
                label: t("billing.subs.plan"),
                render: (p: AdminPlanCount) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>{planName(p.planCode)}</div>
                    {planSubtitle(t, p.planCode) && <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{planSubtitle(t, p.planCode)}</div>}
                    <code style={{ fontSize: 12 }}>{p.planCode}</code>
                  </div>
                ),
              },
              { label: t("billing.scope.label"), render: (p: AdminPlanCount) => { const of = planOffer(p.planCode); return <ScopeBadge scope={of ? offerScope(of) : null} />; } },
              { label: t("billing.overview.citiesStripe"), render: (p: AdminPlanCount) => p.stripeEntitled },
              { label: t("billing.overview.citiesManual"), render: (p: AdminPlanCount) => p.manualEntitled },
              // D-OFF-08 (JP 27/10) — abonnements ouverts par un code voucher, comptés à part par le serveur.
              { label: t("billing.overview.citiesVoucher"), render: (p: AdminPlanCount) => p.voucherEntitled ?? 0 },
              { label: t("billing.overview.citiesTotal"), render: (p: AdminPlanCount) => <strong>{p.stripeEntitled + p.manualEntitled + (p.voucherEntitled ?? 0)}</strong> },
            ]}
          />
        )}
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
  // D-ABO-16 / D-ABO-20 (JP 27/10) — filtres Formule (plan), Source et Ville.
  const [planCode, setPlanCode] = useState("");
  const [source, setSource] = useState<BillingSource | "">("");
  const [localityId, setLocalityId] = useState("");
  // D-ABO-31 (JP 27/10) — filtre Portée (Ville / Dirigeant).
  const [planScope, setPlanScope] = useState<PlanScope | "">("");
  // RG-CUR-16 (D-CUR-06, JP 28/10) — filtre Devise (vide = toutes).
  const [currency, setCurrency] = useState<BillingCurrency | "">("");
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const debounced = useDebounced(search);

  useEffect(() => { setPage(1); }, [status, ministryId, planCode, source, localityId, planScope, currency, debounced]);
  // Une ville n'a de sens que pour la portée Ville.
  useEffect(() => { if (planScope === "USER") setLocalityId(""); }, [planScope]);
  useEffect(() => { setLocalityId(""); }, [ministryId]);

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const offersQ = useQuery({ queryKey: ["billing", "offers"], queryFn: listOffers });
  const localitiesQ = useQuery({
    queryKey: ["billing", "localities", ministryId],
    queryFn: () => listLocalities(ministryId),
    enabled: !!ministryId,
  });
  const planOffers = (offersQ.data ?? []).filter((o) => !!o.planCode);
  const listQ = useQuery({
    queryKey: ["billing", "subscriptions", status, ministryId, planCode, source, localityId, planScope, currency, debounced, page],
    queryFn: () => listBillingSubscriptions({
      status, ministryId, planCode, source, localityId, planScope, currency, search: debounced, page: page - 1, size: PAGE_SIZE,
    }),
  });

  const rows = (listQ.data?.content ?? []).map((s) => ({ ...s, _key: s.id }));
  const total = listQ.data?.totalElements ?? 0;
  const pageCount = listQ.data?.totalPages ?? 0;

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: "flex", gap: 12, padding: "12px 16px", flexWrap: "wrap", alignItems: "flex-end", borderBottom: "1px solid var(--line,#eee)" }}>
        <Field label={t("billing.subs.search")}>
          <Input icon={<Icons.Search size={14} />} placeholder={t("billing.subs.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Field label={t("billing.subs.status")}>
          <Select value={status} onChange={(e) => setStatus(e.target.value as BillingSubscriptionStatus | "")}>
            <option value="">{t("billing.all")}</option>
            {SUB_STATUSES.map((s) => <option key={s} value={s}>{t(`billing.status.${s}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("billing.subs.plan")}>
          <Select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
            <option value="">{t("billing.all")}</option>
            {planOffers.map((o) => <option key={o.id} value={o.planCode!}>{o.name}</option>)}
            <option value={PLAN_NONE}>{t("billing.subs.noPlan")}</option>
          </Select>
        </Field>
        <Field label={t("billing.scope.label")}>
          <Select value={planScope} onChange={(e) => setPlanScope(e.target.value as PlanScope | "")}>
            <option value="">{t("billing.all")}</option>
            {PLAN_SCOPES.map((x) => <option key={x} value={x}>{t(`billing.scope.${x}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("billing.subs.source")}>
          <Select value={source} onChange={(e) => setSource(e.target.value as BillingSource | "")}>
            <option value="">{t("billing.all")}</option>
            {SOURCES.map((x) => <option key={x} value={x}>{t(`billing.source.${x}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("billing.common.currency")}>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as BillingCurrency | "")}>
            <option value="">{t("billing.filters.allCurrencies")}</option>
            {BILLING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label={t("billing.subs.ministry")}>
          <Select value={ministryId} onChange={(e) => setMinistryId(e.target.value)}>
            <option value="">{t("billing.allMinistries")}</option>
            {(ministriesQ.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        {ministryId && planScope !== "USER" && (
          <Field label={t("billing.subs.city")}>
            <Select value={localityId} onChange={(e) => setLocalityId(e.target.value)}>
              <option value="">{t("billing.allCities")}</option>
              {(localitiesQ.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </Select>
          </Field>
        )}
        <div style={{ marginLeft: "auto", paddingBottom: 6 }}>
          <Button variant="primary" size="sm" iconL={<Icons.Plus size={15} />} onClick={() => setManualOpen(true)}>
            {t("billing.manual.open")}
          </Button>
        </div>
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
              {
                // D-ABO-31 (JP 27/10) — portée du plan (Ville / Dirigeant).
                label: t("billing.scope.label"),
                render: (s: AdminSubscription) => <ScopeBadge scope={subScope(s, offersQ.data ?? [])} />,
              },
              {
                // D-ABO-19 — ville couverte par un plan LOCALITY ; D-ABO-31 — dirigeant d'un plan USER ;
                // le ministère en sous-titre.
                label: t("billing.subs.beneficiary"),
                render: (s: AdminSubscription) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      {subScope(s, offersQ.data ?? []) === "USER" ? (s.beneficiaryName ?? s.payerName ?? "—") : (s.localityName ?? "—")}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{s.ministryName ?? t("billing.subs.noMinistry")}</div>
                  </div>
                ),
              },
              {
                label: t("billing.subs.plan"),
                render: (s: AdminSubscription) => (
                  <div>
                    <div>{s.offerName}</div>
                    {s.planCode && <code style={{ fontSize: 12 }}>{s.planCode}</code>}
                  </div>
                ),
              },
              { label: t("billing.subs.source"), render: (s: AdminSubscription) => <SourceBadge source={s.source} /> },
              { label: t("billing.subs.period"), render: (s: AdminSubscription) => t(`billing.period.${s.billingPeriod}`) },
              // D-CUR-06 (JP 28/10) — devise figée de l'abonnement (instantané, RG-CUR-08).
              { label: t("billing.common.currency"), render: (s: AdminSubscription) => <code>{s.currency}</code> },
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
              { label: t("billing.subs.due"), render: (s: AdminSubscription) => dueLabel(s, locale) },
              { label: t("billing.subs.entitled"), render: (s: AdminSubscription) => <EntitledBadge s={s} /> },
            ]}
          />
          {pageCount > 1 && <Pagination page={page} pageCount={pageCount} total={total} perPage={PAGE_SIZE} onPage={setPage} />}
        </>
      )}
      {openId && <SubscriptionDrawer id={openId} onClose={() => setOpenId(null)} />}
      {manualOpen && (
        <ManualActivationModal
          planOffers={planOffers}
          offersLoading={offersQ.isLoading}
          offersError={offersQ.isError ? offersQ.error : null}
          onClose={() => setManualOpen(false)}
          onCreated={(s) => { setManualOpen(false); setOpenId(s.id); }}
        />
      )}
    </div>
  );
}

/**
 * RG-ABO-29 (JP 27/10) — activation MANUELLE par le SUPER_ADMIN : formule → ministère → ville (plan LOCALITY)
 * ou dirigeant (plan USER, D-ABO-31..) → période (informative) → date de fin (≥ aujourd'hui, Europe/Paris) →
 * payeur facultatif (ville seulement) → notes. Source MANUEL, aucune facture (D-ABO-24). RG-ABO-30 : 422
 * SUBSCRIPTION_ALREADY_ACTIVE si la ville / le dirigeant a déjà un abonnement non résilié pour ce plan.
 * D-ABO-31 — plan USER : le dirigeant choisi EST le payeur (bénéficiaire), pas de ville (localityId interdit,
 * 422 PERSONAL_PLAN_LOCALITY_FORBIDDEN) ; la recherche ne propose que les dirigeants. « Mensuel seulement »
 * (D-ABO-35) levé par D-MKT-03, JP 28/10 : « Annuel » est proposé dès que l'offre a un `annualPriceCents`.
 */
function ManualActivationModal({
  planOffers, offersLoading, offersError, onClose, onCreated,
}: {
  planOffers: AdminOffer[];
  /** Revue PP-O1 — une liste d'offres en cours de chargement ou en erreur n'est pas « aucune formule ». */
  offersLoading: boolean;
  offersError: unknown;
  onClose: () => void;
  onCreated: (s: AdminSubscription) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const qc = useQueryClient();
  const { push } = useToasts();
  const today = todayParis();

  const [ministryId, setMinistryId] = useState("");
  const [localityId, setLocalityId] = useState("");
  const [planCode, setPlanCode] = useState(planOffers.find((o) => o.active)?.planCode ?? planOffers[0]?.planCode ?? "");
  const [period, setPeriod] = useState<BillingPeriod>("MONTHLY");
  const [endDate, setEndDate] = useState("");
  const [payerId, setPayerId] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [notes, setNotes] = useState("");

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const plan = planOffers.find((o) => o.planCode === planCode);
  const scope = plan ? offerScope(plan) : null;
  const isUser = scope === "USER";
  const localitiesQ = useQuery({
    queryKey: ["billing", "localities", ministryId],
    queryFn: () => listLocalities(ministryId),
    enabled: !!ministryId && !isUser,
  });

  useEffect(() => { setLocalityId(""); setPayerId(""); setLeaderId(""); }, [ministryId]);
  // Changer de portée vide le bénéficiaire de l'autre portée.
  useEffect(() => { setLocalityId(""); setLeaderId(""); setPayerId(""); }, [scope]);
  // Les offres peuvent arriver après l'ouverture : on choisit alors la première formule proposée.
  useEffect(() => {
    if (!planCode && planOffers.length > 0) setPlanCode(planOffers.find((o) => o.active)?.planCode ?? planOffers[0].planCode ?? "");
  }, [planOffers, planCode]);
  // L'annuel n'existe que si le plan a un prix annuel (D-ABO-18).
  useEffect(() => { if (period === "ANNUAL" && !plan?.annualPriceCents) setPeriod("MONTHLY"); }, [plan, period]);

  const beneficiaryOk = isUser ? !!leaderId : !!localityId;
  const valid = beneficiaryOk && !!planCode && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= today && notes.length <= 2000;

  const createM = useMutation({
    mutationFn: () => {
      const body: ManualSubscriptionRequest = isUser
        // D-ABO-31 (JP 27/10) — plan USER : { offerCode, userId, manualEndDate, notes } ; jamais de ville.
        ? {
          // D-MKT-03, JP 28/10 — la période choisie part aussi pour un plan USER (Caleb annuel).
          offerCode: plan!.code, planCode, userId: leaderId, billingPeriod: period, manualEndDate: endDate,
          notes: notes.trim() || null,
        }
        : {
          localityId, planCode, billingPeriod: period, manualEndDate: endDate,
          payerUserId: payerId || null, notes: notes.trim() || null,
        };
      return createManualSubscription(body);
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      push({ kind: "ok", title: t("billing.manual.createdToast"), msg: s.reference });
      onCreated(s);
    },
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const price = plan ? (period === "ANNUAL" ? plan.annualPriceCents : plan.priceCents) : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t("billing.manual.title")}
      sub={isUser ? t("billing.manual.subUser") : t("billing.manual.sub")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!valid || createM.isPending} onClick={() => createM.mutate()}>
            {createM.isPending ? t("common.saving") : t("billing.manual.submit")}
          </Button>
        </>
      }
    >
      {offersLoading ? (
        <p style={{ margin: 0, color: "var(--ink-500)" }}>{t("common.loading")}</p>
      ) : offersError ? (
        <p style={{ margin: 0, color: "var(--ink-500)" }}>{errMsg(t, offersError)}</p>
      ) : planOffers.length === 0 ? (
        <p style={{ margin: 0, color: "var(--ink-500)" }}>{t("billing.manual.noPlan")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label={t("billing.subs.plan")} hint={scope ? t(`billing.scope.${scope}`) : undefined}>
              <Select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
                {planOffers.map((o) => (
                  <option key={o.id} value={o.planCode!}>
                    {o.name} · {t(`billing.scope.${offerScope(o) ?? "LOCALITY"}`)}{o.active ? "" : ` (${t("billing.offers.archived")})`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("billing.subs.period")} hint={price != null ? `${money(price, plan?.currency ?? "EUR", locale)} ${t(`billing.per.${period}`)} · ${t("billing.manual.priceHint")}` : undefined}>
              <Select value={period} onChange={(e) => setPeriod(e.target.value as BillingPeriod)}>
                <option value="MONTHLY">{t("billing.period.MONTHLY")}</option>
                {/* D-MKT-03, JP 28/10 — plus de « !isUser » : un plan personnel peut avoir un prix annuel. */}
                {plan?.annualPriceCents != null && <option value="ANNUAL">{t("billing.period.ANNUAL")}</option>}
              </Select>
            </Field>
            <Field label={t("billing.manual.endDate")} hint={t("billing.manual.endDateHint")}>
              <Input type="date" min={today} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("billing.subs.ministry")}>
              <Select value={ministryId} onChange={(e) => setMinistryId(e.target.value)}>
                <option value="">{t("billing.manual.pickMinistry")}</option>
                {(ministriesQ.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
            {!isUser && (
              <Field label={t("billing.subs.city")} hint={ministryId && !localitiesQ.isLoading && (localitiesQ.data ?? []).length === 0 ? t("billing.manual.noCity") : undefined}>
                <Select value={localityId} disabled={!ministryId} onChange={(e) => setLocalityId(e.target.value)}>
                  <option value="">{t("billing.manual.pickCity")}</option>
                  {(localitiesQ.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </Select>
              </Field>
            )}
          </div>
          {isUser ? (
            ministryId ? (
              // D-ABO-31 — recherche serveur dans le ministère, dirigeants seuls (filtre d'affichage).
              <RemoteUserCombobox
                key={ministryId}
                ministryId={ministryId}
                label={t("billing.manual.leader")}
                hint={t("billing.manual.leaderHint")}
                value={leaderId}
                onChange={(v) => setLeaderId(v)}
                filter={isManagerAccount}
                t={t}
              />
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{t("billing.manual.pickMinistryFirst")}</div>
            )
          ) : (
            <RemoteUserCombobox
              ministryId={ministryId || undefined}
              label={t("billing.manual.payer")}
              hint={t("billing.manual.payerHint")}
              value={payerId}
              onChange={(v) => setPayerId(v)}
              t={t}
            />
          )}
          <Field label={t("billing.subs.notes")}>
            <textarea className="input" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
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
  const offersQ = useQuery({ queryKey: ["billing", "offers"], queryFn: listOffers });
  const s = q.data;
  // D-ABO-31 (JP 27/10) — plan USER : bénéficiaire = payeur (un dirigeant), aucune ville.
  const scope = s ? subScope(s, offersQ.data ?? []) : null;
  const isUserPlan = scope === "USER";

  const [ministryId, setMinistryId] = useState("");
  const [payerId, setPayerId] = useState("");
  const [notes, setNotes] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const today = todayParis();

  // Formulaire réaligné à chaque relecture (après une écriture ou à l'ouverture).
  useEffect(() => {
    if (!s) return;
    setMinistryId(s.ministryId ?? "");
    setPayerId(s.payerUserId);
    setNotes(s.notes ?? "");
    setEndDate(s.manualEndDate ?? "");
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
      if (s && isOffStripe(s.source)) {
        // RG-ABO-29 — MANUEL (et VOUCHER, B-03) : aucun appel Stripe, le statut est posé tout de suite.
        push({ kind: "ok", title: t(s.source === "VOUCHER" ? "billing.manual.endedToastVoucher" : "billing.manual.endedToast"), msg: "" });
        return;
      }
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
  const isManual = s?.source === "MANUEL";
  // D-OFF-08 (JP 27/10) — VOUCHER : comme un MANUEL pour l'affichage (date de fin, ni Stripe ni facture).
  // B-03 (plan 05 §10) / R-BER-10 (29_10_2026/01 §12.5) : le serveur prolonge (PATCH `manualEndDate`) et clôt
  // (`/cancel`) un VOUCHER comme un MANUEL (`isWithoutStripe`, E-18) ; le tiroir propose donc « Prolonger » et
  // « Mettre fin » comme pour un MANUEL, cohérent avec l'onglet « Expirent bientôt » (RG-BER-34).
  const isVoucher = s?.source === "VOUCHER";
  const offStripe = isManual || isVoucher;
  // Même règle que le serveur (contrat §12, ABO2) : CANCELED, EXPIRED ou sans abonnement Stripe (PENDING)
  // → 422 BILLING_SUBSCRIPTION_NOT_ACTIVE ; on ne propose donc pas « Résilier » dans ces cas.
  // RG-ABO-29 (JP 27/10) — MANUEL : « Mettre fin » tant qu'il n'est pas EXPIRED ; un CANCELED ne peut plus
  // que finir immédiatement (contrat 27/10 §6).
  const canCancel = !!s && (offStripe
    ? s.status !== "EXPIRED"
    : s.status !== "CANCELED" && s.status !== "EXPIRED" && !!s.stripeSubscriptionId);
  const canEndAtTerm = !!s && !(offStripe && s.status === "CANCELED");
  // D-ABO-20 — fin de grâce d'un plan impayé (information ; le droit lui-même est `entitled`, calculé serveur).
  // Revue PP-O1 (27/10) — même condition que `BillingSubscription.graceEndsAt()` (plan STRIPE en PAST_DUE), et
  // rien d'affiché quand le serveur a déjà fermé le droit (`entitled` faux) : le texte ne contredit jamais le badge.
  const grace = s && s.planCode && s.source === "STRIPE" && s.status === "PAST_DUE" && s.entitled
    ? graceEnd(s.pastDueSince) : null;
  // R-BER-09 — date postérieure à la fin actuelle (aujourd'hui au plus tôt).
  const minEnd = minExtendDate(s?.manualEndDate, today);
  const endDateValid = /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= minEnd;

  const info: [string, ReactNode][] = s ? [
    [t("billing.subs.offer"), s.offerName],
    ...(s.planCode ? [
      [t("billing.subs.plan"), <code key="p">{s.planCode}</code>],
      [t("billing.scope.label"), <ScopeBadge key="sc" scope={scope} />],
      isUserPlan
        ? [t("billing.subs.beneficiaryLeader"), s.beneficiaryName ?? s.payerName ?? "—"]
        : [t("billing.subs.city"), s.localityName ?? "—"],
      [t("billing.subs.entitled"), <EntitledBadge key="e" s={s} />],
    ] as [string, ReactNode][] : []),
    [t("billing.subs.source"), <SourceBadge key="src" source={s.source} />],
    [t("billing.subs.period"), t(`billing.period.${s.billingPeriod}`)],
    [t("billing.subs.listPrice"), `${money(s.listPriceCents, s.currency, locale)} ${t(`billing.per.${s.billingPeriod}`)}`],
    [t("billing.subs.discount"), s.promoCode ? `${s.promoCode}${s.discountPercent != null ? ` (−${s.discountPercent} %)` : ""}` : "—"],
    [t("billing.subs.price"), `${money(s.priceCents, s.currency, locale)} ${t(`billing.per.${s.billingPeriod}`)}`],
    [t("billing.subs.createdAt"), fmtDateTime(s.createdAt, locale)],
    [t("billing.subs.activatedAt"), fmtDateTime(s.activatedAt, locale)],
    offStripe
      ? [t("billing.manual.endDate"), fmtDay(s.manualEndDate, locale)]
      : [t("billing.subs.nextDue"), fmtDate(s.currentPeriodEnd, locale)],
    ...(grace ? [
      [t("billing.subs.pastDueSince"), fmtDateTime(s.pastDueSince, locale)],
      [t("billing.subs.graceEnd"), <strong key="g">{fmtDate(grace, locale)}</strong>],
    ] as [string, ReactNode][] : []),
    [t("billing.subs.canceledAt"), fmtDateTime(s.canceledAt, locale)],
    [t("billing.subs.payer"), `${s.payerName ?? "—"}${s.payerEmail ? ` · ${s.payerEmail}` : ""}`],
    // Un MANUEL / VOUCHER n'a ni client Stripe ni adresse de facturation (aucun paiement en ligne, D-ABO-24, D-OFF-08).
    ...(offStripe ? [] : [
      [t("billing.subs.billingAddress"), address ? <span style={{ whiteSpace: "pre-line" }}>{address}</span> : "—"],
      [t("billing.subs.stripeCustomer"), <code key="c">{s.stripeCustomerId ?? "—"}</code>],
      [t("billing.subs.stripeSubscription"), <code key="s">{s.stripeSubscriptionId ?? "—"}</code>],
    ] as [string, ReactNode][]),
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

            {grace && (
              <div style={{ fontSize: 13, color: "var(--ink-500)" }}>{t(isUserPlan ? "billing.subs.graceHintUser" : "billing.subs.graceHint", { date: fmtDate(grace, locale) })}</div>
            )}

            {/* RG-ABO-29 (JP 27/10) — prolonger un MANUEL ou un VOUCHER (B-03 / R-BER-10) ; un EXPIRED / CANCELED
                redevient ACTIVE (RG-ABO-30 contrôlée). R-BER-09 : borne basse = lendemain de la fin actuelle. */}
            {offStripe && (
              <div>
                <h4 style={{ margin: "0 0 8px" }}>{t("billing.manual.extendTitle")}</h4>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <Input type="date" min={minEnd} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  <Button size="sm" variant="primary" disabled={patchM.isPending || !endDateValid}
                    onClick={() => patchM.mutate({ manualEndDate: endDate })}>
                    {t("billing.manual.extend")}
                  </Button>
                </div>
                {endDate !== "" && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate < minEnd && endDate !== (s.manualEndDate ?? "") && (
                  <div style={{ fontSize: 12.5, color: "var(--err)", marginTop: 6 }}>{t("billing.manual.extendAfterEnd", { date: fmtDay(minEnd, locale) })}</div>
                )}
                <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 6 }}>
                  {s.status === "EXPIRED" || s.status === "CANCELED" ? t("billing.manual.extendReactivates") : t("billing.manual.extendHint")}
                </div>
              </div>
            )}

            {isVoucher && (
              <div style={{ fontSize: 13, color: "var(--ink-500)" }}>{t("billing.vouchers.subscriptionHint")}</div>
            )}

            {/* D-ABO-05 — ministère lié, modifiable ; « aucun » = délier (ministryId: null explicite).
                Revue PP-O1 (27/10) — pour un plan, le ministère est celui de la ville (contrat §5.1 / §6) :
                lecture seule, sinon le filtre « Ville » (ministère + ville) ne retrouverait plus l'abonnement. */}
            <div>
              <h4 style={{ margin: "0 0 8px" }}>{t("billing.subs.ministry")}</h4>
              {s.planCode ? (
                <div style={{ fontSize: 13.5 }}>
                  <div>{s.ministryName ?? "—"}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 4 }}>{t(isUserPlan ? "billing.subs.ministryFromUser" : "billing.subs.ministryFromCity")}</div>
                </div>
              ) : (
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
              )}
              {/* D-ABO-15 — lien vers la couverture de modules du ministère, pour que JP décide (D-ABO-01). */}
              {s.ministryId && (
                <Button size="sm" variant="ghost" style={{ marginTop: 8 }} iconR={<Icons.ArrowRight size={14} />}
                  onClick={() => navigate(`/abonnements?ministryId=${encodeURIComponent(s.ministryId!)}`)}>
                  {t("billing.subs.moduleAccessLink")}
                </Button>
              )}
            </div>

            {/* D-ABO-07 — le SUPER_ADMIN peut changer le payeur. D-ABO-31 (JP 27/10) — sur un plan USER le payeur
                EST le bénéficiaire : le changer déplace le droit vers un autre dirigeant (dirigeants seuls proposés). */}
            <div>
              <h4 style={{ margin: "0 0 8px" }}>{t(isUserPlan ? "billing.subs.changeBeneficiary" : "billing.subs.changePayer")}</h4>
              <RemoteUserCombobox
                ministryId={isUserPlan ? (s.ministryId ?? undefined) : undefined}
                filter={isUserPlan ? isManagerAccount : undefined}
                hint={isUserPlan ? t("billing.subs.changeBeneficiaryHint") : undefined}
                label={t(isUserPlan ? "billing.subs.beneficiaryLeader" : "billing.subs.payer")}
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
              <Button variant="danger" onClick={() => setCancelOpen(true)}>{offStripe ? t("billing.manual.end") : t("billing.subs.cancel")}</Button>
            )}
          </div>
        )}
      </Drawer>

      {/* D-ABO-11 — le SUPER_ADMIN résilie à la fin de la période payée ou immédiatement. */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={offStripe ? t(isVoucher ? "billing.manual.endTitleVoucher" : "billing.manual.endTitle") : t("billing.subs.cancelTitle")}
        sub={s?.reference}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>{t("common.close")}</Button>
            {canEndAtTerm && (
              <Button variant="secondary" disabled={cancelM.isPending} onClick={() => cancelM.mutate(false)}>
                {offStripe ? t("billing.manual.endAtTerm") : t("billing.subs.cancelAtEnd")}
              </Button>
            )}
            <Button variant="danger" disabled={cancelM.isPending} onClick={() => cancelM.mutate(true)}>{t("billing.subs.cancelNow")}</Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {offStripe
            ? t(canEndAtTerm
              ? (isUserPlan ? "billing.manual.endBodyUser" : "billing.manual.endBody")
              : "billing.manual.endBodyCanceled", { date: fmtDay(s?.manualEndDate, locale) })
            : s?.planCode
              ? t(isUserPlan ? "billing.subs.cancelBodyPlanUser" : "billing.subs.cancelBodyPlan", { date: fmtDate(s?.currentPeriodEnd, locale) })
              : t("billing.subs.cancelBody", { date: fmtDate(s?.currentPeriodEnd, locale) })}
        </p>
      </Modal>
    </>
  );
}

// ---------- Expirent bientôt — D-BER-04 (JP 29/10, lot BER) ----------

/**
 * D-BER-04 / RG-BER-27..35 (JP 29/10) — vue des plans qui arrivent à leur fin : la liste, `endDate`, `daysLeft`,
 * `kind` et `extendable` viennent du serveur (`PlanExpiry`, seul point de décision) ; rien n'est recalculé ici.
 * Clic sur une ligne → tiroir abonnement existant ; « Prolonger » (MANUEL / VOUCHER) → modale de date.
 */
function ExpiringTab() {
  const { t } = useTranslation();
  const locale = useLocale();
  const [days, setDays] = useState<ExpiringWindow>(30);
  const [openId, setOpenId] = useState<string | null>(null);
  const [extending, setExtending] = useState<AdminExpiringSubscription | null>(null);

  const listQ = useQuery({
    queryKey: ["billing", "subscriptions", "expiring", days],
    queryFn: () => listExpiringSubscriptions(days),
  });
  const rows = (listQ.data ?? []).map((s) => ({ ...s, _key: s.id }));

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: "flex", gap: 12, padding: "12px 16px", flexWrap: "wrap", alignItems: "flex-end", borderBottom: "1px solid var(--line,#eee)" }}>
        <Field label={t("billing.expiring.windowLabel")}>
          <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value) as ExpiringWindow)}>
            {EXPIRING_WINDOWS.map((d) => <option key={d} value={d}>{t("billing.expiring.window", { days: d })}</option>)}
          </Select>
        </Field>
        <div style={{ fontSize: 12.5, color: "var(--ink-500)", paddingBottom: 8 }}>{t("billing.expiring.hint")}</div>
      </div>
      {listQ.isLoading ? (
        <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
      ) : listQ.isError ? (
        <div style={{ padding: 24, color: "var(--ink-500)" }}>{errMsg(t, listQ.error)}</div>
      ) : (
        <Table
          rows={rows}
          onRowClick={(s: AdminExpiringSubscription) => setOpenId(s.id)}
          empty={<div style={{ padding: 24, color: "var(--ink-500)" }}>{t("billing.expiring.empty")}</div>}
          columns={[
            {
              // Bénéficiaire : le dirigeant (plan USER, Caleb) ou la ville (plan LOCALITY, Néhémie) ; ministère dessous.
              label: t("billing.expiring.col.beneficiary"),
              render: (s: AdminExpiringSubscription) => (
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {s.planScope === "USER" ? (s.beneficiaryName ?? s.payerName ?? "—") : (s.localityName ?? "—")}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
                    <ScopeBadge scope={s.planScope} /> {s.ministryName ?? t("billing.subs.noMinistry")}
                  </div>
                </div>
              ),
            },
            {
              label: t("billing.expiring.col.offer"),
              render: (s: AdminExpiringSubscription) => (
                <div>
                  <div>{s.offerName}</div>
                  <code style={{ fontSize: 12 }}>{s.reference}</code>
                </div>
              ),
            },
            {
              label: t("billing.expiring.col.type"),
              render: (s: AdminExpiringSubscription) => (
                <div>
                  <SourceBadge source={s.source} />
                  <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 2 }}>{t(`billing.expiring.kind.${s.kind}`)}</div>
                </div>
              ),
            },
            { label: t("billing.expiring.col.endDate"), render: (s: AdminExpiringSubscription) => fmtDay(s.endDate, locale) },
            {
              label: t("billing.expiring.col.daysLeft"),
              render: (s: AdminExpiringSubscription) => s.daysLeft <= 0
                ? <Badge tone="err">{t("billing.expiring.lastDay")}</Badge>
                : <Badge tone={s.daysLeft <= 7 ? "warn" : "gray"}>{t("billing.expiring.daysCount", { count: s.daysLeft })}</Badge>,
            },
            { label: t("billing.expiring.col.reminder"), render: (s: AdminExpiringSubscription) => fmtDate(s.reminderSentAt, locale) },
            {
              label: "",
              render: (s: AdminExpiringSubscription) => s.extendable ? (
                <span onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => setExtending(s)}>{t("billing.expiring.extend")}</Button>
                </span>
              ) : null,
            },
          ]}
        />
      )}
      {openId && <SubscriptionDrawer id={openId} onClose={() => setOpenId(null)} />}
      {extending && <ExtendExpiringModal sub={extending} onClose={() => setExtending(null)} />}
    </div>
  );
}

/**
 * RG-BER-34 / RG-BER-35 (JP 29/10) — prolonger un MANUEL / VOUCHER depuis « Expirent bientôt » : date ≥ aujourd'hui
 * (Europe/Paris), PATCH `manualEndDate` existant (règles serveur inchangées : 422 BILLING_SUBSCRIPTION_NOT_MANUAL,
 * 400 INVALID_PARAMETER, 422 SUBSCRIPTION_ALREADY_ACTIVE), puis rechargement (la nouvelle date réarme le rappel J-7).
 */
function ExtendExpiringModal({ sub, onClose }: { sub: AdminExpiringSubscription; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const qc = useQueryClient();
  const { push } = useToasts();
  const today = todayParis();
  // R-BER-09 (29_10_2026/01 §12.5) — « Prolonger » ne raccourcit jamais : date postérieure à la fin actuelle.
  const minEnd = minExtendDate(sub.endDate, today);
  const [endDate, setEndDate] = useState(minEnd);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= minEnd;

  const patchM = useMutation({
    mutationFn: () => patchBillingSubscription(sub.id, { manualEndDate: endDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      push({ kind: "ok", title: t("billing.expiring.extendedToast"), msg: sub.reference });
      onClose();
    },
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t("billing.expiring.extendTitle")}
      sub={`${sub.offerName} · ${sub.planScope === "USER" ? (sub.beneficiaryName ?? sub.payerName ?? "—") : (sub.localityName ?? "—")}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!valid || patchM.isPending} onClick={() => patchM.mutate()}>
            {patchM.isPending ? t("common.saving") : t("billing.expiring.extend")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13.5 }}>{t("billing.expiring.currentEnd", { date: fmtDay(sub.endDate, locale) })}</div>
        <Field label={t("billing.manual.endDate")} hint={t("billing.manual.extendAfterEnd", { date: fmtDay(minEnd, locale) })}>
          <Input type="date" min={minEnd} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        {/^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate < minEnd && (
          <div style={{ fontSize: 12.5, color: "var(--err)" }}>{t("billing.manual.extendAfterEnd", { date: fmtDay(minEnd, locale) })}</div>
        )}
      </div>
    </Modal>
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
  // RG-CUR-16 (D-CUR-06, JP 28/10) — filtre Devise (vide = toutes), repris par l'export CSV.
  const [currency, setCurrency] = useState<BillingCurrency | "">("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  useEffect(() => { setPage(1); }, [from, to, currency, debounced]);

  const listQ = useQuery({
    queryKey: ["billing", "invoices", from, to, currency, debounced, page],
    queryFn: () => listInvoices({ from, to, search: debounced, currency, page: page - 1, size: PAGE_SIZE }),
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
        <Field label={t("billing.common.currency")}>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as BillingCurrency | "")}>
            <option value="">{t("billing.filters.allCurrencies")}</option>
            {BILLING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <div style={{ marginLeft: "auto", paddingBottom: 6 }}>
          <Button variant="primary" size="sm" iconL={<Icons.Export size={15} />}
            onClick={() => download(() => exportInvoicesCsv(from || undefined, to || undefined, currency || undefined))}>
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
              // D-CUR-06 (JP 28/10) — devise de la facture (celle reçue de Stripe, RG-CUR-13).
              { label: t("billing.common.currency"), render: (i: AdminInvoice) => <code>{i.currency}</code> },
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
  /** D-ABO-16 (JP 27/10) — offre à plan : code saisi à la création, immuable ensuite. */
  isPlan: boolean; planCode: string; annualPrice: string; entitlementCodes: string[];
  /** D-ABO-31 (JP 27/10) — portée du plan (Ville / Dirigeant), choisie à la création, immuable. */
  planScope: PlanScope;
  /** D-OFF-08 (JP 27/10) — prix local informatif (ex. « 1 000 FCFA / mois »), plan seulement. */
  localPriceLabel: string;
  /** D-CUR-02 / 06 (JP 28/10) — prix USD fixes (décimaux saisis), plan seulement ; vide = proposée en EUR seulement. */
  usdPrice: string; usdAnnualPrice: string;
}
const OFFER_EMPTY: OfferForm = {
  code: "", name: "", nameEn: "", description: "", descriptionEn: "", price: "", vatRate: "20", displayOrder: "0", active: true,
  isPlan: false, planCode: "", annualPrice: "", entitlementCodes: [], planScope: "LOCALITY", localPriceLabel: "",
  usdPrice: "", usdAnnualPrice: "",
};
/** D-OFF-08 — longueur maximale du prix local (texte libre affiché à côté du champ code, web). */
const LOCAL_PRICE_MAX = 80; // = @Size(max = 80) de OfferRequest.localPriceLabel (bil_offer.local_price_label VARCHAR(80))
const OFFER_CODE_RE = /^[a-z0-9-]{3,40}$/; // RG-ABO-01
const PLAN_CODE_RE = /^[A-Z0-9_]{3,40}$/; // contrat 27/10 §6 (OfferRequest.planCode)

function OffersTab() {
  const { t } = useTranslation();
  const locale = useLocale();
  const qc = useQueryClient();
  const { push } = useToasts();
  const q = useQuery({ queryKey: ["billing", "offers"], queryFn: listOffers });
  // D-ABO-16 — codes de droit = `sub_module.code` (catalogue des modules, page /abonnements).
  const modulesQ = useQuery({ queryKey: ["modules"], queryFn: listModules });
  const [editing, setEditing] = useState<AdminOffer | "new" | null>(null);
  const [form, setForm] = useState<OfferForm>(OFFER_EMPTY);
  const moduleName = (code: string) => {
    const m = (modulesQ.data ?? []).find((x) => x.code === code);
    if (!m) return code;
    return locale.startsWith("en") ? (m.nameEn || m.name) : m.name;
  };

  const open = (o: AdminOffer | "new") => {
    setEditing(o);
    setForm(o === "new" ? OFFER_EMPTY : {
      code: o.code, name: o.name, nameEn: o.nameEn ?? "", description: o.description ?? "", descriptionEn: o.descriptionEn ?? "",
      price: (o.priceCents / 100).toFixed(2), vatRate: String(o.vatRate), displayOrder: String(o.displayOrder), active: o.active,
      isPlan: !!o.planCode, planCode: o.planCode ?? "",
      annualPrice: o.annualPriceCents != null ? (o.annualPriceCents / 100).toFixed(2) : "",
      entitlementCodes: o.entitlementCodes ?? [],
      planScope: offerScope(o) ?? "LOCALITY",
      localPriceLabel: o.localPriceLabel ?? "",
      usdPrice: o.usdPriceCents != null ? (o.usdPriceCents / 100).toFixed(2) : "",
      usdAnnualPrice: o.usdAnnualPriceCents != null ? (o.usdAnnualPriceCents / 100).toFixed(2) : "",
    });
  };

  const priceCents = parseCents(form.price);
  const vatRate = Number(form.vatRate.replace(",", "."));
  const annualCents = form.annualPrice.trim() === "" ? null : parseCents(form.annualPrice);
  // D-CUR-02 (JP 28/10) — prix USD saisis tels quels (aucune conversion) ; l'annuel USD exige le mensuel USD
  // (même règle que le CHECK `ck_bil_offer_usd_annual_price` et le 400 du serveur).
  const usdCents = form.usdPrice.trim() === "" ? null : parseCents(form.usdPrice);
  const usdAnnualCents = form.usdAnnualPrice.trim() === "" ? null : parseCents(form.usdAnnualPrice);
  const usdValid = (usdCents === null || (Number.isFinite(usdCents) && usdCents > 0))
    && (usdAnnualCents === null || (Number.isFinite(usdAnnualCents) && usdAnnualCents > 0 && usdCents !== null))
    // R-01 (lot CUR, 07_Plan_Devises_USD §10.4) — un annuel USD sans annuel EUR serait annoncé mais refusé à la caisse
    // (422 BILLING_PERIOD_UNSUPPORTED : la période se contrôle sur l'EUR) : on l'empêche à la saisie.
    && (usdAnnualCents === null || annualCents !== null);
  const planValid = !form.isPlan || (
    PLAN_CODE_RE.test(form.planCode) && form.entitlementCodes.length > 0
    && (annualCents === null || (Number.isFinite(annualCents) && annualCents > 0))
    && usdValid
    && form.localPriceLabel.trim().length <= LOCAL_PRICE_MAX
  );
  const valid = OFFER_CODE_RE.test(form.code) && form.name.trim() !== "" && priceCents > 0 && Number.isFinite(vatRate) && vatRate >= 0 && planValid;
  const toggleCode = (code: string, on: boolean) =>
    setForm({ ...form, entitlementCodes: on ? [...form.entitlementCodes, code] : form.entitlementCodes.filter((c) => c !== code) });

  const saveM = useMutation({
    mutationFn: () => {
      // D-ABO-03 — EUR ; prix de base MENSUEL. D-ABO-18 (JP 27/10) : le prix annuel est un champ à part, plan seulement
      // (LOCALITY ou USER depuis D-MKT-03, JP 28/10 — aucun blocage pour un plan personnel).
      const req: OfferRequest = {
        code: form.code, name: form.name.trim(), nameEn: form.nameEn.trim() || null,
        description: form.description.trim() || null, descriptionEn: form.descriptionEn.trim() || null,
        priceCents, currency: "EUR", billingPeriod: "MONTHLY", vatRate,
        active: form.active, displayOrder: Number(form.displayOrder) || 0,
        // Contrat 27/10 §6 — champs plan absents (null) sur une offre sans plan, sinon 400 INVALID_PARAMETER.
        planCode: form.isPlan ? form.planCode : null,
        // D-ABO-31 (JP 27/10) — immuable : renvoyée telle quelle au PUT.
        planScope: form.isPlan ? form.planScope : null,
        annualPriceCents: form.isPlan ? annualCents : null,
        entitlementCodes: form.isPlan ? form.entitlementCodes : undefined,
        // D-OFF-08 (JP 27/10) — information seulement (aucune devise FCFA dans Stripe) ; vide = null.
        localPriceLabel: form.isPlan ? (form.localPriceLabel.trim() || null) : null,
        // D-CUR-02 / 06 (JP 28/10) — plan seulement ; null = supprimé au PUT (offre proposée en EUR seulement).
        usdPriceCents: form.isPlan ? usdCents : null,
        usdAnnualPriceCents: form.isPlan && usdCents !== null ? usdAnnualCents : null,
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
              // D-ABO-16 (JP 27/10) — formule et codes de droit ouverts à la ville.
              label: t("billing.subs.plan"),
              render: (o: AdminOffer) => o.planCode ? (
                <div>
                  <code>{o.planCode}</code>
                  {planSubtitle(t, o.planCode) && <div style={{ fontSize: 12.5, marginTop: 2 }}>{planSubtitle(t, o.planCode)}</div>}
                  <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>{(o.entitlementCodes ?? []).join(" · ")}</div>
                </div>
              ) : <span style={{ color: "var(--ink-400)" }}>{t("billing.offers.noPlan")}</span>,
            },
            // D-ABO-31 (JP 27/10) — portée du plan : Ville ou Dirigeant (personnelle).
            { label: t("billing.scope.label"), render: (o: AdminOffer) => <ScopeBadge scope={offerScope(o)} /> },
            {
              label: t("billing.offers.name"),
              render: (o: AdminOffer) => (
                <div>
                  <div style={{ fontWeight: 500 }}>{o.name}</div>
                  {o.nameEn && <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{o.nameEn}</div>}
                </div>
              ),
            },
            {
              label: t("billing.subs.price"),
              render: (o: AdminOffer) => (
                <div>
                  <div>{`${money(o.priceCents, o.currency, locale)} ${t("billing.ttc")} ${t(`billing.per.${o.billingPeriod}`)}`}</div>
                  {o.annualPriceCents != null && (
                    <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{`${money(o.annualPriceCents, o.currency, locale)} ${t("billing.ttc")} ${t("billing.per.ANNUAL")}`}</div>
                  )}
                  {/* D-CUR-02 (JP 28/10) — prix USD fixes, en dollars tels que saisis. */}
                  {o.usdPriceCents != null && (
                    <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{`${money(o.usdPriceCents, "USD", locale)} ${t("billing.ttc")} ${t("billing.per.MONTHLY")}`}</div>
                  )}
                  {o.usdAnnualPriceCents != null && (
                    <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{`${money(o.usdAnnualPriceCents, "USD", locale)} ${t("billing.ttc")} ${t("billing.per.ANNUAL")}`}</div>
                  )}
                  {o.localPriceLabel && (
                    <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{t("billing.offers.localPriceShort", { label: o.localPriceLabel })}</div>
                  )}
                </div>
              ),
            },
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

          {/* D-ABO-16..18 (JP 27/10) — PLAN : code immuable, prix annuel facultatif, codes de droit ouverts à la ville. */}
          <div style={{ borderTop: "1px solid var(--line,#eee)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* D-ABO-31 (JP 27/10) — type d'offre : sans formule / formule de ville / formule personnelle de dirigeant. */}
            <Field label={t("billing.offers.kind")} hint={editing === "new" ? t("billing.offers.isPlanHint") : t("billing.offers.planImmutable")}>
              <Select value={form.isPlan ? form.planScope : "NONE"} disabled={editing !== "new"}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm(v === "NONE" ? { ...form, isPlan: false } : { ...form, isPlan: true, planScope: v as PlanScope });
                }}>
                <option value="NONE">{t("billing.offers.kindNone")}</option>
                <option value="LOCALITY">{t("billing.offers.kindLocality")}</option>
                <option value="USER">{t("billing.offers.kindUser")}</option>
              </Select>
            </Field>
            {form.isPlan && (
              <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: -6 }}>
                {t(form.planScope === "USER" ? "billing.offers.scopeUserHint" : "billing.offers.scopeLocalityHint")}
              </div>
            )}
            {form.isPlan && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label={t("billing.offers.planCode")} hint={editing === "new" ? t("billing.offers.planCodeHint") : t("billing.offers.codeImmutable")}>
                    <Input value={form.planCode} disabled={editing !== "new"} maxLength={40}
                      onChange={(e) => setForm({ ...form, planCode: e.target.value.toUpperCase() })} />
                  </Field>
                  <Field label={t("billing.offers.annualPriceTtc")}
                    hint={annualCents != null && Number.isFinite(annualCents) && annualCents > 0 ? `${money(annualCents, "EUR", locale)} ${t("billing.per.ANNUAL")}` : t("billing.offers.annualHint")}>
                    <Input inputMode="decimal" value={form.annualPrice} onChange={(e) => setForm({ ...form, annualPrice: e.target.value })} />
                  </Field>
                </div>
                {/* D-CUR-02 / 06 (JP 28/10) — prix USD fixes (aucune conversion) ; vides = offre proposée en euros seulement. */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label={t("billing.offers.usdPrice")}
                    hint={usdCents != null && Number.isFinite(usdCents) && usdCents > 0 ? `${money(usdCents, "USD", locale)} ${t("billing.per.MONTHLY")}` : t("billing.offers.usdHint")}>
                    <Input inputMode="decimal" value={form.usdPrice} onChange={(e) => setForm({ ...form, usdPrice: e.target.value })} />
                  </Field>
                  <Field label={t("billing.offers.usdAnnualPrice")}
                    hint={usdAnnualCents != null && Number.isFinite(usdAnnualCents) && usdAnnualCents > 0 ? `${money(usdAnnualCents, "USD", locale)} ${t("billing.per.ANNUAL")}` : t("billing.offers.annualHint")}>
                    <Input inputMode="decimal" value={form.usdAnnualPrice} onChange={(e) => setForm({ ...form, usdAnnualPrice: e.target.value })} />
                  </Field>
                </div>
                {usdAnnualCents !== null && usdCents === null && (
                  <div style={{ fontSize: 12.5, color: "var(--err)", marginTop: -6 }}>{t("billing.offers.usdAnnualNeedsMonthly")}</div>
                )}
                {/* R-01 (lot CUR) — l'annuel USD exige l'annuel EUR. */}
                {usdAnnualCents !== null && annualCents === null && (
                  <div style={{ fontSize: 12.5, color: "var(--err)", marginTop: -6 }}>{t("billing.offers.usdAnnualNeedsEurAnnual")}</div>
                )}
                {/* D-OFF-08 (JP 27/10) — prix local : texte libre, INFORMATION seulement, affiché sur le web à côté du
                    champ code (« Mobile Money auprès de votre relais — … »). Jamais sur mobile. */}
                <Field label={t("billing.offers.localPrice")} hint={t("billing.offers.localPriceHint")}>
                  <Input value={form.localPriceLabel} maxLength={LOCAL_PRICE_MAX} placeholder={t("billing.offers.localPricePlaceholder")}
                    onChange={(e) => setForm({ ...form, localPriceLabel: e.target.value })} />
                </Field>
                <Field label={t("billing.offers.entitlements")} hint={t("billing.offers.entitlementsHint")}>
                  {modulesQ.isLoading ? (
                    <div style={{ color: "var(--ink-500)" }}>{t("common.loading")}</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                      {(modulesQ.data ?? []).map((m) => (
                        <label key={m.code} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <Checkbox checked={form.entitlementCodes.includes(m.code)} onChange={(v) => toggleCode(m.code, v)} />
                          <span>
                            {moduleName(m.code)} <span style={{ color: "var(--ink-400)" }}>({m.code})</span>
                            {m.free && <> <Badge tone="green">{t("billing.offers.freeModule")}</Badge></>}
                          </span>
                        </label>
                      ))}
                      {/* Un code déjà porté par le plan mais absent du catalogue reste visible pour pouvoir le retirer. */}
                      {form.entitlementCodes.filter((c) => !(modulesQ.data ?? []).some((m) => m.code === c)).map((c) => (
                        <label key={c} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <Checkbox checked onChange={(v) => toggleCode(c, v)} />
                          <code>{c}</code>
                        </label>
                      ))}
                    </div>
                  )}
                </Field>
                {form.entitlementCodes.length === 0 && (
                  <div style={{ fontSize: 12.5, color: "var(--err)" }}>{t("billing.offers.entitlementsRequired")}</div>
                )}
              </>
            )}
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

// ---------- Vouchers — D-OFF-08 (JP 27/10, lot « Offres Caleb / Néhémie », §3.6) ----------

function voucherTone(s: VoucherStatus): "ok" | "gray" | "warn" {
  if (s === "ACTIVE") return "ok";
  if (s === "REVOKED") return "warn";
  return "gray";
}

/**
 * Date limite passée : plus aucun code du lot n'est saisissable (422 `VOUCHER_EXPIRED`, contrôlé par le serveur).
 * Contrôle croisé 27/10 : `expiresAt` est un `LocalDate` Java (`YYYY-MM-DD`, INCLUSE, Europe/Paris) — comparé
 * à « aujourd'hui » à Paris, jamais converti en instant.
 */
function batchExpired(b: Pick<VoucherBatch, "expiresAt">): boolean {
  return !!b.expiresAt && b.expiresAt < todayParis();
}

function VouchersTab() {
  const { t } = useTranslation();
  const locale = useLocale();
  const download = useDownload();
  const [ministryId, setMinistryId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [openBatch, setOpenBatch] = useState<VoucherBatch | null>(null);

  const q = useQuery({ queryKey: ["billing", "vouchers", "batches"], queryFn: listVoucherBatches });
  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const offersQ = useQuery({ queryKey: ["billing", "offers"], queryFn: listOffers });
  const offers = offersQ.data ?? [];

  const rows = (q.data ?? [])
    .filter((b) => !ministryId || b.ministryId === ministryId)
    .map((b) => ({ ...b, _key: b.id }));

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: "flex", gap: 12, padding: "12px 16px", flexWrap: "wrap", alignItems: "flex-end", borderBottom: "1px solid var(--line,#eee)" }}>
        <span style={{ color: "var(--ink-500)", fontSize: 13.5, flex: "1 1 320px", alignSelf: "center" }}>{t("billing.vouchers.hint")}</span>
        <Field label={t("billing.subs.ministry")}>
          <Select value={ministryId} onChange={(e) => setMinistryId(e.target.value)}>
            <option value="">{t("billing.allMinistries")}</option>
            {(ministriesQ.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <div style={{ paddingBottom: 6 }}>
          <Button variant="primary" size="sm" iconL={<Icons.Plus size={15} />} onClick={() => setCreateOpen(true)}>
            {t("billing.vouchers.create")}
          </Button>
        </div>
      </div>
      {q.isLoading ? (
        <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
      ) : q.isError ? (
        <div style={{ padding: 24, color: "var(--ink-500)" }}>{errMsg(t, q.error)}</div>
      ) : (
        <Table
          rows={rows}
          onRowClick={(b: VoucherBatch) => setOpenBatch(b)}
          empty={<div style={{ padding: 24, color: "var(--ink-500)" }}>{t("billing.vouchers.empty")}</div>}
          columns={[
            { label: t("billing.subs.createdAt"), render: (b: VoucherBatch) => fmtDate(b.createdAt, locale) },
            { label: t("billing.vouchers.label"), render: (b: VoucherBatch) => b.label ?? "—" },
            {
              label: t("billing.subs.offer"),
              render: (b: VoucherBatch) => {
                const o = offers.find((x) => x.code === b.offerCode);
                return (
                  <div>
                    <div style={{ fontWeight: 500 }}>{b.offerName}</div>
                    {o && <ScopeBadge scope={offerScope(o)} />}
                  </div>
                );
              },
            },
            { label: t("billing.subs.ministry"), render: (b: VoucherBatch) => b.ministryName },
            { label: t("billing.vouchers.duration"), render: (b: VoucherBatch) => t("billing.vouchers.days", { count: b.durationDays }) },
            { label: t("billing.vouchers.used"), render: (b: VoucherBatch) => `${b.usedCount} / ${b.quantity}` },
            {
              label: t("billing.vouchers.expiresAt"),
              render: (b: VoucherBatch) => (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {b.expiresAt ? fmtDay(b.expiresAt, locale) : t("billing.vouchers.noExpiry")}
                  {batchExpired(b) && <Badge tone="gray">{t("billing.vouchers.expired")}</Badge>}
                </span>
              ),
            },
            {
              label: "",
              render: (b: VoucherBatch) => (
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => setOpenBatch(b)}>{t("billing.vouchers.codes")}</Button>
                  <Button size="sm" variant="ghost" iconL={<Icons.Download size={14} />} onClick={() => download(() => exportVoucherCodesCsv(b))}>
                    {t("billing.vouchers.csv")}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
      {createOpen && (
        <VoucherBatchModal
          offers={offers}
          offersLoading={offersQ.isLoading}
          offersError={offersQ.isError ? offersQ.error : null}
          onClose={() => setCreateOpen(false)}
          onCreated={(b) => { setCreateOpen(false); setOpenBatch(b); }}
        />
      )}
      {openBatch && <VoucherCodesModal batch={openBatch} onClose={() => setOpenBatch(null)} />}
    </div>
  );
}

/**
 * D-OFF-08 (JP 27/10) — créer un lot : offre à formule (Caleb ou Néhémie, offres actives), ministère, durée en jours
 * (fixée par le SUPER_ADMIN), quantité ≤ 500, date limite facultative, libellé libre.
 */
function VoucherBatchModal({
  offers, offersLoading, offersError, onClose, onCreated,
}: {
  offers: AdminOffer[];
  offersLoading: boolean;
  offersError: unknown;
  onClose: () => void;
  onCreated: (b: VoucherBatch) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { push } = useToasts();
  const planOffers = offers.filter((o) => !!o.planCode && o.active);
  const [offerCode, setOfferCode] = useState(planOffers[0]?.code ?? "");
  const [ministryId, setMinistryId] = useState("");
  const [duration, setDuration] = useState("30");
  const [quantity, setQuantity] = useState("10");
  const [expiresAt, setExpiresAt] = useState("");
  const [label, setLabel] = useState("");
  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });

  // Les offres peuvent arriver après l'ouverture : on choisit alors la première formule proposée.
  useEffect(() => {
    if (!offerCode && planOffers.length > 0) setOfferCode(planOffers[0].code);
  }, [planOffers, offerCode]);

  const offer = planOffers.find((o) => o.code === offerCode);
  const durationDays = Number(duration);
  const qty = Number(quantity);
  // Contrôle croisé 27/10 : `VoucherBatchRequest.expiresAt` est un `LocalDate` Java (`YYYY-MM-DD`, incluse,
  // Europe/Paris, ≥ aujourd'hui — 400 `INVALID_PARAMETER` sinon) : on envoie la date seule, jamais un instant.
  const today = todayParis();
  const valid = !!offer && !!ministryId
    && Number.isInteger(durationDays) && durationDays >= 1 && durationDays <= VOUCHER_MAX_DURATION_DAYS
    && Number.isInteger(qty) && qty >= 1 && qty <= VOUCHER_MAX_QUANTITY
    && (!expiresAt || (/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) && expiresAt >= today))
    && label.length <= 200;

  const createM = useMutation({
    mutationFn: () => createVoucherBatch({
      offerCode, ministryId, durationDays, quantity: qty,
      expiresAt: expiresAt || null, label: label.trim() || null,
    }),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["billing", "vouchers"] });
      push({ kind: "ok", title: t("billing.vouchers.createdToast"), msg: t("billing.vouchers.createdMsg", { count: b.quantity }) });
      onCreated(b);
    },
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const scope = offer ? offerScope(offer) : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t("billing.vouchers.createTitle")}
      sub={t("billing.vouchers.createSub")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!valid || createM.isPending} onClick={() => createM.mutate()}>
            {createM.isPending ? t("common.saving") : t("billing.vouchers.generate")}
          </Button>
        </>
      }
    >
      {offersLoading ? (
        <p style={{ margin: 0, color: "var(--ink-500)" }}>{t("common.loading")}</p>
      ) : offersError ? (
        <p style={{ margin: 0, color: "var(--ink-500)" }}>{errMsg(t, offersError)}</p>
      ) : planOffers.length === 0 ? (
        <p style={{ margin: 0, color: "var(--ink-500)" }}>{t("billing.manual.noPlan")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("billing.subs.offer")} hint={scope ? t(scope === "USER" ? "billing.vouchers.scopeUserHint" : "billing.vouchers.scopeLocalityHint") : undefined}>
              <Select value={offerCode} onChange={(e) => setOfferCode(e.target.value)}>
                {planOffers.map((o) => (
                  <option key={o.id} value={o.code}>
                    {o.name}{planSubtitle(t, o.planCode) ? ` — ${planSubtitle(t, o.planCode)}` : ""} · {t(`billing.scope.${offerScope(o) ?? "LOCALITY"}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("billing.subs.ministry")} hint={t("billing.vouchers.ministryHint")}>
              <Select value={ministryId} onChange={(e) => setMinistryId(e.target.value)}>
                <option value="">{t("billing.manual.pickMinistry")}</option>
                {(ministriesQ.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label={t("billing.vouchers.durationDays")} hint={t("billing.vouchers.durationHint")}>
              <Input type="number" min={1} max={VOUCHER_MAX_DURATION_DAYS} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </Field>
            <Field label={t("billing.vouchers.quantity")} hint={t("billing.vouchers.quantityHint", { max: VOUCHER_MAX_QUANTITY })}>
              <Input type="number" min={1} max={VOUCHER_MAX_QUANTITY} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <Field label={t("billing.vouchers.expiresAt")} hint={t("billing.vouchers.expiresHint")}>
              <Input type="date" min={today} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </Field>
          </div>
          <Field label={t("billing.vouchers.label")} hint={t("billing.vouchers.labelHint")}>
            <Input value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

/** D-OFF-08 — codes d'un lot (statut, utilisé par, le, abonnement, ville), export CSV, révocation d'un code non utilisé. */
function VoucherCodesModal({ batch, onClose }: { batch: VoucherBatch; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const qc = useQueryClient();
  const { push } = useToasts();
  const download = useDownload();
  const [status, setStatus] = useState<VoucherStatus | "">("");
  const [search, setSearch] = useState("");
  const [toRevoke, setToRevoke] = useState<VoucherCode | null>(null);

  const q = useQuery({ queryKey: ["billing", "vouchers", "codes", batch.id], queryFn: () => listVoucherCodes(batch.id) });

  const revokeM = useMutation({
    mutationFn: (c: VoucherCode) => revokeVoucher(c.code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing", "vouchers"] });
      setToRevoke(null);
      push({ kind: "ok", title: t("billing.vouchers.revokedToast"), msg: "" });
    },
    onError: (e) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(formatVoucherCode(code));
      push({ kind: "ok", title: t("billing.vouchers.copied"), msg: formatVoucherCode(code) });
    } catch {
      push({ kind: "error", title: t("common.failure"), msg: formatVoucherCode(code) });
    }
  };

  const needle = search.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const rows = useMemo(() => (q.data ?? [])
    .filter((c) => !status || c.status === status)
    .filter((c) => !needle || c.code.replace(/[^A-Za-z0-9]/g, "").toUpperCase().includes(needle)
      || (c.usedByName ?? "").toUpperCase().includes(search.trim().toUpperCase()))
    .map((c) => ({ ...c, _key: c.code })), [q.data, status, needle, search]);

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={batch.label || batch.offerName}
        sub={t("billing.vouchers.batchSub", {
          offer: batch.offerName, ministry: batch.ministryName,
          days: t("billing.vouchers.days", { count: batch.durationDays }),
          used: batch.usedCount, quantity: batch.quantity,
        })}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>
            <Button variant="primary" iconL={<Icons.Download size={14} />} onClick={() => download(() => exportVoucherCodesCsv(batch))}>
              {t("billing.vouchers.csv")}
            </Button>
          </>
        }
      >
        {batchExpired(batch) && (
          <div style={{ marginBottom: 10 }}><Badge tone="gray">{t("billing.vouchers.expiredHint", { date: fmtDay(batch.expiresAt, locale) })}</Badge></div>
        )}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
          <Field label={t("billing.subs.search")}>
            <Input icon={<Icons.Search size={14} />} placeholder={t("billing.vouchers.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <Field label={t("billing.subs.status")}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as VoucherStatus | "")}>
              <option value="">{t("billing.all")}</option>
              {VOUCHER_STATUSES.map((x) => <option key={x} value={x}>{t(`billing.vouchers.status.${x}`)}</option>)}
            </Select>
          </Field>
        </div>
        {q.isLoading ? (
          <div style={{ color: "var(--ink-500)" }}>{t("common.loading")}</div>
        ) : q.isError ? (
          <div style={{ color: "var(--ink-500)" }}>{errMsg(t, q.error)}</div>
        ) : (
          <Table
            rows={rows}
            columns={[
              {
                label: t("billing.vouchers.code"),
                render: (c: VoucherCode) => (
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono, monospace)", whiteSpace: "nowrap" }}>{formatVoucherCode(c.code)}</span>
                    <IconButton icon={<Icons.Copy size={14} />} title={t("billing.vouchers.copy")} onClick={() => copy(c.code)} />
                  </span>
                ),
              },
              { label: t("billing.subs.status"), render: (c: VoucherCode) => <Badge tone={voucherTone(c.status)} dot>{t(`billing.vouchers.status.${c.status}`)}</Badge> },
              { label: t("billing.vouchers.usedBy"), render: (c: VoucherCode) => c.usedByName ?? "—" },
              { label: t("billing.vouchers.usedAt"), render: (c: VoucherCode) => fmtDateTime(c.usedAt, locale) },
              {
                label: t("billing.vouchers.subscription"),
                render: (c: VoucherCode) => c.subscriptionReference
                  ? <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{c.subscriptionReference}</span>
                  : "—",
              },
              { label: t("billing.subs.city"), render: (c: VoucherCode) => c.localityName ?? "—" },
              {
                label: "",
                render: (c: VoucherCode) => c.status === "ACTIVE" ? (
                  <Button size="sm" variant="ghost" onClick={() => setToRevoke(c)}>{t("billing.vouchers.revoke")}</Button>
                ) : null,
              },
            ]}
          />
        )}
      </Modal>

      <Modal
        open={!!toRevoke}
        onClose={() => setToRevoke(null)}
        title={t("billing.vouchers.revokeTitle")}
        sub={toRevoke ? formatVoucherCode(toRevoke.code) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToRevoke(null)}>{t("common.cancel")}</Button>
            <Button variant="danger" disabled={revokeM.isPending} onClick={() => toRevoke && revokeM.mutate(toRevoke)}>{t("billing.vouchers.revoke")}</Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{t("billing.vouchers.revokeBody")}</p>
      </Modal>
    </>
  );
}
