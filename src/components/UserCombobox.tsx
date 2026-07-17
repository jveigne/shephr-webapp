import { useState, type CSSProperties } from "react";
import { Field, Input } from "./primitives";
import type { AdminUserResponse } from "@/services/userService";

// Combobox avec recherche (nom / email) : indispensable dès que le ministère dépasse
// quelques dizaines d'utilisateurs — un <select> natif de 1000 entrées est inutilisable.
const COMBOBOX_MAX_RESULTS = 50;

export function UserCombobox({
  users, value, onChange, t, excludeId, label, hint, emptyOptionLabel,
}: {
  users: AdminUserResponse[];
  value: string;
  onChange: (v: string) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
  excludeId?: string;
  label: string;
  hint?: string;
  /** Libellé de l'option « aucun » (ex. racine pour le superviseur) ; absent = choix obligatoire. */
  emptyOptionLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = value ? users.find((u) => u.id === value) : undefined;
  const q = query.trim().toLowerCase();
  const candidates = users.filter((u) => u.id !== excludeId);
  const matches = q
    ? candidates.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    : candidates;
  const shown = matches.slice(0, COMBOBOX_MAX_RESULTS);

  const pick = (id: string) => { onChange(id); setQuery(""); setOpen(false); };

  const rowStyle = (active: boolean): CSSProperties => ({
    padding: "8px 12px", cursor: "pointer", fontSize: 13.5,
    background: active ? "var(--parchment, #faf7f0)" : "transparent",
  });

  return (
    <Field label={label} hint={hint}>
      <div style={{ position: "relative" }}>
        <Input
          value={open ? query : (selected ? `${selected.fullName} — ${selected.email}` : "")}
          placeholder={open || !emptyOptionLabel ? t("responsables.supervisorSearchPlaceholder") : emptyOptionLabel}
          onFocus={() => { setQuery(""); setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onBlur={() => { setQuery(""); setOpen(false); }}
        />
        {open && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 40, marginTop: 4,
              background: "var(--card-bg, #fff)", border: "1px solid var(--line,#eee)", borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,.12)", maxHeight: 240, overflowY: "auto",
            }}
          >
            {emptyOptionLabel && (
              <div style={{ ...rowStyle(value === ""), color: "var(--ink-500)" }} onClick={() => pick("")}>
                {emptyOptionLabel}
              </div>
            )}
            {shown.map((p) => (
              <div key={p.id} style={rowStyle(p.id === value)} onClick={() => pick(p.id)}>
                <div style={{ fontWeight: 500 }}>{p.fullName}</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{p.email}</div>
              </div>
            ))}
            {matches.length === 0 && (
              <div style={{ padding: "8px 12px", fontSize: 13, color: "var(--ink-400)" }}>
                {t("responsables.supervisorNoMatch")}
              </div>
            )}
            {matches.length > shown.length && (
              <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--ink-400)", borderTop: "1px solid var(--line,#eee)" }}>
                {t("responsables.supervisorMore", { count: matches.length - shown.length })}
              </div>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}

export function SupervisorSelect({
  users, value, onChange, t, excludeId,
}: {
  users: AdminUserResponse[];
  value: string;
  onChange: (v: string) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
  excludeId?: string;
}) {
  return (
    <UserCombobox
      users={users} value={value} onChange={onChange} t={t} excludeId={excludeId}
      label={t("responsables.supervisor")}
      hint={t("responsables.supervisorHint")}
      emptyOptionLabel={t("responsables.root")}
    />
  );
}
