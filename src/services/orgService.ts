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
// `ministryId` FACULTATIF : sans lui, le backend renvoie tous les ministères pour un SUPER_ADMIN
// (`getEffectiveMinistryFilter()` vaut null). On omet alors le paramètre plutôt que de l'envoyer
// vide — c'est ce qui permet à la page Utilisateurs de fonctionner sur « Tous les ministères ».
const q = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const s = search.toString();
  return s ? `?${s}` : "";
};

export function listCountriesFull(ministryId?: string): Promise<CountryRow[]> {
  return apiFetch<CountryRow[]>(`/api/org/admin/countries${q({ ministryId })}`);
}
export function listZonesFull(countryId?: string): Promise<ZoneRow[]> {
  return apiFetch<ZoneRow[]>(`/api/org/admin/zones${q({ countryId })}`);
}
export function listLocalitiesFull(ministryId?: string): Promise<LocalityRow[]> {
  return apiFetch<LocalityRow[]>(`/api/org/admin/localities${q({ ministryId })}`);
}
export function listUnitsFull(ministryId?: string): Promise<UnitRow[]> {
  return apiFetch<UnitRow[]>(`/api/org/admin/units${q({ ministryId })}`);
}

/**
 * Structure complète, prête pour l'arbre (avec les lignes brutes en `data`).
 *
 * <p>Sans `ministryId`, on prend la structure de TOUS les ministères (vue cross-tenant du
 * back-office). Dans ce cas les régions se chargent en une seule requête : une requête par nation
 * sur l'ensemble de la plateforme serait un N+1 sans rapport avec le besoin.
 */
