import { apiFetch, apiFetchBlob } from "./api";

// D-ABO-15 (JP 23/10) — Facturation (abonnements PAYANTS, factures, offres, codes promo), routes
// `/admin/billing/**` (garde `/admin/**` = SUPER_ADMIN). Contrat : cmfipraise-backend
// docs/shephr/23_10_2026/02_Contrat_API_Abonnements.md §6 + §10.
// D-ABO-01 — rien ici ne touche l'accès aux modules (`sub_subscription`, page /abonnements) :
// l'abonnement payant est un objet de facturation à part.
// §1 — montants en CENTIMES, l'API ne formate jamais : le formatage est fait par la page.

// ---------- Miroirs du §10 (mêmes noms dans les trois fronts) ----------

// Mirrors com.excellence.back.billing.BillingDtos
export type BillingSubscriptionStatus = "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
/** D-ABO-03 — V1 : `MONTHLY` seul accepté par le serveur (`BILLING_PERIOD_UNSUPPORTED`). */
export type BillingPeriod = "MONTHLY" | "ANNUAL";
/** RG-ABO-03 — statut CALCULÉ par le serveur, jamais recalculé ici. */
export type PromoCodeStatus = "ACTIVE" | "DISABLED" | "UPCOMING" | "EXPIRED" | "EXHAUSTED";

// Mirrors com.excellence.back.billing.BillingDtos (§4.3)
export interface BillingSubscription {
  /** RG-ABO-09 — référence lisible `ABO-000001`, affichée partout. */
  reference: string;
  status: BillingSubscriptionStatus;
  offerName: string;
  listPriceCents: number;
  discountPercent: number | null;
  promoCode: string | null;
  /** RG-ABO-02 — prix figé à la souscription, prélevé chaque mois. */
  priceCents: number;
  currency: string;
  billingPeriod: BillingPeriod;
  ministryName: string | null;
  currentPeriodEnd: string | null;
  /** RG-ABO-07 — résiliation demandée, encore ACTIVE jusqu'à `currentPeriodEnd`. */
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  activatedAt: string | null;
  canceledAt: string | null;
}

// Mirrors com.excellence.back.billing.BillingDtos (§4.5)
export interface BillingInvoice {
  /** RG-ABO-11 — `{prefix}-{AAAA}-{000001}`, sans trou. */
  number: string;
  subscriptionReference: string;
  issuedAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalCents: number;
  netCents: number;
  vatCents: number;
  vatRate: number;
  currency: string;
  offerName: string;
  /** RG-ABO-16 / H3 — remboursement fait dans Stripe, seulement indiqué ici. */
  refundedCents: number;
}

// ---------- Types Admin* du §6 ----------

// Mirrors com.excellence.back.billing.BillingDtos.AdminOverview
export type BillingAlertKind = "PAST_DUE" | "AMOUNT_MISMATCH" | "EMAIL_FAILED";
export interface AdminBillingOverview {
  activeCount: number;
  pastDueCount: number;
  canceledThisMonth: number;
  /** Revenu mensuel récurrent (centimes). */
  mrrCents: number;
  collectedThisMonthCents: number;
  currency: string;
  alerts: { reference: string; kind: BillingAlertKind }[];
}

// Mirrors com.excellence.back.billing.BillingDtos.AdminOffer
export interface AdminOffer {
  id: string;
  /** RG-ABO-01 — slug `[a-z0-9-]{3,40}`, immuable (`BILLING_OFFER_CODE_IMMUTABLE`). */
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  /** TTC, centimes, > 0. */
  priceCents: number;
  currency: string;
  billingPeriod: BillingPeriod;
  vatRate: number;
  /** Archivée = `false` : plus proposée, les abonnements existants continuent à leur prix. */
  active: boolean;
  displayOrder: number;
  subscriptionCount: number;
}

// Mirrors com.excellence.back.billing.BillingDtos.OfferRequest — tout AdminOffer sauf id / subscriptionCount.
export type OfferRequest = Omit<AdminOffer, "id" | "subscriptionCount">;

