import { apiFetch } from "./api";
import type { BrandingColors } from "@/utils/brandingPalette";

// D-PAYS-02 (JP 11/11, lot « conf-pays ») — la configuration d'un pays (nom affiché, nom court, 10 couleurs, texte
// d'accueil FR / EN, lien du site, active) est une DONNÉE saisie ici par le SUPER_ADMIN : la changer ne demande
// aucune publication sur les stores. D-PAYS-03 : le logo n'est PAS ici (fichier intégré aux apps). D-PAYS-04 : la
// mise en place se paie hors application ; cocher « Active » est le seul geste. D-PAYS-08 : aucune police.
// Pas de suppression ni d'historique (spec §6.3) : désactiver = `active: false`.
// Contrat : cmfipraise-backend/docs/shephr/11_11_2026/02_Contrat_API_Configuration_Pays.md §4.1 / §4.3.
// Garde `/admin/**` = SUPER_ADMIN (existante).

export type { BrandingColors };

// Mirrors com.excellence.back.org.branding.CountryBrandingDtos.WelcomeText — title ≤ 80, text ≤ 280.
export interface WelcomeText {
  title: string;
  text: string;
}

// Mirrors com.excellence.back.org.branding.CountryBrandingDtos.BrandingWelcome — FR obligatoire, EN facultatif.
export interface BrandingWelcome {
  fr: WelcomeText;
  en: WelcomeText | null;
}

// Mirrors com.excellence.back.org.branding.CountryBrandingDtos.CountryBranding (configuration servie aux apps).
export interface CountryBranding {
  /** ISO 3166-1 alpha-2, majuscules (`UPPER(org_country.code)`). */
  countryIso: string;
  /** ≤ 60 — remplace « Shephr » dans l'en-tête et l'accueil des apps (pas dans les e-mails ni les factures). */
  displayName: string;
  /** ≤ 16 — barres étroites. */
  shortName: string;
  /** RG-PAYS-08 — clés exactes du §4.2 de la spec, valeurs « #RRGGBB » normalisées en majuscules par le serveur. */
  colors: BrandingColors;
  welcome: BrandingWelcome;
  /** https:// seulement ; null = aucun lien. */
  websiteUrl: string | null;
  /** + 1 à chaque PUT (cache des apps, ETag « {ISO}-{version} »). */
  version: number;
  /** Instant ISO 8601. */
  updatedAt: string;
}

// Mirrors com.excellence.back.org.branding.CountryBrandingDtos.AdminCountryBrandingRow — une ligne par pays ACTIF de
// la CMCI, configuré ou non (tri serveur : configurés d'abord puis nom).
export interface AdminCountryBrandingRow {
  countryIso: string;
  countryNodeId: string;
  countryName: string;
  configured: boolean;
  active: boolean;
  version: number | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

// Mirrors com.excellence.back.org.branding.CountryBrandingDtos.AdminCountryBranding (active ou non).
export interface AdminCountryBranding extends CountryBranding {
  countryNodeId: string;
  countryName: string;
  active: boolean;
  updatedByName: string | null;
}

// Mirrors com.excellence.back.org.branding.CountryBrandingDtos.CountryBrandingRequest — PUT = crée (version 1) ou
// remplace (version + 1). Validation serveur (400 `validationErrors`) : displayName 1..60, shortName 1..16 (après trim),
// couleurs `^#[0-9A-Fa-f]{6}$`, welcome.fr.title 1..80, welcome.fr.text 1..280, welcome.en entier ou absent,
// websiteUrl `https://…` ≤ 300 ou vide (= null).
export interface CountryBrandingRequest {
  active: boolean;
  displayName: string;
  shortName: string;
  colors: BrandingColors;
  welcome: { fr: WelcomeText; en?: WelcomeText | null };
  websiteUrl?: string | null;
}

/** §4.3 — tous les pays actifs de la CMCI, configurés ou non. */
export function listCountryBrandings(): Promise<AdminCountryBrandingRow[]> {
  return apiFetch<AdminCountryBrandingRow[]>("/admin/country-branding");
}

/**
 * §4.3 — configuration d'un pays (active ou non). 404 `BRANDING_NOT_FOUND` = jamais configuré (le formulaire s'ouvre
 * vide, prérempli de la palette Shephr) ; 404 `RESOURCE_NOT_FOUND` = pas un pays actif de la CMCI.
 */
export function getCountryBranding(countryIso: string): Promise<AdminCountryBranding> {
  return apiFetch<AdminCountryBranding>(`/admin/country-branding/${encodeURIComponent(countryIso)}`);
}

/**
 * §4.3 / §4.4 — enregistre la configuration. RG-PAYS-10 : configuration ACTIVE sous 4,5:1 sur une paire → 422
 * `BRANDING_CONTRAST_TOO_LOW` avec `details { foreground, background, ratio, minimum }` (contrôlé avant toute écriture) ;
 * une configuration inactive s'enregistre quels que soient les contrastes (brouillon).
 */
export function saveCountryBranding(countryIso: string, req: CountryBrandingRequest): Promise<AdminCountryBranding> {
  return apiFetch<AdminCountryBranding>(`/admin/country-branding/${encodeURIComponent(countryIso)}`, {
    method: "PUT",
    body: JSON.stringify(req),
  });
}
