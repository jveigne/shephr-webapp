import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icons } from "@/components/icons";
import { ancestorIds, folderPathLabel, useFolderLabel, type FolderIndex, type FolderNode } from "@/lib/documentFolders";
import type { DocumentCategory } from "@/services/documentService";

// D-DOC-16 (JP 19/10) — arbre des dossiers de documents (3 niveaux au plus), même rendu que
// ScopeTreePicker : sert à la navigation de la page Documents (colonne de gauche), au choix du
// dossier dans le formulaire d'un document et au choix du nouveau parent lors d'un déplacement.

const rowStyle = (selected: boolean, disabled: boolean, depth: number) => ({
  display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", paddingLeft: 6 + depth * 16,
  borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
  background: selected ? "var(--green-100)" : "transparent",
  color: selected ? "var(--green-800)" : "var(--ink-800)",
  opacity: disabled ? 0.45 : 1,
});

/** Entrée hors arbre (« Tous les documents », « Sans dossier », « Premier niveau »). */
export function FolderEntry({
  icon, label, selected, onClick, meta, disabledReason,
}: { icon: ReactNode; label: string; selected: boolean; onClick: () => void; meta?: ReactNode; disabledReason?: string | null }) {
  const disabled = !!disabledReason;
  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-disabled={disabled}
      title={disabledReason ?? undefined}
      onClick={() => { if (!disabled) onClick(); }}
      style={rowStyle(selected, disabled, 0)}
    >
      <span style={{ display: "inline-flex", width: 16, justifyContent: "center" }}>{icon}</span>
      <span style={{ fontWeight: selected ? 600 : 500 }}>{label}</span>
      <span style={{ flex: 1 }} />
      {meta}
    </div>
  );
}

export interface FolderTreeListProps {
  index: FolderIndex;
  selectedId: string | null;
  onSelect: (f: DocumentCategory) => void;
  label: (f: DocumentCategory) => string;
  /** Raison d'indisponibilité (affichée au survol), ou null si le dossier est sélectionnable. */
  disabledReason?: (node: FolderNode) => string | null;
  /** Complément à droite de la ligne (compteur, coche…). */
  meta?: (node: FolderNode) => ReactNode;
}

export function FolderTreeList(props: FolderTreeListProps) {
  // Ancêtres de la sélection + la sélection elle-même : dépliés, pour voir où l'on est et ses sous-dossiers.
  const forceOpen = useMemo(() => {
    const ids = ancestorIds(props.index, props.selectedId);
    if (props.selectedId) ids.add(props.selectedId);
    return ids;
  }, [props.index, props.selectedId]);
  return <>{props.index.roots.map((n) => <FolderRow key={n.folder.id} node={n} depth={0} forceOpen={forceOpen} {...props} />)}</>;
}

function FolderRow({
  node, depth, forceOpen, selectedId, onSelect, label, disabledReason, meta, index,
}: FolderTreeListProps & { node: FolderNode; depth: number; forceOpen: Set<string> }) {
  const { t } = useTranslation();
  const mustOpen = forceOpen.has(node.folder.id);
  const [open, setOpen] = useState(depth < 1 || mustOpen);
  // Sélectionné (ou devenu parent d'un dossier qu'on vient de créer) : on le déplie.
  useEffect(() => { if (mustOpen) setOpen(true); }, [mustOpen, node.children.length]);
  const f = node.folder;
  const selected = selectedId === f.id;
  const reason = disabledReason?.(node) ?? null;
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-disabled={!!reason}
        aria-expanded={hasChildren ? open : undefined}
        title={reason ?? undefined}
        onClick={() => { if (!reason) onSelect(f); }}
        style={rowStyle(selected, !!reason, depth)}
      >
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            style={{ display: "inline-flex", width: 16, justifyContent: "center", cursor: "pointer", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }}
          >
            <Icons.ChevRight size={12} />
          </span>
        ) : <span style={{ width: 16 }} />}
        <Icons.Folder size={14} />
        <span style={{ fontWeight: selected ? 600 : 500, color: f.active ? undefined : "var(--ink-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label(f)}
        </span>
        {!f.active && <span style={{ fontSize: 11, color: "var(--ink-400)" }}>({t("documents.folders.inactiveMarker")})</span>}
        <span style={{ flex: 1 }} />
        {meta?.(node)}
      </div>
      {open && hasChildren && node.children.map((c) => (
        <FolderRow
          key={c.folder.id}
          node={c}
          depth={depth + 1}
          forceOpen={forceOpen}
          index={index}
          selectedId={selectedId}
          onSelect={onSelect}
          label={label}
          disabledReason={disabledReason}
          meta={meta}
        />
      ))}
    </div>
  );
}

/**
 * Sélecteur d'un dossier dans un formulaire : une entrée « hors dossier » (`noneLabel`, valeur null)
 * puis l'arbre. Le chemin complet de la sélection s'affiche au-dessus.
 */
export function FolderTreePicker({
  index, value, onChange, noneLabel, disabled, disabledReason,
}: {
  index: FolderIndex;
  value: string | null;
  onChange: (id: string | null) => void;
  noneLabel: string;
  disabled?: boolean;
  disabledReason?: (node: FolderNode) => string | null;
}) {
  const { t } = useTranslation();
  const label = useFolderLabel();
  const selectedPath = value && index.byId.has(value) ? folderPathLabel(index, value, label) : noneLabel;
  const check = (on: boolean) => (on ? <Icons.Check size={14} /> : null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 13, color: "var(--ink-700)" }}>
        <span style={{ color: "var(--ink-500)" }}>{t("documents.folders.selectedPath")}</span>{" "}
        <strong style={{ fontWeight: 600 }}>{selectedPath}</strong>
      </div>
      <div
        role="tree"
        style={{
          maxHeight: 240, overflowY: "auto", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)",
          background: "var(--ivory-raised)", padding: 4, pointerEvents: disabled ? "none" : undefined, opacity: disabled ? 0.6 : 1,
        }}
      >
        <FolderEntry
          icon={<Icons.Inbox size={14} />}
          label={noneLabel}
          selected={value == null}
          onClick={() => onChange(null)}
          meta={check(value == null)}
        />
        <FolderTreeList
          index={index}
          selectedId={value}
          onSelect={(f) => onChange(f.id)}
          label={label}
          disabledReason={disabledReason}
          meta={(n) => check(n.folder.id === value)}
        />
      </div>
    </div>
  );
}
