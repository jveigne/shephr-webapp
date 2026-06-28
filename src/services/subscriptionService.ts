import { apiFetch } from "./api";

// ---- Modules (catalogue) — mirrors subscription/admin/module/dto/ModuleResponse ----
export interface ModuleResponse {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  description: string | null;
  descriptionEn: string | null;
  free: boolean;
  enabled: boolean;
  displayOrder: number;
  icon: string | null;
}

export function listModules(): Promise<ModuleResponse[]> {
  return apiFetch<ModuleResponse[]>("/admin/modules");
}

export function updateModule(
  code: string,
  patch: Partial<Pick<ModuleResponse, "free" | "enabled" | "displayOrder">>,
): Promise<ModuleResponse> {
  return apiFetch<ModuleResponse>(`/admin/modules/${code}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ---- Subscriptions — mirrors subscription/admin/subscription/dto ----
export type SubscriptionScope = "MINISTRY" | "COUNTRY" | "ZONE" | "LOCALITY" | "UNIT";
export type SubscriptionStatus = "ACTIVE" | "SUSPENDED" | "EXPIRED";
export type SubscriptionTier = "P1" | "P2" | "P3" | "P4";
export type PricingZone = "A" | "B" | "C" | "D";
export type BillingPeriod = "MONTHLY" | "ANNUAL";

export interface SubscriptionResponse {
  id: string;
  ministryId: string | null;
  moduleCodes: string[];
  scope: SubscriptionScope;
  scopeEntityId: string;
  status: SubscriptionStatus;
  effectiveStatus: SubscriptionStatus;
  tier: SubscriptionTier | null;
  pricingZone: PricingZone | null;
  cmci: boolean;
  priceAmount: number | null;
  priceCurrency: string | null;
  billingPeriod: BillingPeriod | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  deactivatedAt: string | null;
}

export interface CreateSubscriptionRequest {
  moduleCodes: string[];
  ministryId: string;
  scope: SubscriptionScope;
  scopeEntityId: string;
  tier?: SubscriptionTier | null;
  pricingZone?: PricingZone | null;
  cmci: boolean;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  billingPeriod?: BillingPeriod | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
}

export function listSubscriptions(params?: {
  ministryId?: string;
  moduleCode?: string;
  status?: SubscriptionStatus;
}): Promise<SubscriptionResponse[]> {
  const qs = new URLSearchParams();
  if (params?.ministryId) qs.set("ministryId", params.ministryId);
  if (params?.moduleCode) qs.set("moduleCode", params.moduleCode);
  if (params?.status) qs.set("status", params.status);
  const q = qs.toString();
  return apiFetch<SubscriptionResponse[]>(`/admin/subscriptions${q ? `?${q}` : ""}`);
}

export function createSubscription(req: CreateSubscriptionRequest): Promise<SubscriptionResponse> {
  return apiFetch<SubscriptionResponse>("/admin/subscriptions", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function suspendSubscription(id: string): Promise<SubscriptionResponse> {
  return apiFetch<SubscriptionResponse>(`/admin/subscriptions/${id}/deactivate`, { method: "POST" });
}

/** Réactive un abonnement suspendu/expiré avec une nouvelle date de validité (endDate obligatoire). */
export function reactivateSubscription(
  id: string,
  body: { endDate: string; startDate?: string },
): Promise<SubscriptionResponse> {
  return apiFetch<SubscriptionResponse>(`/admin/subscriptions/${id}/reactivate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---- Pricing (devis) — mirrors subscription/pricing/dto ----
export interface ModulePriceLine {
  moduleCode: string;
  baseAmount: number | null;
  currency: string | null;
  billingPeriod: BillingPeriod | null;
  cmciApplied: boolean;
  cumulApplied: boolean;
  finalAmount: number | null;
  onQuote: boolean;
}

export interface PricingQuoteResponse {
  memberCount: number;
  tier: SubscriptionTier;
  zone: PricingZone;
  cmci: boolean;
  lines: ModulePriceLine[];
}

export function pricingQuote(req: {
  scope: SubscriptionScope;
  scopeEntityId: string;
  moduleCodes: string[];
  zone: PricingZone;
  cmci: boolean;
}): Promise<PricingQuoteResponse> {
  return apiFetch<PricingQuoteResponse>("/admin/pricing/quote", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ---- Org entities (pickers) ----
export interface OrgEntityOption {
  id: string;
  label: string;
}

export function listCountries(ministryId: string): Promise<OrgEntityOption[]> {
  return apiFetch<Array<{ id: string; name: string; code: string }>>(
    `/api/org/admin/countries?ministryId=${ministryId}`,
  ).then((rows) => rows.map((r) => ({ id: r.id, label: `${r.name} (${r.code})` })));
}

export function listZones(countryId: string): Promise<OrgEntityOption[]> {
  return apiFetch<Array<{ id: string; name: string }>>(`/api/org/admin/zones?countryId=${countryId}`).then(
    (rows) => rows.map((r) => ({ id: r.id, label: r.name })),
  );
}

export function listLocalities(ministryId: string): Promise<OrgEntityOption[]> {
  return apiFetch<Array<{ id: string; name: string; zoneName: string | null }>>(
    `/api/org/admin/localities?ministryId=${ministryId}`,
  ).then((rows) => rows.map((r) => ({ id: r.id, label: r.zoneName ? `${r.name} — ${r.zoneName}` : r.name })));
}

export function listUnits(ministryId: string): Promise<OrgEntityOption[]> {
  return apiFetch<Array<{ id: string; name: string; localityName: string | null }>>(
    `/api/org/admin/units?ministryId=${ministryId}`,
  ).then((rows) => rows.map((r) => ({ id: r.id, label: r.localityName ? `${r.name} — ${r.localityName}` : r.name })));
}

// ---- Org hierarchy (avec IDs parents) — pour reconstruire l'arbre côté front ----
export interface OrgCountryNode { id: string; name: string; code: string }
export interface OrgZoneNode { id: string; name: string; countryId: string }
export interface OrgLocalityNode { id: string; name: string; zoneId: string | null }
export interface OrgUnitNode { id: string; name: string; localityId: string | null; type: string }

export interface MinistryOrg {
  countries: OrgCountryNode[];
  zones: OrgZoneNode[];
  localities: OrgLocalityNode[];
  units: OrgUnitNode[];
}

/** Charge toute la structure org d'un ministère (pays → zones → localités → unités). */
export async function fetchMinistryOrg(ministryId: string): Promise<MinistryOrg> {
  const countries = await apiFetch<Array<{ id: string; name: string; code: string }>>(
    `/api/org/admin/countries?ministryId=${ministryId}`,
  );
  const zonesNested = await Promise.all(
    countries.map((c) =>
      apiFetch<Array<{ id: string; name: string; countryId: string }>>(
        `/api/org/admin/zones?countryId=${c.id}`,
      ),
    ),
  );
  const [localities, units] = await Promise.all([
    apiFetch<Array<{ id: string; name: string; zoneId: string | null }>>(
      `/api/org/admin/localities?ministryId=${ministryId}`,
    ),
    apiFetch<Array<{ id: string; name: string; localityId: string | null; type: string }>>(
      `/api/org/admin/units?ministryId=${ministryId}`,
    ),
  ]);
  return {
    countries: countries.map((c) => ({ id: c.id, name: c.name, code: c.code })),
    zones: zonesNested.flat().map((z) => ({ id: z.id, name: z.name, countryId: z.countryId })),
    localities: localities.map((l) => ({ id: l.id, name: l.name, zoneId: l.zoneId })),
    units: units.map((u) => ({ id: u.id, name: u.name, localityId: u.localityId, type: u.type })),
  };
}
