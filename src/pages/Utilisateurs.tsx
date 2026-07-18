import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge, Button, Field, Input, Modal, Select, Table, Toggle, TopBar } from "@/components/primitives";
import { SupervisorSelect } from "@/components/UserCombobox";
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
  const [fCountry, setFCountry] = useState("");
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
  // Multi-rattachements (villes d'un DIRIGEANT, régions d'un SENIOR) : la première est la principale.
  const [roleEntities, setRoleEntities] = useState<string[]>([]);
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
  // Ville → zone, pour que le filtre Zone attrape aussi les dirigeants de ville (multi inclus).
  const cityZoneMap = useMemo(() => new Map((org?.localities ?? []).map((l) => [l.id, l.zoneId])), [org]);
  const cityZone = (cityId: string) => cityZoneMap.get(cityId) ?? null;
  // Zone / localité / unité → pays, pour filtrer « tous les users du pays ».
  const zoneCountry = useMemo(() => new Map((org?.zones ?? []).map((z) => [z.id, z.countryId])), [org]);
  const locCountry = useMemo(
    () => new Map((org?.localities ?? []).map((l) => [l.id, l.zoneId ? zoneCountry.get(l.zoneId) ?? null : null])),
    [org, zoneCountry],
  );
  const unitCountry = useMemo(() => {
    const locality = new Map((org?.localities ?? []).map((l) => [l.id, l]));
    return new Map((org?.units ?? []).map((u) => {
      const loc = u.localityId ? locality.get(u.localityId) : undefined;
      return [u.id, loc?.zoneId ? zoneCountry.get(loc.zoneId) ?? null : null];
    }));
  }, [org, zoneCountry]);

  // Union home + set (multi-rattachements), home en tête.
  const unionIds = (home: string | null, set: string[] | undefined): string[] => {
    const rest = (set ?? []).filter((id) => id !== home);
    return home ? [home, ...rest] : rest;
  };

  const attachmentLabel = (u: AdminUserResponse): string => {
    const zones = unionIds(u.goalZoneId, u.goalZoneIds);
    if (zones.length) return `${t("subscriptions.level.ZONE")} · ${zones.map((z) => zoneName.get(z) ?? "—").join(", ")}`;
    const cities = unionIds(u.goalCityId, u.goalCityIds);
    if (cities.length) return `${t("subscriptions.level.LOCALITY")} · ${cities.map((c) => cityName.get(c) ?? "—").join(", ")}`;
    if (u.goalUnitId) return `${t("subscriptions.level.UNIT")} · ${unitName.get(u.goalUnitId) ?? "—"}`;
    if (u.goalCountryIds?.length) return `${t("subscriptions.level.COUNTRY")} · ${u.goalCountryIds.map((c) => countryName.get(c) ?? "—").join(", ")}`;
    if (u.goalRole === "LEADER" || u.goalRole === "SECRETARIAT") return t("subscriptions.level.MINISTRY");
    return "—";
  };

  const usersInZone = (u: AdminUserResponse, zoneId: string) =>
    u.goalZoneId === zoneId || u.donationZoneId === zoneId ||
    u.goalZoneIds?.includes(zoneId) ||
    (u.goalCityId && cityZone(u.goalCityId) === zoneId) ||
    u.goalCityIds?.some((c) => cityZone(c) === zoneId) ||
    (u.goalUnitId && unitZone.get(u.goalUnitId) === zoneId) ||
    (u.donationUnitId && unitZone.get(u.donationUnitId) === zoneId);

  const usersInCountry = (u: AdminUserResponse, countryId: string) =>
    u.goalCountryIds?.includes(countryId) || u.donationCountryIds?.includes(countryId) ||
    u.coordinatedCountryIds?.includes(countryId) ||
    (u.goalZoneId && zoneCountry.get(u.goalZoneId) === countryId) ||
    u.goalZoneIds?.some((z) => zoneCountry.get(z) === countryId) ||
    (u.donationZoneId && zoneCountry.get(u.donationZoneId) === countryId) ||
    (u.goalCityId && locCountry.get(u.goalCityId) === countryId) ||
    u.goalCityIds?.some((c) => locCountry.get(c) === countryId) ||
    (u.donationCityId && locCountry.get(u.donationCityId) === countryId) ||
    (u.goalUnitId && unitCountry.get(u.goalUnitId) === countryId) ||
    (u.donationUnitId && unitCountry.get(u.donationUnitId) === countryId) ||
    u.goalUnitIds?.some((id) => unitCountry.get(id) === countryId) ||
    u.donationUnitIds?.some((id) => unitCountry.get(id) === countryId);

  const rows = useMemo(() => {
    let list = usersQ.data ?? [];
    if (fCountry) list = list.filter((u) => usersInCountry(u, fCountry));
    if (fZone) list = list.filter((u) => usersInZone(u, fZone));
    if (fUnit) list = list.filter((u) => u.goalUnitId === fUnit || u.donationUnitId === fUnit || u.goalUnitIds?.includes(fUnit) || u.donationUnitIds?.includes(fUnit));
    if (fRole) list = list.filter((u) => u.goalRole === fRole || u.donationRole === fRole);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    return list.map((u) => ({ ...u, _key: u.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersQ.data, fCountry, fZone, fUnit, fRole, search, unitZone, cityZoneMap, zoneCountry, locCountry, unitCountry]);

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

  // Rattachements multiples existants (home en tête), pour préremplir la sélection multi.
  const currentEntitiesFor = (u: AdminUserResponse, r: ModuleRole): string[] => {
    const kind = entityKind(r);
    const home = currentEntityFor(u, r);
    const set = kind === "city" ? u.goalCityIds : kind === "zone" ? u.goalZoneIds : [];
    const rest = (set ?? []).filter((id) => id !== home);
    return home ? [home, ...rest] : rest;
  };

  const isMultiKind = (r: ModuleRole) => entityKind(r) === "city" || entityKind(r) === "zone";

  const openRole = (u: AdminUserResponse) => {
    const r = u.goalRole ?? "MEMBRE";
    setRoleValue(r);
    setRoleEntity(currentEntityFor(u, r));
    setRoleEntities(currentEntitiesFor(u, r));
    setRoleSupervisor(u.supervisorId ?? "");
    setRoleUser(u);
  };

  const roleM = useMutation({
    mutationFn: () => reassignUser(roleUser!.id, {
      goalRole: roleValue,
      entityId: entityKind(roleValue) ? (isMultiKind(roleValue) ? (roleEntities[0] ?? null) : roleEntity) : null,
      entityIds: isMultiKind(roleValue) ? roleEntities : undefined,
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
  const roleValid = entityKind(roleValue) == null
    || (isMultiKind(roleValue) ? roleEntities.length > 0 : roleEntity !== "");

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
            <Select value={ministryId} onChange={(e) => { setMinistryId(e.target.value); setFCountry(""); setFZone(""); setFUnit(""); setFRole(""); setSearch(""); }}>
              <option value="">{t("users.pickMinistry")}</option>
              {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>

          {!ministryId ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>{t("users.pickMinistryHint")}</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, padding: "12px 16px", flexWrap: "wrap", borderBottom: "1px solid var(--line,#eee)" }}>
                <Field label={t("subscriptions.level.COUNTRY")}>
                  <Select value={fCountry} onChange={(e) => { setFCountry(e.target.value); setFZone(""); setFUnit(""); }}>
                    <option value="">{t("users.all")}</option>
                    {(org?.countries ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label={t("subscriptions.level.ZONE")}>
                  <Select value={fZone} onChange={(e) => setFZone(e.target.value)}>
                    <option value="">{t("users.allFem")}</option>
                    {(org?.zones ?? [])
                      .filter((z) => !fCountry || z.countryId === fCountry)
                      .map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
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
              setRoleEntities(roleUser ? currentEntitiesFor(roleUser, r) : []);
            }}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`responsables.role.${r}`)}</option>)}
            </Select>
          </Field>
          {entityKind(roleValue) == null ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>{t("users.roleMinistryWideHint")}</p>
          ) : isMultiKind(roleValue) ? (
            <Field label={roleEntityLabel} hint={t("users.multiEntityHint")}>
              <EntityMultiPicker
                options={roleEntityOptions}
                selected={roleEntities}
                onChange={setRoleEntities}
                placeholder={t("users.searchEntityPlaceholder")}
              />
            </Field>
          ) : (
            <Field label={roleEntityLabel}>
              <Select value={roleEntity} onChange={(e) => setRoleEntity(e.target.value)}>
                <option value="">{t("common.choose")}</option>
                {roleEntityOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
          )}
          <SupervisorSelect users={usersQ.data ?? []} value={roleSupervisor} onChange={setRoleSupervisor} t={t} excludeId={roleUser?.id} />
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

/**
 * Sélecteur multi-entités (villes d'un DIRIGEANT, régions d'un SENIOR) : recherche + liste cochable
 * + badges des sélections. L'ordre de sélection compte : la première est le rattachement principal (★).
 */
function EntityMultiPicker({
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
