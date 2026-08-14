import { useState } from "react";
import { Input } from "./primitives";

/**
 * Sélecteur multi-entités (assemblées d'un DIRIGEANT_UNITE, villes d'un DIRIGEANT, régions d'un
 * SENIOR) : recherche + liste cochable + badges des sélections. L'ordre de sélection compte : la
 * première est le rattachement principal (★) — c'est elle que le backend pose en « home ».
 *
 * Partagé par la page Utilisateurs (modale Rôle / création) et le drawer Responsables : les deux
 * écrans écrivent le même contrat `reassign { entityId, entityIds }`.
 */
export function EntityMultiPicker({
  options, selected, onChange, placeholder,
}: {
  options: Array<{ id: string; name: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = (query ? options.filter((o) => o.name.toLowerCase().includes(query)) : options).slice(0, 50);
  const nameOf = (id: string) => options.find((o) => o.id === id)?.name ?? "—";
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selected.map((id, i) => (
            <span key={id} className="badge earth" style={{ cursor: "pointer" }} title={nameOf(id)}
              onClick={() => toggle(id)}>
              {i === 0 ? "★ " : ""}{nameOf(id)} ✕
            </span>
          ))}
        </div>
      )}
      <Input placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ border: "1px solid var(--line,#eee)", borderRadius: 8, maxHeight: 180, overflowY: "auto" }}>
        {matches.map((o) => {
          const on = selected.includes(o.id);
          return (
            <div key={o.id} onClick={() => toggle(o.id)}
              style={{ padding: "7px 10px", cursor: "pointer", fontSize: 13.5, display: "flex", gap: 8, alignItems: "center", background: on ? "var(--parchment,#faf7f0)" : "transparent" }}>
              <span style={{ width: 14, textAlign: "center", color: "var(--ink-500)" }}>{on ? "✓" : ""}</span>
              {o.name}
            </div>
          );
        })}
        {matches.length === 0 && (
          <div style={{ padding: "7px 10px", fontSize: 13, color: "var(--ink-400)" }}>—</div>
        )}
      </div>
    </div>
  );
}
