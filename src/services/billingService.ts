import { apiFetch, apiFetchBlob } from "./api";

// D-ABO-15 (JP 23/10) — Facturation (abonnements PAYANTS, factures, offres, codes promo), routes
// `/admin/billing/**` (garde `/admin/**` = SUPER_ADMIN). Contrat : cmfipraise-backend
// docs/shephr/23_10_2026/02_Contrat_API_Abonnements.md §6 + §10.
// D-ABO-01 — rien ici ne touche l'accès aux modules (`sub_subscription`, page /abonnements) :
// l'abonnement payant est un objet de facturation à part.
// §1 — montants en CENTIMES, l'API ne formate jamais : le formatage est fait par la page.
// D-ABO-16..20 (JP 27/10, lot pro-plan PP-O1) — une offre peut être un PLAN (`planCode`, prix annuel,
// codes de droit) ; un abonnement de plan porte une ville (`localityId`) et une source STRIPE | MANUEL.
// D-ABO-17 : D-ABO-01 levée pour les SEULS plans (leurs codes ouvrent la ville) ; l'offre sans
// `planCode` n'ouvre toujours rien. Contrat : docs/shephr/27_10_2026/02_Contrat_API_Abonnement_Ville.md §6 + §10.3.
// D-ABO-31.. (JP 27/10, suite pro-plan « Suivi de ma hiérarchie ») — un plan a une PORTÉE (`planScope`) :
// `LOCALITY` (une ville, ex. EGLISE_VILLE) ou `USER` (personnelle : le bénéficiaire est le payeur, ex.
// DIRIGEANT_HIERARCHIE, code HIERARCHIE_SUIVI, axe CHAÎNE de leadership — jamais la géographie). Une
// souscription USER n'a pas de ville (`localityId` null) ; son bénéficiaire est `beneficiaryUserId`.
// D-OFF-08 (JP 27/10, lot « Offres Caleb / Néhémie ») — VOUCHERS (Afrique, Mobile Money) : le SUPER_ADMIN génère
// des lots de codes liés à UN ministère, pour UNE offre à formule (Caleb `DIRIGEANT_HIERARCHIE` ou Néhémie
// `EGLISE_VILLE`), d'une durée en jours qu'il fixe. Un code saisi (web seulement) crée ou prolonge un abonnement
// `source = VOUCHER` (règles de droit d'un MANUEL : jusqu'à `manualEndDate` incluse, aucune facture). Routes
// `/admin/billing/vouchers/**`. Plan : docs/shephr/27_10_2026/05_Plan_Offres_Caleb_Nehemie.md §3.6, §4.

// ---------- Miroirs du §10 (mêmes noms dans les trois fronts) ----------

// Mirrors com.excellence.back.billing.BillingDtos
export type BillingSubscriptionStatus = "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
/**
 * D-ABO-03 — `MONTHLY` pour une offre sans plan. D-ABO-18 (JP 27/10) : `ANNUAL` accepté pour un plan
 * qui a un `annualPriceCents` (sinon 422 `BILLING_PERIOD_UNSUPPORTED`).
 */
export type BillingPeriod = "MONTHLY" | "ANNUAL";
/**
 * D-ABO-20 (JP 27/10) — `STRIPE` (caisse web) ou `MANUEL` (activé au back-office, RG-ABO-29, aucune facture).
 * D-OFF-08 (JP 27/10) — `VOUCHER` : ouvert ou prolongé par un code saisi sur le web ; droits d'un MANUEL
 * (jusqu'à `manualEndDate` incluse), aucune facture, aucun Stripe.
 */
export type BillingSource = "STRIPE" | "MANUEL" | "VOUCHER";
/**
 * D-ABO-31 (JP 27/10) — portée d'un plan : `LOCALITY` = ville couverte ; `USER` = personnelle (le payeur seul).
 * Choisie à la création de l'offre, immuable. null = offre sans plan.
 */
export type PlanScope = "LOCALITY" | "USER";
/** RG-ABO-03 — statut CALCULÉ par le serveur, jamais recalculé ici. */
export type PromoCodeStatus = "ACTIVE" | "DISABLED" | "UPCOMING" | "EXPIRED" | "EXHAUSTED";

