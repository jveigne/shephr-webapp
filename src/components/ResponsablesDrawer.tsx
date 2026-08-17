import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge, Button, Drawer, Field, Input, Modal, Select } from "./primitives";
import { RemoteSupervisorSelect, RemoteUserCombobox, type UserRef } from "./UserCombobox";
import { Icons } from "./icons";
import { useToasts } from "@/context/ToastContext";
import { invitationLink } from "@/services/ministryService";
import type { NodeLevel, TreeNode } from "@/lib/orgTree";
import { RESP_ROLES_BY_LEVEL, buildGoalAttachment, isMultiAttachmentRole, needsHomeAssembly } from "@/lib/responsables";
import { EntityMultiPicker } from "./EntityMultiPicker";
import {
  deactivateUser, inviteUser, listResponsables, reassignUser, regenerateInvitation, userLogin,
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
  | { mode: "assign" }
  | { mode: "edit"; user: AdminUserResponse }
  | null;

export function ResponsablesDrawer({
  node, ministryId, org, onClose,
}: {
  node: TreeNode | null;
  ministryId: string;
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
  // Le superviseur se choisit par recherche serveur : on garde le compte retenu pour l'afficher.
  const [supervisorRef, setSupervisorRef] = useState<UserRef | undefined>(undefined);
  // Affectation d'un utilisateur déjà existant (mode "assign").
  const [assignUserId, setAssignUserId] = useState("");
  /** Compte retenu pour l'affectation : ses rattachements pilotent le mode multi (voir saveM). */
  const [assignUser, setAssignUser] = useState<AdminUserResponse | undefined>(undefined);
  // Édition = réaffectation : niveau + entité cibles.
  const [editLevel, setEditLevel] = useState<NodeLevel>("ZONE");
  const [editEntity, setEditEntity] = useState("");
  /** Palier A2 — cibles multiples pour les rôles à SET (assemblées / villes / régions), ★ = principale. */
  const [editEntities, setEditEntities] = useState<string[]>([]);
  /**
   * Assemblée de rattachement PERSONNEL (RG-BQ-03) — où la personne déclare SES engagements, à ne
   * pas confondre avec le nœud qu'elle dirige. Nommer un SECRETARIAT ou un coordinateur sans elle
   * fait échouer l'écriture (`GOAL_UNIT_REQUIRED`, 422).
   */
  const [homeUnit, setHomeUnit] = useState("");
  // Codes d'invitation conservés sur les cartes (le backend ne les réexpose pas après coup).
  const [invites, setInvites] = useState<Record<string, { code: string | null; token: string }>>({});

  const addRoleOptions = node ? RESP_ROLES_BY_LEVEL[node.level] : [];
  const editRoleOptions = RESP_ROLES_BY_LEVEL[editLevel];

  // Responsables du nœud : la règle est portée par le serveur (l'annuaire complet n'est plus chargé).
  const responsablesQ = useQuery({
    queryKey: ["responsables", node?.id ?? "", node?.level ?? ""],
    queryFn: () => listResponsables(node!.id, node!.level),
    enabled: !!node,
  });
  const responsables = responsablesQ.data ?? [];

  const entityOptions = useMemo(() => {
    if (editLevel === "UNIT") return org?.units ?? [];
    if (editLevel === "LOCALITY") return org?.localities ?? [];
    if (editLevel === "ZONE") return org?.zones ?? [];
    if (editLevel === "COUNTRY") return (org?.countries ?? []).map((c) => ({ id: c.id, name: `${c.name} (${c.code})` }));
    return [];
  }, [editLevel, org]);

  // Déjà responsables de ce nœud : retirés des résultats de recherche à l'affectation.
  const responsableIds = useMemo(() => responsables.map((u) => u.id), [responsables]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["responsables"] });
    qc.invalidateQueries({ queryKey: ["responsable-counts", ministryId] });
    qc.invalidateQueries({ queryKey: ["users-page"] });   // page Utilisateurs
    qc.invalidateQueries({ queryKey: ["user-search"] });  // combobox à recherche serveur
  };
  const closeForm = () => {
    setForm(null); setFullName(""); setEmail(""); setRole(""); setEditEntity(""); setEditEntities([]);
    setSupervisorId(""); setSupervisorRef(undefined); setAssignUserId(""); setAssignUser(undefined);
    setHomeUnit("");
  };

  /**
   * Rattachements que la personne porte DÉJÀ au niveau visé (home en tête) : ils préremplissent la
   * multi-sélection, sans quoi une réaffectation depuis un nœud amputerait silencieusement le
   * périmètre d'un dirigeant multi-assemblées / multi-villes.
   */
  const currentEntitiesAt = (u: AdminUserResponse, lvl: NodeLevel): string[] => {
    const home = lvl === "UNIT" ? u.goalUnitId : lvl === "LOCALITY" ? u.goalCityId : lvl === "ZONE" ? u.goalZoneId : null;
    const set = lvl === "UNIT" ? u.goalUnitIds : lvl === "LOCALITY" ? u.goalCityIds : lvl === "ZONE" ? u.goalZoneIds : [];
    const rest = (set ?? []).filter((id) => id !== home);
    return home ? [home, ...rest] : rest;
  };

  /** Superviseur d'un compte, affichable sans recherche : son nom est résolu par le backend. */
  const supervisorRefOf = (u: AdminUserResponse): UserRef | undefined =>
    u.supervisorId ? { id: u.supervisorId, fullName: u.supervisorFullName ?? "", username: null, email: null } : undefined;

  const openAdd = () => {
    setFullName(""); setEmail(""); setRole(addRoleOptions[0] ?? "");
    setSupervisorId(""); setSupervisorRef(undefined); setHomeUnit("");
    setForm({ mode: "add" });
  };
  const openAssign = () => {
    setAssignUserId(""); setAssignUser(undefined); setRole(addRoleOptions[0] ?? "");
    setSupervisorId(""); setSupervisorRef(undefined); setHomeUnit("");
    setForm({ mode: "assign" });
  };
  // À la sélection de l'utilisateur, on préremplit son superviseur actuel et son assemblée
  // personnelle : sans ce préremplissage, nommer quelqu'un responsable d'un nœud le déplacerait
  // d'assemblée (ou échouerait), alors qu'on ne touche ici qu'à son poste de direction.
  const pickAssignUser = (id: string, picked?: AdminUserResponse) => {
    setAssignUserId(id);
    setAssignUser(picked);
    setSupervisorId(picked?.supervisorId ?? "");
    setSupervisorRef(picked ? supervisorRefOf(picked) : undefined);
    setHomeUnit(picked?.goalUnitId ?? "");
  };
  const openEdit = (u: AdminUserResponse) => {
    if (!node) return;
    setFullName(u.fullName); setEmail(u.email ?? "");
    setEditLevel(node.level);
    setEditEntity(node.level === "MINISTRY" ? "" : node.id);
    // Le nœud d'où l'on ouvre reste la cible principale ; ses autres rattachements le suivent.
    setEditEntities(node.level === "MINISTRY"
      ? []
      : [node.id, ...currentEntitiesAt(u, node.level).filter((id) => id !== node.id)]);
    setRole((u.goalRole ?? u.donationRole ?? RESP_ROLES_BY_LEVEL[node.level][0] ?? "") as ModuleRole | "");
    setSupervisorId(u.supervisorId ?? "");
    setSupervisorRef(supervisorRefOf(u));
    setHomeUnit(u.goalUnitId ?? "");
    setForm({ mode: "edit", user: u });
  };

  const changeEditLevel = (lvl: NodeLevel) => {
    setEditLevel(lvl);
    setEditEntity("");
    setEditEntities([]);
    setRole(RESP_ROLES_BY_LEVEL[lvl][0] ?? "");
  };

  /** Réaffectation multi-cibles : uniquement pour les rôles à SET, et hors niveau MINISTRY. */
  const editMulti = !!role && editLevel !== "MINISTRY" && isMultiAttachmentRole(role as ModuleRole);

  const saveM = useMutation({
    mutationFn: async () => {
      if (!form || !role) return;
      if (form.mode === "add") {
        if (!node) return;
        return inviteUser({
          email: email.trim(), fullName: fullName.trim(), ministryId,
          supervisorId: supervisorId || null,
          ...buildGoalAttachment(node.level, node.id, role, homeUnit || undefined),
        });
      }
      if (form.mode === "assign") {
        if (!node || !assignUserId) return;
        // Multi-rattachements : si la personne a DÉJÀ ce rôle au même niveau (DIRIGEANT/ville,
        // SENIOR/région), le nœud s'AJOUTE à ses rattachements ; sinon remplacement en bloc.
        const target = assignUser;
        const existing =
          node.level === "LOCALITY" && role === "DIRIGEANT" && target?.goalRole === "DIRIGEANT"
            ? (target.goalCityIds?.length ? target.goalCityIds : (target.goalCityId ? [target.goalCityId] : []))
          : node.level === "ZONE" && role === "DIRIGEANT_SENIOR" && target?.goalRole === "DIRIGEANT_SENIOR"
            ? (target.goalZoneIds?.length ? target.goalZoneIds : (target.goalZoneId ? [target.goalZoneId] : []))
          // Palier A2 : affecter un dirigeant d'unité à une 2ᵉ assemblée l'AJOUTE à son
          // périmètre au lieu de le déplacer. Volontairement exclu pour MEMBRE (mono-assemblée).
          : node.level === "UNIT" && role === "DIRIGEANT_UNITE" && target?.goalRole === "DIRIGEANT_UNITE"
            ? (target.goalUnitIds?.length ? target.goalUnitIds : (target.goalUnitId ? [target.goalUnitId] : []))
          : [];
        const entityIds = node.level === "MINISTRY" ? [] : [...existing.filter((id) => id !== node.id), node.id];
        return reassignUser(assignUserId, {
          goalRole: role,
          entityId: node.level === "MINISTRY" ? null : entityIds[0],
          entityIds: node.level === "MINISTRY" ? undefined : entityIds,
          // RG-BQ-03 — pour MEMBRE / DIRIGEANT_UNITE, c'est l'entité qui porte l'appartenance.
          goalUnitId: needsHomeAssembly(role) ? (homeUnit || undefined) : undefined,
          supervisorId: supervisorId || null,
        });
      }
      return reassignUser(form.user.id, {
        goalRole: role,
        entityId: editLevel === "MINISTRY" ? null : ((editMulti ? editEntities[0] : editEntity) || null),
        entityIds: editMulti ? editEntities : undefined,
        goalUnitId: needsHomeAssembly(role) ? (homeUnit || undefined) : undefined,
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

  const regenM = useMutation({
    mutationFn: (id: string) => regenerateInvitation(id),
    onSuccess: (res) => {
      setInvites((prev) => ({ ...prev, [res.userId]: { code: res.invitationShortCode, token: res.invitationToken } }));
      push({ kind: "ok", title: t("responsables.regeneratedToast"), msg: t("responsables.codeSaved") });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  /** Le champ « assemblée de rattachement » est-il affiché (et donc exigé) ? — RG-BQ-03. */
  const homeRequired = !!role && needsHomeAssembly(role as ModuleRole);

  const valid =
    (!homeRequired || homeUnit !== "")
    && (form?.mode === "add" ? (!!role && fullName.trim() !== "" && /.+@.+\..+/.test(email))
    : form?.mode === "assign" ? (!!role && !!assignUserId)
    : (!!role && (editLevel === "MINISTRY" || (editMulti ? editEntities.length > 0 : !!editEntity))));

  // Un seul champ, partagé par les trois modes (inviter / affecter / réaffecter) : la contrainte
  // RG-BQ-03 est la même partout, et trois copies divergeraient.
  const homeAssemblyField = homeRequired ? (
    <Field label={t("responsables.homeAssembly")} hint={t("responsables.homeAssemblyHint")}>
      <Select value={homeUnit} onChange={(e) => setHomeUnit(e.target.value)}>
        <option value="">{t("subscriptions.chooseOption")}</option>
        {(org?.units ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </Select>
    </Field>
  ) : null;

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
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={openAdd}>
                {t("responsables.add")}
              </Button>
              <Button variant="secondary" iconL={<Icons.User size={15} />} onClick={openAssign}>
                {t("responsables.assignExisting")}
              </Button>
            </div>

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
                      <div style={{ fontSize: 13, color: "var(--ink-500)" }}>{userLogin(u)}</div>
                      <div style={{ fontSize: 13, color: "var(--ink-500)" }}>
                        {t("responsables.supervisor")} : {u.supervisorId ? (u.supervisorFullName ?? "—") : t("responsables.root")}
                      </div>
                      {invites[u.id] && (
                        <div style={{ background: "var(--parchment, #faf7f0)", border: "1px solid var(--line,#eee)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{t("responsables.activationCode")}</div>
                          {invites[u.id].code && <CopyRow display={invites[u.id].code!} value={invites[u.id].code!} t={t} />}
                          <CopyRow display={t("responsables.copyLink")} value={invitationLink(invites[u.id].token)} t={t} small />
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Button variant="secondary" size="sm" onClick={() => openEdit(u)}>{t("responsables.reassign")}</Button>
                        {!u.active && (
                          <Button variant="secondary" size="sm" disabled={regenM.isPending} onClick={() => regenM.mutate(u.id)}>
                            {regenM.isPending ? t("common.loading") : t("responsables.regenerate")}
                          </Button>
                        )}
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
        title={
          form?.mode === "add" ? t("responsables.addTitle")
          : form?.mode === "assign" ? t("responsables.assignTitle")
          : t("responsables.reassignTitle")
        }
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
            {homeAssemblyField}
            <RemoteSupervisorSelect ministryId={ministryId} value={supervisorId} selected={supervisorRef}
              onChange={(id, u) => { setSupervisorId(id); setSupervisorRef(u); }} t={t} />
          </div>
        )}

        {form?.mode === "assign" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, color: "var(--ink-500)", fontSize: 13 }}>{t("responsables.assignHint")}</p>
            <RemoteUserCombobox
              ministryId={ministryId}
              value={assignUserId}
              selected={assignUser}
              excludeIds={responsableIds}
              onChange={pickAssignUser}
              t={t}
              label={t("responsables.assignUserLabel")}
            />
            <Field label={t("responsables.roleLabel")}>
              <Select value={role} onChange={(e) => setRole(e.target.value as ModuleRole)}>
                {addRoleOptions.map((r) => <option key={r} value={r}>{t(`responsables.role.${r}`)}</option>)}
              </Select>
            </Field>
            {homeAssemblyField}
            <RemoteSupervisorSelect ministryId={ministryId} value={supervisorId} selected={supervisorRef}
              onChange={(id, u) => { setSupervisorId(id); setSupervisorRef(u); }} t={t}
              excludeId={assignUserId || undefined} />
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
            {editLevel !== "MINISTRY" && (editMulti ? (
              <Field label={t("responsables.targetEntity")} hint={t("users.multiEntityHint")}>
                <EntityMultiPicker options={entityOptions} selected={editEntities} onChange={setEditEntities}
                  placeholder={t("users.searchEntityPlaceholder")} />
              </Field>
            ) : (
              <Field label={t("responsables.targetEntity")}>
                <Select value={editEntity} onChange={(e) => setEditEntity(e.target.value)}>
                  <option value="">{t("subscriptions.chooseOption")}</option>
                  {entityOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              </Field>
            ))}
            <Field label={t("responsables.roleLabel")}>
              <Select value={role} onChange={(e) => setRole(e.target.value as ModuleRole)}>
                {editRoleOptions.map((r) => <option key={r} value={r}>{t(`responsables.role.${r}`)}</option>)}
              </Select>
            </Field>
            {homeAssemblyField}
            <RemoteSupervisorSelect ministryId={ministryId} value={supervisorId} selected={supervisorRef}
              onChange={(id, u) => { setSupervisorId(id); setSupervisorRef(u); }} t={t} excludeId={form.user.id} />
          </div>
        )}
      </Modal>
    </>
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
