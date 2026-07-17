import { useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge, Button, Drawer, Field, Input, Modal, Select } from "./primitives";
import { Icons } from "./icons";
import { useToasts } from "@/context/ToastContext";
import { invitationLink } from "@/services/ministryService";
import type { NodeLevel, TreeNode } from "@/lib/orgTree";
import { RESP_ROLES_BY_LEVEL, buildGoalAttachment, isResponsableOf } from "@/lib/responsables";
import {
  deactivateUser, inviteUser, reassignUser,
  type AdminUserResponse, type ModuleRole,
} from "@/services/userService";

// Niveaux où un utilisateur peut être rattaché (Chantier B : la Ville remplace la Team).
const LEVELS: NodeLevel[] = ["UNIT", "LOCALITY", "ZONE", "COUNTRY", "MINISTRY"];

export interface StructureOrg {
  countries: { id: string; name: string; code: string }[];
  zones: { id: string; name: string }[];
  localities: { id: string; name: string }[];
  units: { id: string; name: string }[];
}

type FormState =
  | { mode: "add" }
  | { mode: "edit"; user: AdminUserResponse }
  | null;

export function ResponsablesDrawer({
  node, ministryId, users, org, onClose,
}: {
  node: TreeNode | null;
  ministryId: string;
  users: AdminUserResponse[];
  org?: StructureOrg;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { push } = useToasts();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ModuleRole | "">("");
  const [supervisorId, setSupervisorId] = useState("");
  // Édition = réaffectation : niveau + entité cibles.
  const [editLevel, setEditLevel] = useState<NodeLevel>("ZONE");
  const [editEntity, setEditEntity] = useState("");
  // Codes d'invitation conservés sur les cartes (le backend ne les réexpose pas après coup).
  const [invites, setInvites] = useState<Record<string, { code: string | null; token: string }>>({});

  const addRoleOptions = node ? RESP_ROLES_BY_LEVEL[node.level] : [];
  const editRoleOptions = RESP_ROLES_BY_LEVEL[editLevel];
  const responsables = useMemo(
    () => (node ? users.filter((u) => isResponsableOf(u, node.level, node.id)) : []),
    [users, node],
  );
  const nameById = useMemo(() => new Map(users.map((u) => [u.id, u.fullName])), [users]);

  const entityOptions = useMemo(() => {
    if (editLevel === "UNIT") return org?.units ?? [];
    if (editLevel === "LOCALITY") return org?.localities ?? [];
    if (editLevel === "ZONE") return org?.zones ?? [];
    if (editLevel === "COUNTRY") return (org?.countries ?? []).map((c) => ({ id: c.id, name: `${c.name} (${c.code})` }));
    return [];
  }, [editLevel, org]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ministry-users", ministryId] });
  const closeForm = () => { setForm(null); setFullName(""); setEmail(""); setRole(""); setSupervisorId(""); setEditEntity(""); };

  const openAdd = () => {
    setFullName(""); setEmail(""); setRole(addRoleOptions[0] ?? ""); setSupervisorId("");
    setForm({ mode: "add" });
  };
  const openEdit = (u: AdminUserResponse) => {
    if (!node) return;
    setFullName(u.fullName); setEmail(u.email);
    setEditLevel(node.level);
    setEditEntity(node.level === "MINISTRY" ? "" : node.id);
    setRole((u.goalRole ?? u.donationRole ?? RESP_ROLES_BY_LEVEL[node.level][0] ?? "") as ModuleRole | "");
    setSupervisorId(u.supervisorId ?? "");
    setForm({ mode: "edit", user: u });
  };

  const changeEditLevel = (lvl: NodeLevel) => {
    setEditLevel(lvl);
    setEditEntity("");
    setRole(RESP_ROLES_BY_LEVEL[lvl][0] ?? "");
  };

  const saveM = useMutation({
    mutationFn: async () => {
      if (!form || !role) return;
      if (form.mode === "add") {
        if (!node) return;
        return inviteUser({
          email: email.trim(), fullName: fullName.trim(), ministryId,
          supervisorId: supervisorId || null, ...buildGoalAttachment(node.level, node.id, role),
        });
      }
      return reassignUser(form.user.id, {
        goalRole: role,
        entityId: editLevel === "MINISTRY" ? null : (editEntity || null),
        supervisorId: supervisorId || null,
      });
    },
    onSuccess: (res) => {
      invalidate();
      closeForm();
      if (res && "userId" in res && "invitationToken" in res) {
        setInvites((prev) => ({ ...prev, [res.userId]: { code: res.invitationShortCode, token: res.invitationToken } }));
        push({ kind: "ok", title: t("responsables.savedToast"), msg: t("responsables.codeSaved") });
      } else {
        push({ kind: "ok", title: t("responsables.savedToast"), msg: "" });
      }
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const deactivateM = useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => { invalidate(); push({ kind: "ok", title: t("responsables.deactivatedToast"), msg: "" }); },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const valid = form?.mode === "add"
    ? (!!role && fullName.trim() !== "" && /.+@.+\..+/.test(email))
    : (!!role && (editLevel === "MINISTRY" || !!editEntity));

  return (
    <>
      <Drawer
        open={!!node}
        onClose={onClose}
        title={node ? t("responsables.title") : ""}
        sub={node ? `${t(`subscriptions.level.${node.level}`)} · ${node.name}` : undefined}
      >
        {node && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={openAdd}>
              {t("responsables.add")}
            </Button>

            {responsables.length === 0 ? (
              <p style={{ color: "var(--ink-500)", margin: 0 }}>{t("responsables.empty")}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {responsables.map((u) => {
                  const r = u.goalRole ?? u.donationRole;
                  return (
                    <div key={u.id} className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600 }}>{u.fullName}</span>
                        {r && <Badge tone="earth">{t(`responsables.role.${r}`)}</Badge>}
                        {!u.active && <Badge tone="gray">{t("responsables.inactive")}</Badge>}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ink-500)" }}>{u.email}</div>
                      <div style={{ fontSize: 13, color: "var(--ink-500)" }}>
                        {t("responsables.supervisor")} : {u.supervisorId ? (nameById.get(u.supervisorId) ?? "—") : t("responsables.root")}
                      </div>
                      {invites[u.id] && (
                        <div style={{ background: "var(--parchment, #faf7f0)", border: "1px solid var(--line,#eee)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{t("responsables.activationCode")}</div>
                          {invites[u.id].code && <CopyRow display={invites[u.id].code!} value={invites[u.id].code!} t={t} />}
                          <CopyRow display={t("responsables.copyLink")} value={invitationLink(invites[u.id].token)} t={t} small />
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button variant="secondary" size="sm" onClick={() => openEdit(u)}>{t("responsables.reassign")}</Button>
                        {u.active && <Button variant="danger" size="sm" disabled={deactivateM.isPending} onClick={() => deactivateM.mutate(u.id)}>{t("responsables.deactivate")}</Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Formulaire invite (add) / réaffectation (edit) */}
      <Modal
        open={!!form}
        onClose={closeForm}
        title={form?.mode === "add" ? t("responsables.addTitle") : t("responsables.reassignTitle")}
        sub={form?.mode === "edit" ? fullName : (node ? `${t(`subscriptions.level.${node.level}`)} · ${node.name}` : undefined)}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>{t("common.cancel")}</Button>
            <Button variant="primary" disabled={!valid || saveM.isPending} onClick={() => saveM.mutate()}>
              {saveM.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </>
        }
      >
        {form?.mode === "add" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label={t("responsables.fullName")}>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label={t("responsables.email")}>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t("responsables.roleLabel")}>
              <Select value={role} onChange={(e) => setRole(e.target.value as ModuleRole)}>
                {addRoleOptions.map((r) => <option key={r} value={r}>{t(`responsables.role.${r}`)}</option>)}
              </Select>
            </Field>
            <SupervisorSelect users={users} value={supervisorId} onChange={setSupervisorId} t={t} />
          </div>
        )}

        {form?.mode === "edit" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, color: "var(--ink-500)", fontSize: 13 }}>{t("responsables.reassignHint")}</p>
            <Field label={t("responsables.targetLevel")}>
              <Select value={editLevel} onChange={(e) => changeEditLevel(e.target.value as NodeLevel)}>
                {LEVELS.map((lvl) => <option key={lvl} value={lvl}>{t(`subscriptions.level.${lvl}`)}</option>)}
              </Select>
            </Field>
            {editLevel !== "MINISTRY" && (
              <Field label={t("responsables.targetEntity")}>
                <Select value={editEntity} onChange={(e) => setEditEntity(e.target.value)}>
                  <option value="">{t("subscriptions.chooseOption")}</option>
                  {entityOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label={t("responsables.roleLabel")}>
              <Select value={role} onChange={(e) => setRole(e.target.value as ModuleRole)}>
                {editRoleOptions.map((r) => <option key={r} value={r}>{t(`responsables.role.${r}`)}</option>)}
              </Select>
            </Field>
            <SupervisorSelect users={users} value={supervisorId} onChange={setSupervisorId} t={t} excludeId={form.user.id} />
          </div>
        )}
      </Modal>
    </>
  );
}

// Combobox avec recherche (nom / email) : indispensable dès que le ministère dépasse
// quelques dizaines d'utilisateurs — un <select> natif de 1000 entrées est inutilisable.
const SUPERVISOR_MAX_RESULTS = 50;

function SupervisorSelect({
  users, value, onChange, t, excludeId,
}: {
  users: AdminUserResponse[];
  value: string;
  onChange: (v: string) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
  excludeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = value ? users.find((u) => u.id === value) : undefined;
  const q = query.trim().toLowerCase();
  const candidates = users.filter((u) => u.id !== excludeId);
  const matches = q
    ? candidates.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    : candidates;
  const shown = matches.slice(0, SUPERVISOR_MAX_RESULTS);

  const pick = (id: string) => { onChange(id); setQuery(""); setOpen(false); };

  const rowStyle = (active: boolean): CSSProperties => ({
    padding: "8px 12px", cursor: "pointer", fontSize: 13.5,
    background: active ? "var(--parchment, #faf7f0)" : "transparent",
  });

  return (
    <Field label={t("responsables.supervisor")} hint={t("responsables.supervisorHint")}>
      <div style={{ position: "relative" }}>
        <Input
          value={open ? query : (selected ? `${selected.fullName} — ${selected.email}` : "")}
          placeholder={open ? t("responsables.supervisorSearchPlaceholder") : t("responsables.root")}
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
            <div style={{ ...rowStyle(value === ""), color: "var(--ink-500)" }} onClick={() => pick("")}>
              {t("responsables.root")}
            </div>
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

function CopyRow({ display, value, t, small }: { display: string; value: string; t: (k: string) => string; small?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch { /* clipboard indisponible */ }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <code style={{ fontSize: small ? 12 : 18, fontWeight: small ? 400 : 700, letterSpacing: small ? 0 : 1.5, flex: 1, wordBreak: "break-all" }}>{display}</code>
      <button type="button" className="btn ghost sm" onClick={copy} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icons.Copy size={13} />{done ? t("common.copied") : t("common.copy")}
      </button>
    </div>
  );
}