// Mirrors com.excellence.back.billing.BillingDtos.PayerSubscription (§4.3)
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
  // Lot pro-plan (contrat 27/10 §5.3, PayerSubscription +4 champs en fin) — mêmes champs que les miroirs
  // web / mobile (contrôle croisé 27/10) ; repris tels quels par `AdminSubscription`.
  /** D-ABO-19 (JP 27/10) — instantané du plan de l'offre ; null = offre sans plan (n'ouvre rien). */
  planCode: string | null;
  /** D-ABO-19 — ville couverte (nœud LOCALITY), null hors plan. */
  localityId: string | null;
  /** Nom COURANT de la ville ; affiché « {offerName} — {localityName} ». */
  localityName: string | null;
  source: BillingSource;
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
  /** D-ABO-20 (JP 27/10) — une ligne par offre à `planCode` : abonnements OUVRANT DROIT maintenant, par source. */
  plans: AdminPlanCount[];
}
/** Nom du contrat §10.3 (même objet que `AdminBillingOverview`, nom historique de ce dépôt). */
export type AdminOverview = AdminBillingOverview;

// Mirrors com.excellence.back.billing.BillingDtos.PlanCount
export interface AdminPlanCount {
  planCode: string;
  stripeEntitled: number;
  manualEntitled: number;
  /** D-OFF-08 (JP 27/10) — abonnements `VOUCHER` ouvrant droit. Facultatif : absent d'un serveur antérieur au lot. */
  voucherEntitled?: number;
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
  /** D-ABO-16 (JP 27/10) — code du plan (`[A-Z0-9_]{3,40}`, ex. `EGLISE_VILLE`), null = offre sans plan. Immuable. */
  planCode: string | null;
  /** D-ABO-18 — prix TTC annuel (centimes), plan seulement ; null = pas d'abonnement annuel. */
  annualPriceCents: number | null;
  /** D-ABO-16 — codes de droit (`sub_module.code`) ouverts par le plan, lus en direct ; [] hors plan. */
  entitlementCodes: string[];
  /**
   * D-ABO-31 (JP 27/10) — portée du plan (`LOCALITY` | `USER`), null hors plan. Immuable.
   * Absent d'un serveur antérieur : un plan sans portée se lit `LOCALITY` (seule portée d'alors).
   */
  planScope?: PlanScope | null;
  /**
   * D-OFF-08 (JP 27/10) — prix local, INFORMATION seulement (texte libre, ex. « 1 000 FCFA / mois ») : affiché
   * sur le web à côté du champ code (« Mobile Money auprès de votre relais — … »). Aucune devise FCFA dans
   * Stripe. null = rien d'affiché. Absent d'un serveur antérieur au lot.
   */
  localPriceLabel?: string | null;
}

// Mirrors com.excellence.back.billing.BillingDtos.OfferRequest — tout AdminOffer sauf id / subscriptionCount,
// champs plan facultatifs.
export interface OfferRequest extends Omit<AdminOffer, "id" | "subscriptionCount" | "planCode" | "annualPriceCents" | "entitlementCodes" | "planScope" | "localPriceLabel"> {
  /** Création seulement ; différent au PUT → 422 `BILLING_OFFER_CODE_IMMUTABLE`. */
  planCode?: string | null;
  /** D-ABO-31 (JP 27/10) — plan seulement, choisi à la création, immuable (renvoyé tel quel au PUT). */
  planScope?: PlanScope | null;
  /** Plan seulement (sinon 400 `INVALID_PARAMETER`). */
  annualPriceCents?: number | null;
  /** Plan seulement, ≥ 1 code ; code inconnu → 422 `BILLING_ENTITLEMENT_UNKNOWN`. */
  entitlementCodes?: string[];
  /** D-OFF-08 (JP 27/10) — texte libre informatif (≤ 80 caractères, `@Size(max = 80)`), null = aucun. */
  localPriceLabel?: string | null;
}

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
  // `planCode`, `localityId`, `localityName`, `source` : hérités de `BillingSubscription` (contrat 27/10 §5.3).
  /** RG-ABO-29 — `YYYY-MM-DD` (Europe/Paris, incluse), MANUEL seulement. */
  manualEndDate: string | null;
  /** D-ABO-20 — début de l'impayé ; le droit tient 14 jours après (grâce, RG-ABO-31). */
  pastDueSince: string | null;
  /** D-ABO-20 — droit ouvert MAINTENANT, calculé par le serveur (jamais recalculé ici). */
  entitled: boolean;
  /** D-ABO-31 (JP 27/10) — plan USER : le bénéficiaire (= le payeur) ; null pour une ville ou une offre sans plan. */
  beneficiaryUserId?: string | null;
  /** D-ABO-31 — nom courant du bénéficiaire d'un plan USER ; null sinon. */
  beneficiaryName?: string | null;
}

