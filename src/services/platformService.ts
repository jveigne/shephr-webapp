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
  /** D-PAY-03 / RG-PAY-20, JP 28/10 : numéro WhatsApp du relais Mobile Money (paiement des offres), `null` s'il n'est pas configuré. */
  paymentWhatsappNumber: string | null;
  /** RG-PAY-22, JP 28/10 : `https://wa.me/<numéro>` calculé par le serveur, `null` sans numéro (bouton Mobile Money masqué sur /offres). */
  paymentWhatsappUrl: string | null;
}

export interface UpdateContactSettingsRequest {
  email: string;
  /** Format international SANS « + » ni séparateur (ex. 33754596796) — c'est ce qu'attend wa.me. */
  whatsappNumber: string;
  /**
   * D-PAY-03 / RG-PAY-21, JP 28/10 : FACULTATIF. Absent / `null` = inchangé ; `""` = supprimé
   * (bouton Mobile Money masqué) ; sinon 8 à 15 chiffres sans « + » (400 hors de ce format).
   */
  paymentWhatsappNumber?: string | null;
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
