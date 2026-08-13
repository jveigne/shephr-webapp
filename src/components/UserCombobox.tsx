import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Field, Input } from "./primitives";
import { useDebounced } from "@/hooks/useDebounced";
import { searchUsers, userLogin, type AdminUserResponse } from "@/services/userService";

// Combobox avec recherche (nom / email) : indispensable dès que le ministère dépasse
// quelques dizaines d'utilisateurs — un <select> natif de 1000 entrées est inutilisable.
const COMBOBOX_MAX_RESULTS = 50;
/** Au-delà de quelques milliers de comptes, la recherche doit partir au serveur. */
const REMOTE_PAGE_SIZE = 25;

/**
 * De quoi afficher un compte déjà choisi sans avoir à le rechercher — la liste complète n'étant
 * plus chargée, on ne dispose parfois que de l'id et du nom (colonne « Superviseur »).
 */
export type UserRef = Pick<AdminUserResponse, "id" | "fullName" | "username" | "email">;

/**
 * Coquille commune aux deux combobox (liste déjà chargée / recherche serveur) : champ de saisie,
 * panneau déroulant, option « aucun ». Elle porte la saisie et remonte la requête au parent, qui
 * décide comment produire les résultats.
 */
function ComboboxBase({
  label, hint, emptyOptionLabel, value, selected, matches, extraCount, loading, onQuery, onOpenChange, onChange, t,
}: {
  label: string;
  hint?: string;
  emptyOptionLabel?: string;
  value: string;
  selected?: UserRef;
  matches: AdminUserResponse[];
  /** Nombre de résultats non affichés (« … et N autres »). */
  extraCount: number;
  loading?: boolean;
  onQuery: (q: string) => void;
  onOpenChange?: (open: boolean) => void;
  onChange: (v: string) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const setOpenState = (next: boolean) => { setOpen(next); onOpenChange?.(next); };
  const type = (q: string) => { setQuery(q); onQuery(q); };
  const pick = (id: string) => { onChange(id); type(""); setOpenState(false); };

  const rowStyle = (active: boolean): CSSProperties => ({
    padding: "8px 12px", cursor: "pointer", fontSize: 13.5,
    background: active ? "var(--parchment, #faf7f0)" : "transparent",
  });

  return (
    <Field label={label} hint={hint}>
      <div style={{ position: "relative" }}>
        <Input
          value={open ? query : (selected ? `${selected.fullName} — ${userLogin(selected)}` : "")}
          placeholder={open || !emptyOptionLabel ? t("responsables.supervisorSearchPlaceholder") : emptyOptionLabel}
          onFocus={() => { type(""); setOpenState(true); }}
          onChange={(e) => { type(e.target.value); setOpenState(true); }}
          onBlur={() => { type(""); setOpenState(false); }}
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
            {matches.map((p) => (
              <div key={p.id} style={rowStyle(p.id === value)} onClick={() => pick(p.id)}>
                <div style={{ fontWeight: 500 }}>{p.fullName}</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{userLogin(p)}</div>
              </div>
            ))}
            {loading && (
              <div style={{ padding: "8px 12px", fontSize: 13, color: "var(--ink-400)" }}>{t("common.loading")}</div>
            )}
            {!loading && matches.length === 0 && (
              <div style={{ padding: "8px 12px", fontSize: 13, color: "var(--ink-400)" }}>
                {t("responsables.supervisorNoMatch")}
              </div>
            )}
            {extraCount > 0 && (
              <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--ink-400)", borderTop: "1px solid var(--line,#eee)" }}>
                {t("responsables.supervisorMore", { count: extraCount })}
              </div>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}

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
  const [query, setQuery] = useState("");

  const selected = value ? users.find((u) => u.id === value) : undefined;
  const q = query.trim().toLowerCase();
  const candidates = users.filter((u) => u.id !== excludeId);
  const matches = q
    ? candidates.filter((u) => (u.fullName ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q))
    : candidates;
  const shown = matches.slice(0, COMBOBOX_MAX_RESULTS);

  return (
    <ComboboxBase
      label={label} hint={hint} emptyOptionLabel={emptyOptionLabel} value={value} selected={selected}
      matches={shown} extraCount={matches.length - shown.length}
      onQuery={setQuery} onChange={onChange} t={t}
    />
  );
}

/**
 * Variante qui interroge le SERVEUR à chaque frappe (débounce) : à utiliser partout où la liste
 * complète des comptes n'est plus chargée — c'est-à-dire dès qu'un ministère compte des milliers
 * de membres. Sans saisie, elle propose les derniers inscrits.
 */
export function RemoteUserCombobox({
  ministryId, value, selected, onChange, t, excludeId, excludeIds, label, hint, emptyOptionLabel,
}: {
  /** Vide = tous les ministères. */
  ministryId?: string;
  value: string;
  /** Compte déjà sélectionné, pour afficher son nom sans le rechercher. */
  selected?: UserRef;
  onChange: (v: string, user?: AdminUserResponse) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
  excludeId?: string;
  /** Comptes à retirer des résultats (ex. déjà responsables du nœud). */
  excludeIds?: string[];
  label: string;
  hint?: string;
  emptyOptionLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query);

  const q = useQuery({
    queryKey: ["user-search", ministryId ?? "", debounced],
    queryFn: () => searchUsers({ ministryId, search: debounced, size: REMOTE_PAGE_SIZE }),
    enabled: open,
  });

  const excluded = new Set([...(excludeIds ?? []), ...(excludeId ? [excludeId] : [])]);
  const matches = (q.data?.content ?? []).filter((u) => !excluded.has(u.id));
  const total = q.data?.totalElements ?? 0;

  return (
    <ComboboxBase
      label={label} hint={hint} emptyOptionLabel={emptyOptionLabel} value={value} selected={selected}
      matches={matches} extraCount={Math.max(0, total - matches.length)} loading={q.isFetching}
      onQuery={setQuery} onOpenChange={setOpen}
      onChange={(id) => onChange(id, matches.find((u) => u.id === id))}
      t={t}
    />
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

/** Sélecteur de superviseur adossé à la recherche serveur (back-office, milliers de comptes). */
export function RemoteSupervisorSelect({
  ministryId, value, selected, onChange, t, excludeId,
}: {
  ministryId?: string;
  value: string;
  selected?: UserRef;
  onChange: (v: string, user?: AdminUserResponse) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
  excludeId?: string;
}) {
  return (
    <RemoteUserCombobox
      ministryId={ministryId} value={value} selected={selected} onChange={onChange} t={t} excludeId={excludeId}
      label={t("responsables.supervisor")}
      hint={t("responsables.supervisorHint")}
      emptyOptionLabel={t("responsables.root")}
    />
  );
}