// Mirrors com.excellence.back.billing.BillingDtos.ManualSubscriptionRequest
/**
 * RG-ABO-29 (JP 27/10) — activation manuelle par le SUPER_ADMIN (source MANUEL).
 * - plan LOCALITY : `localityId` + `planCode` (inchangé) ;
 * - plan USER (D-ABO-31..) : `offerCode` + `userId` (le dirigeant bénéficiaire), `localityId` INTERDIT
 *   (422 `PERSONAL_PLAN_LOCALITY_FORBIDDEN`), `userId` manquant → 422 `BILLING_USER_REQUIRED`, compte inconnu
 *   ou d'un autre ministère que l'offre → 404. `planCode` est envoyé aussi (même offre), sans effet de bord.
 */
export interface ManualSubscriptionRequest {
  /** Plan LOCALITY seulement. */
  localityId?: string | null;
  planCode: string;
  /** D-ABO-31 — plan USER : code de l'offre (ex. `dirigeant-hierarchie`). */
  offerCode?: string;
  /** D-ABO-31 — plan USER : dirigeant bénéficiaire (devient le payeur). */
  userId?: string;
  /** Informatif, MONTHLY par défaut. */
  billingPeriod?: "MONTHLY" | "ANNUAL";
  /** `YYYY-MM-DD`, ≥ aujourd'hui (Europe/Paris) — sinon 400 `INVALID_PARAMETER`. */
  manualEndDate: string;
  /** Facultatif ; défaut serveur : le SUPER_ADMIN. */
  payerUserId?: string | null;
  notes?: string | null;
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
  /**
   * RG-ABO-29 (JP 27/10) — prolonge un MANUEL (`YYYY-MM-DD`, ≥ aujourd'hui) ; un MANUEL EXPIRED ou CANCELED
   * redevient ACTIVE. Abonnement Stripe → 422 `BILLING_SUBSCRIPTION_NOT_MANUAL`.
   */
  manualEndDate?: string;
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
  /** D-ABO-16 (JP 27/10) — égalité exacte ; `NONE` = offres sans plan. */
  planCode?: string;
  source?: BillingSource | "";
  localityId?: string;
  /** D-ABO-31 (JP 27/10) — portée du plan ; vide = toutes. */
  planScope?: PlanScope | "";
  page?: number;
  size?: number;
}
export function listBillingSubscriptions(q: SubscriptionQuery): Promise<BillingPage<AdminSubscription>> {
  return apiFetch<BillingPage<AdminSubscription>>(
    `${BASE}/subscriptions${qs({
      status: q.status, ministryId: q.ministryId, search: q.search?.trim(),
      planCode: q.planCode, source: q.source, localityId: q.localityId,
      planScope: q.planScope, page: q.page ?? 0, size: q.size ?? 25 })}`,
  );
}
/**
 * RG-ABO-29 (JP 27/10) — 201. Plan inconnu → 404 `BILLING_OFFER_NOT_FOUND` ; ville inconnue → 404
 * `RESOURCE_NOT_FOUND` ; date passée → 400 ; payeur inconnu → 422 `BILLING_PAYER_INVALID` ;
 * RG-ABO-30 → 422 `SUBSCRIPTION_ALREADY_ACTIVE`. Plan USER (D-ABO-31..) : voir `ManualSubscriptionRequest`.
 */