export async function fetchMinistryStructure(ministryId?: string): Promise<OrgData & {
  countries: CountryRow[]; zones: ZoneRow[]; localities: LocalityRow[]; units: UnitRow[];
}> {
  const scoped = ministryId || undefined;
  const countries = await listCountriesFull(scoped);
  const zones = scoped
    ? (await Promise.all(countries.map((c) => listZonesFull(c.id)))).flat()
    : await listZonesFull();
  const [localities, units] = await Promise.all([
    listLocalitiesFull(scoped),
    listUnitsFull(scoped),
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

// ---- Historiques de structure (palier C4 : créations · JP 16/08 : changements d'assemblée) ----

/** Rôles par module — mêmes valeurs que `userService.ModuleRole` (dupliqué ici pour ne pas coupler les deux services). */
export type AssemblyCreatorRole =
  | "MEMBRE" | "DIRIGEANT_UNITE" | "DIRIGEANT" | "DIRIGEANT_SENIOR"
  | "DIRIGEANT_COORDINATEUR" | "LEADER" | "SECRETARIAT";

/**
 * Filtres communs aux DEUX historiques : mêmes paramètres, même garde serveur
 * (`HistoryScopeGuard` : SUPER_ADMIN partout, SECRETARIAT — Objectifs OU Dons — sur son seul
 * ministère ; un `ministryId` étranger est un 403, pas un repli silencieux).
 *
 * ⚠ Aucun `sort` : le tri est figé côté SQL (créations `createdAt desc`, changements
 * `changedAt desc`). En envoyer un ne ferait que s'ajouter derrière, sans effet utile.
 */
export interface HistoryQuery {
  ministryId?: string;
  countryId?: string;
  zoneId?: string;
  localityId?: string;
  /** Base 0. */
  page?: number;
  size?: number;
}

const historyParams = (params: HistoryQuery): string => {
  const p = new URLSearchParams();
  if (params.ministryId) p.set("ministryId", params.ministryId);
  if (params.countryId) p.set("countryId", params.countryId);
  if (params.zoneId) p.set("zoneId", params.zoneId);
  if (params.localityId) p.set("localityId", params.localityId);
  p.set("page", String(params.page ?? 0));
  p.set("size", String(params.size ?? 25));
  return p.toString();
};

// Mirrors com.excellence.back.org.admin.unit.dto.AssemblyCreationResponse
export interface AssemblyCreationRow {
  unitId: string;
  name: string;
  cityName: string | null;
  regionName: string | null;
  nationName: string | null;
  /** Instant ISO. */
  createdAt: string;
  createdById: string | null;
  /** JP 14/08 (palier C4) : null pour les assemblées créées AVANT la migration org/18 — afficher « — ». */
  createdByName: string | null;
  createdByRole: AssemblyCreatorRole | null;
}

/** Page renvoyée par Spring Data (mêmes champs que `UserPage`, cf. userService). */
export interface AssemblyCreationPage {
  content: AssemblyCreationRow[];
  totalElements: number;
  totalPages: number;
  /** Index de la page courante, base 0. */
  number: number;
  first: boolean;
  last: boolean;
}

/**
 * Historique des créations d'assemblées, plus récentes d'abord (tri porté par le backend).
 *
 * <p>`ministryId` facultatif : sans lui le SUPER_ADMIN voit tous les ministères. La garde serveur
 * (SUPER_ADMIN ou SECRETARIAT sur son seul ministère) reste la seule autorité — le filtre d'écran
 * n'est qu'un confort de lecture.
 *
 * <p>Les filtres géographiques portent sur le lieu de l'assemblée CRÉÉE. Une ville sans région
 * (`zoneId` nullable en base) ne remonte volontairement pas sur un filtre région ou nation.
 */
export function listAssemblyHistory(params: HistoryQuery): Promise<AssemblyCreationPage> {
  return apiFetch<AssemblyCreationPage>(`/api/org/admin/units/history?${historyParams(params)}`);
}

// ---- Historique des changements d'assemblée (JP 16/08) ----

/**
 * Qui a écrit la ligne : `SELF` = la personne s'est déplacée elle-même (RG-BQ-13) · `ADMIN` = le
 * secrétariat / le back-office l'a déplacée (RG-BQ-09).
 *
 * Mirrors com.excellence.back.org.unit.history.AssemblyChangeSource
 */
export type AssemblyChangeSource = "SELF" | "ADMIN";

/**
 * Mirrors com.excellence.back.org.admin.unit.dto.AssemblyChangeResponse
 *
 * <p>Se lit comme une phrase : « le 16/08, Marie Dupont est passée de Bethel à Siloé (Douala,
 * Littoral, Cameroun) — déplacée par le secrétariat ».
 *
 * <p>Noms de LIEUX : ceux enregistrés au moment du déplacement (une ville renommée ne réécrit pas
 * le passé). Noms de PERSONNES : les noms d'aujourd'hui, résolus à la lecture — `null` si le compte
 * a été supprimé depuis.
 */
export interface AssemblyChangeRow {
  id: string;

  userId: string;
  userName: string | null;

  /** `null` = premier rattachement (la personne n'était nulle part) — afficher « — ». */
  fromUnitId: string | null;
  fromUnitName: string | null;
  toUnitId: string;
  toUnitName: string | null;

  /** Lieu de l'assemblée d'ARRIVÉE — ce sont ces trois ids que les filtres attaquent. */
  localityId: string | null;
  cityName: string | null;
  zoneId: string | null;
  regionName: string | null;
  countryId: string | null;
  nationName: string | null;

  /** Instant ISO. */
  changedAt: string;
  changedById: string | null;
  /** Identique à `userName` quand `source === "SELF"`. */
  changedByName: string | null;
  source: AssemblyChangeSource;
  ministryId: string | null;
}

/** Page renvoyée par Spring Data (mêmes champs que `AssemblyCreationPage`). */
export interface AssemblyChangePage {
  content: AssemblyChangeRow[];
  totalElements: number;
  totalPages: number;
  /** Index de la page courante, base 0. */
  number: number;
  first: boolean;
  last: boolean;
}

/**
 * Historique des changements d'assemblée, plus récents d'abord.
 *
 * <p>⚠ Les filtres géographiques portent sur l'assemblée d'ARRIVÉE : « les changements de ma
 * région » = les personnes qui y sont ARRIVÉES. Un filtre « départ » n'existe pas côté serveur — ne
 * pas réinterpréter celui-ci.
 */
export function listAssemblyChanges(params: HistoryQuery): Promise<AssemblyChangePage> {
  return apiFetch<AssemblyChangePage>(
    `/api/org/admin/units/history/assembly-changes?${historyParams(params)}`,
  );
}