// Mirrors com.excellence.back.billing.BillingDtos.AdminPromoCode
export interface AdminPromoCode {
  id: string;
  /** RG-ABO-03 — `[A-Z0-9-]{4,32}`, normalisé en majuscules, immuable. */
  code: string;
  /** 1–90. */
  percentOff: number;
  /** Inclus. */
  startsAt: string | null;
  /** Exclu. */
  endsAt: string | null;
  /** null = illimité. */
  maxRedemptions: number | null;
  redemptionCount: number;
  label: string | null;
  active: boolean;
  status: PromoCodeStatus;
  createdAt: string;
}

// Mirrors com.excellence.back.billing.BillingDtos.PromoCodeRequest
export interface PromoCodeRequest {
  code: string;
  percentOff: number;
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  label?: string | null;
}

/**
 * Adresse de facturation (instantané Stripe `customer_details`). Le §6 n'en fixe pas la forme :
 * chaîne ou objet (`line1`, `postalCode`…) sont tous deux affichés (§12, 23/10).
 */
export type BillingAddress = string | Record<string, string | null> | null;

// Mirrors com.excellence.back.billing.BillingDtos.AdminSubscription — le §4.3 + champs admin.
export interface AdminSubscription extends BillingSubscription {
  id: string;
  payerUserId: string;
  payerName: string | null;
  payerEmail: string | null;
  /** D-ABO-05 — ministère du payeur à la souscription, modifiable ; null = non lié. */
  ministryId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** RG-ABO-12 — montant payé ≠ prix figé (facture établie quand même, sur le payé). */
  amountMismatch: boolean;
  notes: string | null;
  billingAddress: BillingAddress;
}

// Mirrors com.excellence.back.billing.BillingDtos.AdminInvoice — le §4.5 + champs admin.
export interface AdminInvoice extends BillingInvoice {
  payerName: string | null;
  payerEmail: string | null;
  ministryName: string | null;
  promoCode: string | null;
  /** §7 — `listPriceCents − priceCents`. */
  discountCents: number;
  listPriceCents: number;
  stripeInvoiceId: string | null;
  /** §8 — null = email pas (encore) parti ; renvoi possible. */
  emailedAt: string | null;
}

// Mirrors com.excellence.back.billing.BillingDtos.AdminSubscriptionDetail
export interface AdminSubscriptionDetail extends AdminSubscription {
  invoices: AdminInvoice[];
}

/** Page Spring (`content`, `totalElements`, `totalPages`), `page` 0-based — comme `/api/church/admin/users`. */
export interface BillingPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
}

/**
 * PATCH `/subscriptions/{id}` — champ absent = inchangé ; `ministryId: null` EXPLICITE = délier
 * (D-ABO-05). Payeur inconnu → 422 `BILLING_PAYER_INVALID` (D-ABO-07 : le SUPER_ADMIN change le payeur).
 */
