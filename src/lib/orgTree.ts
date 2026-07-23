// Reconstruction de l'arbre organisationnel d'un ministère côté front,
// partagé par la page Abonnements (couverture des modules) et la page Structure (CRUD).

// Chantier B : arbre à 4 niveaux — les identifiants techniques restent alignés sur les scopes
// backend (COUNTRY=Nation, ZONE=Région/État, LOCALITY=Ville, UNIT=Assemblée de maison) ;
// le vocabulaire affiché vient de l'i18n. Le niveau TEAM est supprimé (teams dissoutes).
export type NodeLevel = "MINISTRY" | "COUNTRY" | "ZONE" | "LOCALITY" | "UNIT";

export interface TreeNode {
  id: string;
  level: NodeLevel;
  name: string;
  /** Ligne org brute (country/zone/locality/unit) — utile pour préremplir l'édition. */
  data?: any;
  children: TreeNode[];
}

export interface OrgData {
  countries: Array<{ id: string; name: string; code: string; [k: string]: any }>;
  zones: Array<{ id: string; name: string; countryId: string; [k: string]: any }>;
  localities: Array<{ id: string; name: string; zoneId: string | null; [k: string]: any }>;
  units: Array<{ id: string; name: string; localityId: string | null; [k: string]: any }>;
}

/** Tri alphabétique insensible aux accents et à la casse (é = e, etc.). */
export const byNameFr = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, "fr", { sensitivity: "base" });

export function buildTree(org: OrgData, ministryId: string, ministryName: string): TreeNode {
  const unitNode = (u: OrgData["units"][number]): TreeNode => ({ id: u.id, level: "UNIT", name: u.name, data: u, children: [] });
  const localityNode = (l: OrgData["localities"][number]): TreeNode => ({
    id: l.id, level: "LOCALITY", name: l.name, data: l,
    children: org.units.filter((u) => u.localityId === l.id).map(unitNode).sort(byNameFr),
  });
  const zoneNode = (z: OrgData["zones"][number]): TreeNode => ({
    id: z.id, level: "ZONE", name: z.name, data: z,
    children: org.localities.filter((l) => l.zoneId === z.id).map(localityNode).sort(byNameFr),
  });
  const countryNode = (c: OrgData["countries"][number]): TreeNode => ({
    id: c.id, level: "COUNTRY", name: `${c.name} (${c.code})`, data: c,
    children: org.zones.filter((z) => z.countryId === c.id).map(zoneNode).sort(byNameFr),
  });
  const root: TreeNode = { id: ministryId, level: "MINISTRY", name: ministryName, children: [] };
  root.children = org.countries.map(countryNode).sort(byNameFr);
  // Localités rattachées directement au ministère (sans zone) + unités orphelines,
  // groupées après les pays, chacune triée alphabétiquement.
  root.children.push(...org.localities.filter((l) => !l.zoneId).map(localityNode).sort(byNameFr));
  root.children.push(...org.units.filter((u) => !u.localityId).map(unitNode).sort(byNameFr));
  return root;
}
