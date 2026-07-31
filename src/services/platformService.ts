import { apiFetch } from "./api";

/**
 * Réglages de la plateforme (JP 31/07).
 *
 * <p>Mirrors com.excellence.back.core.settings.dto.ContactSettingsResponse.
 * Ces coordonnées sont celles de l'ÉDITEUR (JExcellence) : elles s'affichent dans l'app mobile,
 * dans l'espace web et sur les pages publiques (landing, suppression de compte). Réservé
 * SUPER_ADMIN côté backend.
 */
export interface ContactSettings {
  email: string;
  whatsappNumber: string;
  whatsappUrl: string;
}

export interface UpdateContactSettingsRequest {
  email: string;
  /** Format international SANS « + » ni séparateur (ex. 33754596796) — c'est ce qu'attend wa.me. */
  whatsappNumber: string;
}

export function fetchContactSettings(): Promise<ContactSettings> {
  return apiFetch<ContactSettings>("/admin/platform/contact");
}

export function updateContactSettings(payload: UpdateContactSettingsRequest): Promise<ContactSettings> {
  return apiFetch<ContactSettings>("/admin/platform/contact", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