export interface AdminSubscriptionPatch {
  ministryId?: string | null;
  payerUserId?: string;
  notes?: string | null;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

const BASE = "/admin/billing";

// ---------- Vue d'ensemble ----------
export function getBillingOverview(): Promise<AdminBillingOverview> {
  return apiFetch<AdminBillingOverview>(`${BASE}/overview`);
}

// ---------- Offres ----------
export function listOffers(): Promise<AdminOffer[]> {
  return apiFetch<AdminOffer[]>(`${BASE}/offers`);
}
export function createOffer(req: OfferRequest): Promise<AdminOffer> {
  return apiFetch<AdminOffer>(`${BASE}/offers`, { method: "POST", body: JSON.stringify(req) });
}
export function updateOffer(id: string, req: OfferRequest): Promise<AdminOffer> {
  return apiFetch<AdminOffer>(`${BASE}/offers/${id}`, { method: "PUT", body: JSON.stringify(req) });
}
export function archiveOffer(id: string): Promise<unknown> {
  return apiFetch<unknown>(`${BASE}/offers/${id}/archive`, { method: "POST" });
}
export function activateOffer(id: string): Promise<unknown> {
  return apiFetch<unknown>(`${BASE}/offers/${id}/activate`, { method: "POST" });
}

// ---------- Codes promo ----------
export function listPromoCodes(): Promise<AdminPromoCode[]> {
  return apiFetch<AdminPromoCode[]>(`${BASE}/promo-codes`);
}
/** 422 `PROMO_CODE_DUPLICATE` si le code existe ; 400 si invalide. */
export function createPromoCode(req: PromoCodeRequest): Promise<AdminPromoCode> {
  return apiFetch<AdminPromoCode>(`${BASE}/promo-codes`, { method: "POST", body: JSON.stringify(req) });
}
export function updatePromoCode(id: string, req: PromoCodeRequest): Promise<AdminPromoCode> {
  return apiFetch<AdminPromoCode>(`${BASE}/promo-codes/${id}`, { method: "PUT", body: JSON.stringify(req) });
}
export function disablePromoCode(id: string): Promise<unknown> {
  return apiFetch<unknown>(`${BASE}/promo-codes/${id}/disable`, { method: "POST" });
}
export function enablePromoCode(id: string): Promise<unknown> {
  return apiFetch<unknown>(`${BASE}/promo-codes/${id}/enable`, { method: "POST" });
}
/** 422 `PROMO_CODE_IN_USE` si un abonnement l'utilise : le désactiver à la place. */
export function deletePromoCode(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/promo-codes/${id}`, { method: "DELETE" });
}
export function listPromoCodeSubscriptions(id: string): Promise<AdminSubscription[]> {
  return apiFetch<AdminSubscription[]>(`${BASE}/promo-codes/${id}/subscriptions`);
}

// ---------- Abonnements payants ----------
export interface SubscriptionQuery {
  status?: BillingSubscriptionStatus | "";
  ministryId?: string;
  /** Référence, nom ou email du payeur. */
  search?: string;
  page?: number;
  size?: number;
}
export function listBillingSubscriptions(q: SubscriptionQuery): Promise<BillingPage<AdminSubscription>> {
  return apiFetch<BillingPage<AdminSubscription>>(
    `${BASE}/subscriptions${qs({ status: q.status, ministryId: q.ministryId, search: q.search?.trim(), page: q.page ?? 0, size: q.size ?? 25 })}`,
  );
}
export function getBillingSubscription(id: string): Promise<AdminSubscriptionDetail> {
  return apiFetch<AdminSubscriptionDetail>(`${BASE}/subscriptions/${id}`);
}
export function patchBillingSubscription(id: string, patch: AdminSubscriptionPatch): Promise<AdminSubscription> {
  return apiFetch<AdminSubscription>(`${BASE}/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}
/**
 * D-ABO-11 — `immediately: false` = fin de la période payée. RG-ABO-08 : le statut est posé par
 * l'événement Stripe ; la réponse est l'état courant (souvent encore ACTIVE).
 * Déjà CANCELED → 422 `BILLING_SUBSCRIPTION_NOT_ACTIVE`.
 */
export function cancelBillingSubscription(id: string, immediately: boolean): Promise<AdminSubscription> {
  return apiFetch<AdminSubscription>(`${BASE}/subscriptions/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ immediately }),
  });
}

// ---------- Factures ----------
export interface InvoiceQuery {
  /** `YYYY-MM-DD`, fuseau Europe/Paris, inclus. */
  from?: string;
  /** `YYYY-MM-DD`, inclus. */
  to?: string;
  search?: string;
  page?: number;
  size?: number;
}
export function listInvoices(q: InvoiceQuery): Promise<BillingPage<AdminInvoice>> {
  return apiFetch<BillingPage<AdminInvoice>>(
    `${BASE}/invoices${qs({ from: q.from, to: q.to, search: q.search?.trim(), page: q.page ?? 0, size: q.size ?? 25 })}`,
  );
}
export function downloadInvoicePdf(number: string): Promise<{ blob: Blob; filename: string }> {
  return apiFetchBlob(`${BASE}/invoices/${encodeURIComponent(number)}/pdf`, `${number}.pdf`);
}
/** 202 — renvoie l'email avec PJ au payeur ACTUEL de l'abonnement. */
export function resendInvoice(number: string): Promise<unknown> {
  return apiFetch<unknown>(`${BASE}/invoices/${encodeURIComponent(number)}/resend`, { method: "POST" });
}
/** D-ABO-09 — export comptable CSV (`;`, décimales `,`, BOM). */
export function exportInvoicesCsv(from?: string, to?: string): Promise<{ blob: Blob; filename: string }> {
  const name = `factures${from ? `-${from}` : ""}${to ? `-${to}` : ""}.csv`;
  return apiFetchBlob(`${BASE}/invoices/export.csv${qs({ from, to })}`, name);
}
