import { useTranslation } from "react-i18next";
import { DOCUMENT_FOLDER_MAX_DEPTH, type DocumentCategory } from "@/services/documentService";

// D-DOC-16 (JP 19/10) — dossiers de documents façon Drive : le backend rend une liste PLATE
// (parents avant enfants) ; l'arbre, les chemins et les contrôles de déplacement se calculent ici.
// Le backend reste juge (422 DOC_FOLDER_CYCLE / DOC_FOLDER_TOO_DEEP) : ces calculs ne servent qu'à
// ne pas proposer une cible vouée à l'échec.

export interface FolderNode {
  folder: DocumentCategory;
  children: FolderNode[];
}

export interface FolderIndex {
  roots: FolderNode[];
  byId: Map<string, FolderNode>;
}

const byOrder = (a: FolderNode, b: FolderNode) =>
  a.folder.displayOrder - b.folder.displayOrder
  || a.folder.name.localeCompare(b.folder.name, "fr", { sensitivity: "base" });

export function buildFolderIndex(list: DocumentCategory[]): FolderIndex {
  const byId = new Map<string, FolderNode>(list.map((f) => [f.id, { folder: f, children: [] }]));
  const roots: FolderNode[] = [];
  for (const node of byId.values()) {
    const parent = node.folder.parentId ? byId.get(node.folder.parentId) : undefined;
    // Parent absent de la liste (incohérence passagère) : rangé en racine plutôt que perdu.
    (parent && parent !== node ? parent.children : roots).push(node);
  }
  const sortRec = (nodes: FolderNode[]) => {
    nodes.sort(byOrder);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return { roots, byId };
}

/** Chemin racine → dossier (inclus). Garde-fou contre un cycle de données. */
export function folderPath(index: FolderIndex, id: string): DocumentCategory[] {
  const path: DocumentCategory[] = [];
  let cur = index.byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.folder.id)) {
    seen.add(cur.folder.id);
    path.unshift(cur.folder);
    cur = cur.folder.parentId ? index.byId.get(cur.folder.parentId) : undefined;
  }
  return path;
}

/** Le dossier et tous ses descendants. */
export function subtreeIds(node: FolderNode): Set<string> {
  const ids = new Set<string>();
  const walk = (n: FolderNode) => {
    if (ids.has(n.folder.id)) return;
    ids.add(n.folder.id);
    n.children.forEach(walk);
  };
  walk(node);
  return ids;
}

/** Nombre de niveaux occupés par le sous-arbre (1 = dossier sans sous-dossier). */
export function subtreeHeight(node: FolderNode): number {
  return 1 + node.children.reduce((m, c) => Math.max(m, subtreeHeight(c)), 0);
}

export type MoveBlock = "cycle" | "tooDeep";

/**
 * D-DOC-16 — peut-on ranger `node` sous `target` ? Exclut le dossier lui-même et ses descendants
 * (DOC_FOLDER_CYCLE) et les cibles qui porteraient le sous-arbre au-delà de 3 niveaux
 * (DOC_FOLDER_TOO_DEEP). La racine (`target` null) est toujours possible.
 */
export function moveBlock(node: FolderNode, target: DocumentCategory | null): MoveBlock | null {
  if (!target) return null;
  if (subtreeIds(node).has(target.id)) return "cycle";
  if (target.depth + subtreeHeight(node) > DOCUMENT_FOLDER_MAX_DEPTH) return "tooDeep";
  return null;
}

/** Ancêtres d'un dossier (exclu), pour déplier l'arbre jusqu'à la sélection. */
export function ancestorIds(index: FolderIndex, id: string | null | undefined): Set<string> {
  if (!id) return new Set();
  return new Set(folderPath(index, id).slice(0, -1).map((f) => f.id));
}

/** Libellé d'un dossier dans la langue de l'interface (nameEn → repli name). */
export function useFolderLabel() {
  const { i18n } = useTranslation();
  const en = (i18n.resolvedLanguage || i18n.language) === "en";
  return (f: Pick<DocumentCategory, "name" | "nameEn">) => (en ? f.nameEn ?? f.name : f.name);
}

/** « Enseignements › École › Niveau 1 ». */
export function folderPathLabel(index: FolderIndex, id: string, label: (f: DocumentCategory) => string): string {
  return folderPath(index, id).map(label).join(" › ");
}
