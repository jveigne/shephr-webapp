import { apiFetch } from "./api";
import type { OrgData } from "@/lib/orgTree";

// ---- Continents (référentiel global) ----
export interface ContinentResponse {
  id: string;
  code: string;
  name: string;
  nameEn: string;
}
export function listContinents(): Promise<ContinentResponse[]> {
  return apiFetch<ContinentResponse[]>("/api/org/admin/continents");
}

// ---- Réponses org (champs complets pour l'édition) ----
export interface CountryRow {
  id: string;
  ministryId: string;
  continentId: string;
  code: string;
  name: string;
  nameEn: string;
  defaultCurrency: string;
  active: boolean;
}
export interface ZoneRow {
  id: string;
  countryId: string;
  name: string;
  description: string | null;
  active: boolean;
}
export interface LocalityRow {
  id: string;
  ministryId: string;
  zoneId: string | null;
  name: string;
  country: string | null;
}
export interface UnitRow {
  id: string;
  ministryId: string;
  localityId: string | null;
  name: string;
  type: "ASSEMBLY";
  active: boolean;
}

// ---- Lectures ----
export function listCountriesFull(ministryId: string): Promise<CountryRow[]> {
  return apiFetch<CountryRow[]>(`/api/org/admin/countries?ministryId=${ministryId}`);
}
export function listZonesFull(countryId: string): Promise<ZoneRow[]> {
  return apiFetch<ZoneRow[]>(`/api/org/admin/zones?countryId=${countryId}`);
}
export function listLocalitiesFull(ministryId: string): Promise<LocalityRow[]> {
  return apiFetch<LocalityRow[]>(`/api/org/admin/localities?ministryId=${ministryId}`);
}
export function listUnitsFull(ministryId: string): Promise<UnitRow[]> {
  return apiFetch<UnitRow[]>(`/api/org/admin/units?ministryId=${ministryId}`);
}

/** Structure complète d'un ministère, prête pour l'arbre (avec les lignes brutes en `data`). */
export async function fetchMinistryStructure(ministryId: string): Promise<OrgData & {
  countries: CountryRow[]; zones: ZoneRow[]; localities: LocalityRow[]; units: UnitRow[];
}> {
  const countries = await listCountriesFull(ministryId);
  const zonesNested = await Promise.all(countries.map((c) => listZonesFull(c.id)));
  const zones = zonesNested.flat();
  const [localities, units] = await Promise.all([
    listLocalitiesFull(ministryId),
    listUnitsFull(ministryId),
  ]);
  return { countries, zones, localities, units };
}

// ---- Créations ----
export function createCountry(body: {
  ministryId: string; continentId: string; code: string; name: string; nameEn: string; defaultCurrency: string;
}): Promise<CountryRow> {
  return apiFetch<CountryRow>("/api/org/admin/countries", { method: "POST", body: JSON.stringify(body) });
}
export function createZone(body: { countryId: string; name: string; description?: string }): Promise<ZoneRow> {
  return apiFetch<ZoneRow>("/api/org/admin/zones", { method: "POST", body: JSON.stringify(body) });
}
export function createLocality(body: {
  ministryId: string; zoneId?: string | null; name: string; country?: string;
}): Promise<LocalityRow> {
  return apiFetch<LocalityRow>("/api/org/admin/localities", { method: "POST", body: JSON.stringify(body) });
}
export function createUnit(body: {
  ministryId: string; localityId: string; name: string;
}): Promise<UnitRow> {
  // Chantier B (décision #5) : plus de type CENTER — toute unité est une assemblée de maison.
  return apiFetch<UnitRow>("/api/org/admin/units", { method: "POST", body: JSON.stringify({ ...body, type: "ASSEMBLY" }) });
}

// ---- Modifications ----
export function updateCountry(id: string, body: Partial<{
  continentId: string; name: string; nameEn: string; defaultCurrency: string; active: boolean;
}>): Promise<CountryRow> {
  return apiFetch<CountryRow>(`/api/org/admin/countries/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
export function updateZone(id: string, body: Partial<{ name: string; description: string; active: boolean }>): Promise<ZoneRow> {
  return apiFetch<ZoneRow>(`/api/org/admin/zones/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
export function updateLocality(id: string, body: Partial<{ name: string; country: string; zoneId: string }>): Promise<LocalityRow> {
  return apiFetch<LocalityRow>(`/api/org/admin/localities/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
export function updateUnit(id: string, body: Partial<{ localityId: string; name: string; active: boolean }>): Promise<UnitRow> {
  return apiFetch<UnitRow>(`/api/org/admin/units/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

// ---- Suppressions ----
export function deleteCountry(id: string): Promise<void> {
  return apiFetch<void>(`/api/org/admin/countries/${id}`, { method: "DELETE" });
}
export function deleteZone(id: string): Promise<void> {
  return apiFetch<void>(`/api/org/admin/zones/${id}`, { method: "DELETE" });
}
export function deleteLocality(id: string): Promise<void> {
  return apiFetch<void>(`/api/org/admin/localities/${id}`, { method: "DELETE" });
}
export function deleteUnit(id: string): Promise<void> {
  return apiFetch<void>(`/api/org/admin/units/${id}`, { method: "DELETE" });
}

// ---- Arbre générique (Chantier B) : libellé Région/État porté par le nœud NATION ----
export type RegionLabel = "REGION" | "STATE";
export interface OrgNodeRow {
  id: string;
  type: "NATION" | "REGION" | "CITY" | "ASSEMBLY";
  name: string;
  regionLabel: RegionLabel | null;
  leaderUserId: string | null;
}
/** Nœud NATION d'un pays (même id que le pays — reprise d'ids B1). */
export function getNationNode(countryId: string): Promise<OrgNodeRow> {
  return apiFetch<OrgNodeRow>(`/api/org/admin/nodes/${countryId}`);
}
export function listNationNodes(): Promise<OrgNodeRow[]> {
  return apiFetch<OrgNodeRow[]>(`/api/org/admin/nodes?type=NATION`);
}
export function updateNodeRegionLabel(nodeId: string, regionLabel: RegionLabel): Promise<OrgNodeRow> {
  return apiFetch<OrgNodeRow>(`/api/org/admin/nodes/${nodeId}`, { method: "PATCH", body: JSON.stringify({ regionLabel }) });
}
