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
// P-11 / O12 (JP 27/10, lot « Offres Caleb / Néhémie ») — l'ancienne tarification par zone A–D
// (`PricingZone`, palier `SubscriptionTier`, remise CMCI, devis `/admin/pricing/quote`) est retirée :
// une couverture `sub_subscription` est désormais un ACCORD (ex. ETUDE_SUIVI au niveau ministère /
// nation / région, D-ABO-28), sans grille de prix. Les colonnes `tier` / `pricing_zone` restent en base
// (pas de DROP) ; elles ne sont plus ni lues ni écrites ici.
// §3.7 + P-06 (JP 27/10) — `cmci` n'est PLUS une remise : c'est le marqueur « accord CMCI » qui seul permet à
// un accord d'ouvrir HIERARCHIE_SUIVI (droit de CHAÎNE, Caleb) — et seulement à la portée MINISTRY
// (`Subscription#grantsModule` : `scope == MINISTRY && cmci`). Un accord HIERARCHIE_SUIVI sans `cmci` ou
// hors ministère est enregistré mais n'ouvre RIEN. Voir `accordGrantsModule`.
export type BillingPeriod = "MONTHLY" | "ANNUAL";

export interface SubscriptionResponse {
  id: string;
  ministryId: string | null;
  moduleCodes: string[];
  scope: SubscriptionScope;
  scopeEntityId: string;
  status: SubscriptionStatus;
  effectiveStatus: SubscriptionStatus;
  /** Accord CMCI (`is_cmci`) — §3.7 / P-06 (JP 27/10) : seule condition, avec la portée MINISTRY, pour ouvrir HIERARCHIE_SUIVI. */
  cmci: boolean;
  /** Prix d'un accord, informatif (aucune grille, aucun calcul). */
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
  /** Accord CMCI — §3.7 / P-06 (JP 27/10). Primitif côté Java : absent = false. */
  cmci: boolean;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  billingPeriod?: BillingPeriod | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
}

/** Code de droit de CHAÎNE (Caleb) — miroir de `Subscription.HIERARCHIE_SUIVI`. */
export const HIERARCHIE_SUIVI = "HIERARCHIE_SUIVI";

/**
 * Miroir de `com.excellence.back.subscription.Subscription#grantsModule` (§3.7 + P-06, JP 27/10) : un accord ouvre
 * `code` s'il est effectivement actif et le porte ; pour HIERARCHIE_SUIVI, en plus, seulement à la portée MINISTRY
 * et si c'est un accord CMCI. Affichage seulement : le serveur reste juge.
 */
export function accordGrantsModule(s: SubscriptionResponse, code: string): boolean {
  if (s.effectiveStatus !== "ACTIVE" || !s.moduleCodes.includes(code)) return false;
  if (code === HIERARCHIE_SUIVI) return s.scope === "MINISTRY" && s.cmci;
  return true;
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

// ---- Exclusions de modules gratuits par ministère — D-OFF-01 (JP 27/10, lot « Offres Caleb / Néhémie ») ----
// `ASSEMBLY`, `EVENTS`, `DOCUMENTS`, `MEMBER_CARE` deviennent gratuits et OUVERTS PAR DÉFAUT à tous les
// ministères ; le SUPER_ADMIN peut DÉSACTIVER un module gratuit pour un ministère donné (option C) : une
// ligne `sub_module_exclusion (ministry_id, module_code)`. L'interrupteur global `sub_module.enabled` reste
// (il coupe pour tous). Exclure un module PAYANT → 422 `MODULE_EXCLUSION_NOT_FREE`.
// Plan : cmfipraise-backend docs/shephr/27_10_2026/05_Plan_Offres_Caleb_Nehemie.md §3.1, §4.

// Mirrors com.excellence.back.subscription.admin.module.dto.ModuleExclusionDtos.ModuleExclusion
export interface ModuleExclusion {
  ministryId: string;
  moduleCode: string;
  createdAt: string;
}

// Mirrors com.excellence.back.subscription.admin.module.dto.ModuleExclusionDtos.ModuleExclusionRequest
export interface ModuleExclusionRequest {
  ministryId: string;
  moduleCode: string;
}

/** Exclusions d'un ministère (module gratuit DÉSACTIVÉ pour lui). */
export function listModuleExclusions(ministryId: string): Promise<ModuleExclusion[]> {
  return apiFetch<ModuleExclusion[]>(`/admin/modules/exclusions?ministryId=${encodeURIComponent(ministryId)}`);
}

/** Désactive un module gratuit pour un ministère (crée l'exclusion ; idempotent). */
export function createModuleExclusion(ministryId: string, moduleCode: string): Promise<ModuleExclusion> {
  return apiFetch<ModuleExclusion>("/admin/modules/exclusions", {
    method: "PUT",
    body: JSON.stringify({ ministryId, moduleCode } satisfies ModuleExclusionRequest),
  });
}

/** Réactive un module gratuit pour un ministère (supprime l'exclusion). */
export function deleteModuleExclusion(ministryId: string, moduleCode: string): Promise<void> {
  return apiFetch<void>(
    `/admin/modules/exclusions?ministryId=${encodeURIComponent(ministryId)}&moduleCode=${encodeURIComponent(moduleCode)}`,
    { method: "DELETE" },
  );
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
export interface OrgLocalityNode { id: string; name: string; zoneId: string | null; teamId: string | null }
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
  const zones = zonesNested.flat();
  // Les teams sont dissoutes (Chantier B) : plus aucun contrôleur ne sert /api/org/admin/teams.
  // L'appel qui subsistait ici prenait un 404 et faisait rejeter tout le chargement de la
  // structure — l'arbre des abonnements affichait « pas encore de structure » pour TOUS les
  // ministères pourtant peuplés. Ces données n'étaient d'ailleurs jamais lues par buildTree.
  const [localities, units] = await Promise.all([
    apiFetch<Array<{ id: string; name: string; zoneId: string | null; teamId: string | null }>>(
      `/api/org/admin/localities?ministryId=${ministryId}`,
    ),
    apiFetch<Array<{ id: string; name: string; localityId: string | null; type: string }>>(
      `/api/org/admin/units?ministryId=${ministryId}`,
    ),
  ]);
  return {
    countries: countries.map((c) => ({ id: c.id, name: c.name, code: c.code })),
    zones: zones.map((z) => ({ id: z.id, name: z.name, countryId: z.countryId })),
    localities: localities.map((l) => ({ id: l.id, name: l.name, zoneId: l.zoneId, teamId: l.teamId })),
    units: units.map((u) => ({ id: u.id, name: u.name, localityId: u.localityId, type: u.type })),
  };
}
