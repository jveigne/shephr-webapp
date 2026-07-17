import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge, Button, Field, Input, Modal, Select, Table, Toggle, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";
import { fetchMinistryStructure } from "@/services/orgService";
import {
  deleteUser, listMinistryUsers, reassignUser, setUserPassword, updateUserInfo,
  type AdminUserResponse, type ModuleRole,
} from "@/services/userService";

const ROLES: ModuleRole[] = ["MEMBRE", "DIRIGEANT_UNITE", "DIRIGEANT", "DIRIGEANT_SENIOR", "DIRIGEANT_COORDINATEUR", "LEADER", "SECRETARIAT"];

export default function UtilisateursPage() {
  const { t } = useTranslation();
  const { push } = useToasts();
  const qc = useQueryClient();

  const [ministryId, setMinistryId] = useState("");
  const [fZone, setFZone] = useState("");
  const [fUnit, setFUnit] = useState("");
  const [fRole, setFRole] = useState("");
  const [search, setSearch] = useState("");

  const [editUser, setEditUser] = useState<AdminUserResponse | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [pwUser, setPwUser] = useState<AdminUserResponse | null>(null);
  const [pw, setPw] = useState("");
  const [delUser, setDelUser] = useState<AdminUserResponse | null>(null);
  // Changement de rôle (reassign : rôle + rattachement posés en bloc côté backend).
  const [roleUser, setRoleUser] = useState<AdminUserResponse | null>(null);
  const [roleValue, setRoleValue] = useState<ModuleRole>("MEMBRE");
  const [roleEntity, setRoleEntity] = useState("");
  const [roleSupervisor, setRoleSupervisor] = useState("");

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const usersQ = useQuery({
    queryKey: ["ministry-users", ministryId],
    queryFn: () => listMinistryUsers(ministryId),
    enabled: !!ministryId,
  });
  const structureQ = useQuery({
    queryKey: ["ministry-structure", ministryId],
    queryFn: () => fetchMinistryStructure(ministryId),
    enabled: !!ministryId,
  });

  const org = structureQ.data;
  const unitName = useMemo(() => new Map((org?.units ?? []).map((u) => [u.id, u.name])), [org]);
  const zoneName = useMemo(() => new Map((org?.zones ?? []).map((z) => [z.id, z.name])), [org]);
  const cityName = useMemo(() => new Map((org?.localities ?? []).map((l) => [l.id, l.name])), [org]);
  const countryName = useMemo(() => new Map((org?.countries ?? []).map((c) => [c.id, c.name])), [org]);
  const userName = useMemo(() => new Map((usersQ.data ?? []).map((u) => [u.id, u.fullName])), [usersQ.data]);
  // Unité → zone (via localité) pour filtrer « tous les users de la zone ».
  const unitZone = useMemo(() => {
    const locZone = new Map((org?.localities ?? []).map((l) => [l.id, l.zoneId]));
    return new Map((org?.units ?? []).map((u) => [u.id, u.localityId ? locZone.get(u.localityId) ?? null : null]));
  }, [org]);

  const attachmentLabel = (u: AdminUserResponse): string => {
    if (u.goalZoneId) return `${t("subscriptions.level.ZONE")} · ${zoneName.get(u.goalZoneId) ?? "—"}`;
    if (u.goalCityId) return `${t("subscriptions.level.LOCALITY")} · ${cityName.get(u.goalCityId) ?? "—"}`;
    if (u.goalUnitId) return `${t("subscriptions.level.UNIT")} · ${unitName.get(u.goalUnitId) ?? "—"}`;
    if (u.goalCountryIds?.length) return `${t("subscriptions.level.COUNTRY")} · ${u.goalCountryIds.map((c) => countryName.get(c) ?? "—").join(", ")}`;
    if (u.goalRole === "LEADER" || u.goalRole === "SECRETARIAT") return t("subscriptions.level.MINISTRY");
    return "—";
  };

  const usersInZone = (u: AdminUserResponse, zoneId: string) =>
    u.goalZoneId === zoneId || u.donationZoneId === zoneId ||
    (u.goalUnitId && unitZone.get(u.goalUnitId) === zoneId) ||
    (u.donationUnitId && unitZone.get(u.donationUnitId) === zoneId);

  const rows = useMemo(() => {
    let list = usersQ.data ?? [];
    if (fZone) list = list.filter((u) => usersInZone(u, fZone));
    if (fUnit) list = list.filter((u) => u.goalUnitId === fUnit || u.donationUnitId === fUnit || u.goalUnitIds?.includes(fUnit) || u.donationUnitIds?.includes(fUnit));
    if (fRole) list = list.filter((u) => u.goalRole === fRole || u.donationRole === fRole);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    return list.map((u) => ({ ...u, _key: u.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersQ.data, fZone, fUnit, fRole, search, unitZone]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ministry-users", ministryId] });

  const updateM = useMutation({
    mutationFn: () => updateUserInfo(editUser!.id, { fullName: editName.trim(), email: editEmail.trim(), active: editActive }),
    onSuccess: () => { invalidate(); setEditUser(null); push({ kind: "ok", title: t("users.savedToast"), msg: "" }); },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });
  const pwM = useMutation({
    mutationFn: () => setUserPassword(pwUser!.id, pw),
    onSuccess: () => { setPwUser(null); setPw(""); push({ kind: "ok", title: t("users.pwToast"), msg: "" }); },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });
  const delM = useMutation({
    mutationFn: () => deleteUser(delUser!.id),
    onSuccess: () => { invalidate(); setDelUser(null); push({ kind: "ok", title: t("users.deletedToast"), msg: "" }); },
    onError: (e: unknown) => push({ kind: "error", title: t("users.deleteFailToast"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const openEdit = (u: AdminUserResponse) => { setEditName(u.fullName); setEditEmail(u.email); setEditActive(u.active); setEditUser(u); };

  // ---- Changement de rôle (mapping décision #7 : DIRIGEANT=Ville, SENIOR=Région, COORDINATEUR=Nation) ----
  const entityKind = (r: ModuleRole): "unit" | "city" | "zone" | "country" | null =>
    r === "MEMBRE" || r === "DIRIGEANT_UNITE" ? "unit"
    : r === "DIRIGEANT" ? "city"
    : r === "DIRIGEANT_SENIOR" ? "zone"
    : r === "DIRIGEANT_COORDINATEUR" ? "country"
    : null;

  const currentEntityFor = (u: AdminUserResponse, r: ModuleRole): string => {
    switch (entityKind(r)) {
      case "unit": return u.goalUnitId ?? "";
      case "city": return u.goalCityId ?? "";
      case "zone": return u.goalZoneId ?? "";
      case "country": return u.goalCountryIds?.[0] ?? "";
      default: return "";
    }
  };

  const openRole = (u: AdminUserResponse) => {
    const r = u.goalRole ?? "MEMBRE";
    setRoleValue(r);
    setRoleEntity(currentEntityFor(u, r));
    setRoleSupervisor(u.supervisorId ?? "");
    setRoleUser(u);
  };

  const roleM = useMutation({
    mutationFn: () => reassignUser(roleUser!.id, {
      goalRole: roleValue,
      entityId: entityKind(roleValue) ? roleEntity : null,
      supervisorId: roleSupervisor || null,
    }),
    onSuccess: () => { invalidate(); setRoleUser(null); push({ kind: "ok", title: t("users.roleSavedToast"), msg: "" }); },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const roleEntityOptions: Array<{ id: string; name: string }> =
    entityKind(roleValue) === "unit" ? (org?.units ?? [])
    : entityKind(roleValue) === "city" ? (org?.localities ?? [])
    : entityKind(roleValue) === "zone" ? (org?.zones ?? [])
    : entityKind(roleValue) === "country" ? (org?.countries ?? [])
    : [];
  const roleEntityLabel =
    entityKind(roleValue) === "unit" ? t("subscriptions.level.UNIT")
    : entityKind(roleValue) === "city" ? t("subscriptions.level.LOCALITY")
    : entityKind(roleValue) === "zone" ? t("subscriptions.level.ZONE")
    : t("subscriptions.level.COUNTRY");
  const roleValid = entityKind(roleValue) == null || roleEntity !== "";

  const cols = [
    { label: t("users.colName"), render: (u: AdminUserResponse) => <span style={{ fontWeight: 500 }}>{u.fullName}</span> },
    { label: t("users.colEmail"), render: (u: AdminUserResponse) => <span style={{ color: "var(--ink-600)" }}>{u.email}</span> },
    { label: t("users.colRole"), render: (u: AdminUserResponse) => { const r = u.goalRole ?? u.donationRole; return r ? <Badge tone="earth">{t(`responsables.role.${r}`)}</Badge> : <span style={{ color: "var(--ink-400)" }}>—</span>; } },
    { label: t("users.colAttachment"), render: (u: AdminUserResponse) => <span style={{ color: "var(--ink-500)" }}>{attachmentLabel(u)}</span> },
    { label: t("users.colSupervisor"), render: (u: AdminUserResponse) => <span style={{ color: "var(--ink-500)" }}>{u.supervisorId ? (userName.get(u.supervisorId) ?? "—") : t("responsables.root")}</span> },
    { label: t("users.colStatus"), render: (u: AdminUserResponse) => u.active ? <Badge tone="ok" dot>{t("users.active")}</Badge> : <Badge tone="gray" dot>{t("users.inactive")}</Badge> },
    {
      label: "",
      render: (u: AdminUserResponse) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>{t("common.update")}</Button>
          <Button variant="ghost" size="sm" onClick={() => openRole(u)}>{t("users.roleAction")}</Button>
          <Button variant="ghost" size="sm" onClick={() => { setPw(""); setPwUser(u); }}>{t("users.password")}</Button>
          <Button variant="danger" size="sm" onClick={() => setDelUser(u)}>{t("users.delete")}</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <TopBar title={t("users.title")} crumbs={[t("common.jexcellence"), t("users.title")]} />
      <div className="content">
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line,#eee)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{t("users.workspaceTitle")}</span>
            <Select value={ministryId} onChange={(e) => { setMinistryId(e.target.value); setFZone(""); setFUnit(""); setFRole(""); setSearch(""); }}>
              <option value="">{t("users.pickMinistry")}</option>
              {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>

          {!ministryId ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>{t("users.pickMinistryHint")}</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, padding: "12px 16px", flexWrap: "wrap", borderBottom: "1px solid var(--line,#eee)" }}>
                <Field label={t("subscriptions.level.ZONE")}>
                  <Select value={fZone} onChange={(e) => setFZone(e.target.value)}>
                    <option value="">{t("users.allFem")}</option>
                    {(org?.zones ?? []).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </Select>
                </Field>
                <Field label={t("subscriptions.level.UNIT")}>
                  <Select value={fUnit} onChange={(e) => setFUnit(e.target.value)}>
                    <option value="">{t("users.allFem")}</option>
                    {(org?.units ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </Select>
                </Field>
                <Field label={t("users.colRole")}>
                  <Select value={fRole} onChange={(e) => setFRole(e.target.value)}>
                    <option value="">{t("users.all")}</option>
                    {ROLES.map((r) => <option key={r} value={r}>{t(`responsables.role.${r}`)}</option>)}
                  </Select>
                </Field>
                <Field label={t("users.search")}>
                  <Input placeholder={t("users.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
                </Field>
              </div>
              {usersQ.isLoading ? (
                <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
              ) : (
                <Table columns={cols} rows={rows} zebra />
              )}
            </>
          )}
        </div>
      </div>

      {/* Édition infos */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={t("users.editTitle")} sub={editUser?.email}
        footer={<><Button variant="ghost" onClick={() => setEditUser(null)}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!editName.trim() || updateM.isPending} onClick={() => updateM.mutate()}>{updateM.isPending ? t("common.loading") : t("common.save")}</Button></>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={t("users.colName")}><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></Field>
          <Field label={t("users.colEmail")}><Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} /></Field>
          <Field label={t("users.colStatus")}><Toggle checked={editActive} onChange={setEditActive} label={editActive ? t("users.active") : t("users.inactive")} /></Field>
        </div>
      </Modal>

      {/* Changement de rôle */}
      <Modal open={!!roleUser} onClose={() => setRoleUser(null)} title={t("users.roleTitle")} sub={roleUser ? `${roleUser.fullName} · ${roleUser.email}` : undefined}
        footer={<><Button variant="ghost" onClick={() => setRoleUser(null)}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!roleValid || roleM.isPending} onClick={() => roleM.mutate()}>{roleM.isPending ? t("common.loading") : t("common.save")}</Button></>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={t("users.colRole")}>
            <Select value={roleValue} onChange={(e) => {
              const r = e.target.value as ModuleRole;
              setRoleValue(r);
              setRoleEntity(roleUser ? currentEntityFor(roleUser, r) : "");
            }}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`responsables.role.${r}`)}</option>)}
            </Select>
          </Field>
          {entityKind(roleValue) != null ? (
            <Field label={roleEntityLabel}>
              <Select value={roleEntity} onChange={(e) => setRoleEntity(e.target.value)}>
                <option value="">{t("common.choose")}</option>
                {roleEntityOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>{t("users.roleMinistryWideHint")}</p>
          )}
          <Field label={t("users.colSupervisor")}>
            <Select value={roleSupervisor} onChange={(e) => setRoleSupervisor(e.target.value)}>
              <option value="">{t("responsables.root")}</option>
              {(usersQ.data ?? []).filter((u) => u.id !== roleUser?.id).map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </Select>
          </Field>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-400)" }}>{t("users.roleHint")}</p>
        </div>
      </Modal>

      {/* Mot de passe */}
      <Modal open={!!pwUser} onClose={() => setPwUser(null)} title={t("users.pwTitle")} sub={pwUser?.fullName}
        footer={<><Button variant="ghost" onClick={() => setPwUser(null)}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={pw.length < 6 || pwM.isPending} onClick={() => pwM.mutate()}>{pwM.isPending ? t("common.loading") : t("common.save")}</Button></>}>
        <Field label={t("users.newPassword")} hint={t("users.pwHint")}>
          <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
      </Modal>

      {/* Suppression */}
      <Modal open={!!delUser} onClose={() => setDelUser(null)} title={t("users.deleteTitle")} sub={delUser ? `${delUser.fullName} · ${delUser.email}` : undefined}
        footer={<><Button variant="ghost" onClick={() => setDelUser(null)}>{t("common.cancel")}</Button>
          <Button variant="danger" disabled={delM.isPending} onClick={() => delM.mutate()}>{delM.isPending ? t("common.loading") : t("users.confirmDelete")}</Button></>}>
        <p style={{ margin: 0, color: "var(--ink-600)" }}>{t("users.deleteWarning")}</p>
      </Modal>
    </>
  );
}
