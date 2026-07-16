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

export function buildTree(org: OrgData, ministryId: string, ministryName: string): TreeNode {
  const unitNode = (u: OrgData["units"][number]): TreeNode => ({ id: u.id, level: "UNIT", name: u.name, data: u, children: [] });
  const localityNode = (l: OrgData["localities"][number]): TreeNode => ({
    id: l.id, level: "LOCALITY", name: l.name, data: l,
    children: org.units.filter((u) => u.localityId === l.id).map(unitNode),
  });
  const zoneNode = (z: OrgData["zones"][number]): TreeNode => ({
    id: z.id, level: "ZONE", name: z.name, data: z,
    children: org.localities.filter((l) => l.zoneId === z.id).map(localityNode),
  });
  const countryNode = (c: OrgData["countries"][number]): TreeNode => ({
    id: c.id, level: "COUNTRY", name: `${c.name} (${c.code})`, data: c,
    children: org.zones.filter((z) => z.countryId === c.id).map(zoneNode),
  });
  const root: TreeNode = { id: ministryId, level: "MINISTRY", name: ministryName, children: [] };
  root.children = org.countries.map(countryNode);
  // Localités rattachées directement au ministère (sans zone) + unités orphelines.
  org.localities.filter((l) => !l.zoneId).forEach((l) => root.children.push(localityNode(l)));
  org.units.filter((u) => !u.localityId).forEach((u) => root.children.push(unitNode(u)));
  return root;
}