export function createManualSubscription(body: ManualSubscriptionRequest): Promise<AdminSubscription> {
  return apiFetch<AdminSubscription>(`${BASE}/subscriptions/manual`, { method: "POST", body: JSON.stringify(body) });
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
 * RG-ABO-29 (JP 27/10) — sur un MANUEL, sans Stripe : `immediately` → EXPIRED (droit fermé tout de suite),
 * sinon CANCELED (droit jusqu'à `manualEndDate`) ; déjà EXPIRED, ou CANCELED sans `immediately` → 422.
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

// ---------- Vouchers — D-OFF-08 (JP 27/10, lot « Offres Caleb / Néhémie », §3.6 + §4) ----------

/** Statut d'un code : `ACTIVE` (saisissable), `USED` (déjà saisi), `REVOKED` (révoqué au back-office). */
export type VoucherStatus = "ACTIVE" | "USED" | "REVOKED";

// Mirrors com.excellence.back.billing.BillingDtos.VoucherBatch
export interface VoucherBatch {
  id: string;
  /** Offre à formule du lot (Caleb `dirigeant-hierarchie` ou Néhémie `eglise-ville`). */
  offerCode: string;
  offerName: string;
  /** D-OFF-08 — chaque code est lié à UN ministère (422 `VOUCHER_WRONG_MINISTRY` sinon à la saisie). */
  ministryId: string;
  ministryName: string;
  /** Durée ouverte (ou ajoutée) par un code, en jours, fixée par le SUPER_ADMIN. */
  durationDays: number;
  /** Nombre de codes du lot (≤ 500). */
  quantity: number;
  usedCount: number;
  /**
   * Date limite de saisie, `LocalDate` Java `YYYY-MM-DD` INCLUSE (Europe/Paris) ; passée → 422 `VOUCHER_EXPIRED`.
   * null = sans limite.
   */
  expiresAt: string | null;
  label: string | null;
  createdAt: string;
}

// Mirrors com.excellence.back.billing.BillingDtos.VoucherCode
export interface VoucherCode {
  /** 12 caractères base32 sans ambiguïté (sans 0 / O / 1 / I) ; affiché `XXXX-XXXX-XXXX` par le front. */
  code: string;
  status: VoucherStatus;
  usedAt: string | null;
  usedByName: string | null;
  /** Référence `ABO-…` de l'abonnement VOUCHER créé ou prolongé. */
  subscriptionReference: string | null;
  /** Ville d'un code Néhémie, null pour Caleb (personnel). */
  localityName: string | null;
}

// Mirrors com.excellence.back.billing.BillingDtos.VoucherBatchRequest
export interface VoucherBatchRequest {
  /** Offre à formule (`planCode` non null) ; offre sans formule → 422. */
  offerCode: string;
  ministryId: string;
  /** 1 à 3 660 (`BillingVoucherBatch.MAX_DURATION_DAYS`). */
  durationDays: number;
  /** 1 à 500. */
  quantity: number;
  /**
   * `LocalDate` Java : `YYYY-MM-DD` (incluse, Europe/Paris, ≥ aujourd'hui — 400 `INVALID_PARAMETER` sinon),
   * facultatif. JAMAIS un instant ISO (contrôle croisé 27/10).
   */
  expiresAt?: string | null;
  label?: string | null;
}

/** `XXXXXXXXXXXX` → `XXXX-XXXX-XXXX` (affichage seulement ; la saisie se fait sans tiret ni casse). */
export function formatVoucherCode(code: string): string {
  const raw = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return raw.length === 12 ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}` : code;
}

export function listVoucherBatches(): Promise<VoucherBatch[]> {
  return apiFetch<VoucherBatch[]>(`${BASE}/vouchers/batches`);
}
/** 201 — génère `quantity` codes. */
export function createVoucherBatch(req: VoucherBatchRequest): Promise<VoucherBatch> {
  return apiFetch<VoucherBatch>(`${BASE}/vouchers/batches`, { method: "POST", body: JSON.stringify(req) });
}
export function listVoucherCodes(batchId: string): Promise<VoucherCode[]> {
  return apiFetch<VoucherCode[]>(`${BASE}/vouchers/batches/${encodeURIComponent(batchId)}/codes`);
}
/** Export CSV des codes d'un lot ; nom composé par le front (`Content-Disposition` non exposé en CORS). */
export function exportVoucherCodesCsv(batch: Pick<VoucherBatch, "id" | "createdAt">): Promise<{ blob: Blob; filename: string }> {
  const day = (batch.createdAt ?? "").slice(0, 10);
  return apiFetchBlob(
    `${BASE}/vouchers/batches/${encodeURIComponent(batch.id)}/codes.csv`,
    `vouchers${day ? `-${day}` : ""}-${batch.id.slice(0, 8)}.csv`,
  );
}
/** Révoque un code NON utilisé (un code `USED` → 422 `VOUCHER_ALREADY_USED`). */
export function revokeVoucher(code: string): Promise<VoucherCode> {
  const raw = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return apiFetch<VoucherCode>(`${BASE}/vouchers/${encodeURIComponent(raw)}/revoke`, { method: "POST" });
}
