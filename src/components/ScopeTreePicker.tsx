import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icons } from "@/components/icons";
import { useMinistryTree } from "@/hooks/useMinistryTree";
import type { TreeNode } from "@/lib/orgTree";
import type { DocumentScopeLevel } from "@/services/documentService";

// D-DOC-08 (JP 18/10) — un document est placé à UN nœud : le ministère entier (« Tout le
// ministère », scopeId null) ou une nation / région / ville / assemblée. Le sélecteur reprend
// l'arbre de la page Structure (même requête `ministry-structure`, même `buildTree`) au lieu d'une
// liste à plat : on choisit un nœud là où on le voit dans la hiérarchie.

export interface ScopeValue {
  level: DocumentScopeLevel;
  /** null ⇔ MINISTRY. */
  id: string | null;
}

const isSelected = (node: TreeNode, value: ScopeValue | null) =>
  !!value && (node.level === "MINISTRY" ? value.level === "MINISTRY" : value.level === node.level && value.id === node.id);

export function ScopeTreePicker({
  ministryId, ministryName, value, onChange,
}: {
  ministryId: string;
  ministryName: string;
  value: ScopeValue | null;
  onChange: (v: ScopeValue) => void;
}) {
  const { t } = useTranslation();
  const { tree, isLoading, isError } = useMinistryTree(ministryId, ministryName);

  if (!ministryId) {
    return <div style={{ color: "var(--ink-500)", fontSize: 13 }}>{t("documents.scopePickMinistryFirst")}</div>;
  }
  if (isLoading) return <div style={{ color: "var(--ink-500)", fontSize: 13 }}>{t("common.loading")}</div>;
  if (isError || !tree) return <div style={{ color: "var(--err)", fontSize: 13 }}>{t("documents.scopeLoadError")}</div>;

  return (
    <div
      role="tree"
      style={{
        maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)",
        background: "var(--ivory-raised)", padding: 4,
      }}
    >
      <ScopeRow node={tree} depth={0} value={value} onChange={onChange} />
    </div>
  );
}

function ScopeRow({
  node, depth, value, onChange,
}: { node: TreeNode; depth: number; value: ScopeValue | null; onChange: (v: ScopeValue) => void }) {
  const { t } = useTranslation();
  // Ouvert jusqu'aux régions : les villes / assemblées se déplient à la demande.
  const [open, setOpen] = useState(depth < 2);
  const selected = isSelected(node, value);
  const hasChildren = node.children.length > 0;
  const isMinistry = node.level === "MINISTRY";
  return (
    <div>
      <div
        role="treeitem"
        aria-selected={selected}
        onClick={() => onChange({ level: node.level, id: isMinistry ? null : node.id })}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", paddingLeft: 6 + depth * 16,
          borderRadius: 6, cursor: "pointer",
          background: selected ? "var(--green-100)" : "transparent",
          color: selected ? "var(--green-800)" : "var(--ink-800)",
        }}
      >
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            style={{ display: "inline-flex", width: 16, justifyContent: "center", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }}
          >
            <Icons.ChevRight size={12} />
          </span>
        ) : <span style={{ width: 16 }} />}
        <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--ink-400)", minWidth: 58 }}>
          {t(`subscriptions.level.${node.level}`)}
        </span>
        <span style={{ fontWeight: isMinistry || selected ? 600 : 500 }}>
          {isMinistry ? t("documents.scopeWholeMinistry") : node.name}
        </span>
        <span style={{ flex: 1 }} />
        {selected && <Icons.Check size={14} />}
      </div>
      {open && hasChildren && node.children.map((c) => (
        <ScopeRow key={c.id} node={c} depth={depth + 1} value={value} onChange={onChange} />
      ))}
    </div>
  );
}
