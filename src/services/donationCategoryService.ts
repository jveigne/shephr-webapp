import { apiFetch } from "./api";

/**
 * Lot T5 (JP 14/09) — référentiel des RUBRIQUES DE DON.
 *
 * Décision D0-5 (§6 de `shephr-app/docs/donations-etat-des-lieux.md`) : **une liste par
 * ministère**, valable dans toutes ses assemblées. D'où le `ministryId` obligatoire ici : le
 * back-office est cross-tenant, il doit toujours dire de quelle liste il parle.
 *
 * Remplace le mock `CATEGORIES` de `@/data/mock` sur lequel l'onglet « Devises et catégories »
 * tournait : identifiants `c-${Date.now()}` fabriqués localement, aucun appel réseau, et des
 * libellés (« Offrande générale », « Reconnaissance ») qui ne correspondaient à aucune des 6 clés
 * réellement en service côté mobile. **Le serveur fait foi.**
 *
 * Lecture ouverte à tout membre du ministère (l'app mobile la consomme) ; écriture réservée
 * SECRETARIAT / SUPER_ADMIN — le paramétrage est un acte de gouvernance, pas de trésorerie.
 */

/** Mirrors com.excellence.back.donation.category.dto.DonationCategoryResponse */
export interface DonationCategoryResponse {
  id: string;
  ministryId: string;
  /**
   * Clé technique stable et **immuable** : c'est elle que porte `don_donation.category`, et donc
   * elle qui rattache tout l'historique. Le serveur la dérive du libellé à la création
   * (« Action de grâce » → `action_de_grace`) ; aucun écran ne la modifie.
   */
  code: string;
  /** Libellé français. */
  name: string;
  /** Libellé anglais ; `null` → les clients retombent sur `name`. */
  nameEn: string | null;
  active: boolean;
  displayOrder: number;
  /** Au moins une déclaration la référence : elle ne se supprime plus, elle se désactive. */
  inUse: boolean;
  createdAt: string;
  updatedAt: string | null;
}

/** Mirrors com.excellence.back.donation.category.dto.DonationCategoryCreateRequest */
export interface DonationCategoryCreateRequest {
  /** Facultatif : dérivé du libellé français par le serveur quand il est absent. */
  code?: string;
  name: string;
  nameEn?: string;
  displayOrder?: number;
  active?: boolean;
}

/** Mirrors com.excellence.back.donation.category.dto.DonationCategoryUpdateRequest */
export interface DonationCategoryUpdateRequest {
  name?: string;
  nameEn?: string;
  active?: boolean;
  displayOrder?: number;
}

/** `includeInactive` : le back-office doit voir les rubriques retirées pour pouvoir les réactiver. */
export function listDonationCategories(
  ministryId: string,
  includeInactive = true,
): Promise<DonationCategoryResponse[]> {
  const qs = new URLSearchParams({ ministryId });
  if (includeInactive) qs.set("includeInactive", "true");
  return apiFetch<DonationCategoryResponse[]>(`/api/church/donations/categories?${qs.toString()}`);
}

export function createDonationCategory(
  ministryId: string,
  body: DonationCategoryCreateRequest,
): Promise<DonationCategoryResponse> {
  return apiFetch<DonationCategoryResponse>(
    `/api/church/donations/categories?ministryId=${encodeURIComponent(ministryId)}`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function updateDonationCategory(
  id: string,
  body: DonationCategoryUpdateRequest,
): Promise<DonationCategoryResponse> {
  return apiFetch<DonationCategoryResponse>(`/api/church/donations/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * Supprime une rubrique **jamais utilisée**. Sur une rubrique déjà déclarée, le serveur renvoie
 * `422 CATEGORY_IN_USE` : l'écran doit alors proposer la DÉSACTIVATION, qui la retire de la saisie
 * sans faire de trou dans l'historique des dons.
 */
export function deleteDonationCategory(id: string): Promise<void> {
  return apiFetch<void>(`/api/church/donations/categories/${id}`, { method: "DELETE" });
}
