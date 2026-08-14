import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge, Button, Field, Input, Modal, Select, Table, Toggle, TopBar } from "@/components/primitives";
import { RemoteSupervisorSelect, type UserRef } from "@/components/UserCombobox";
import { EntityMultiPicker } from "@/components/EntityMultiPicker";
import { isMultiAttachmentRole } from "@/lib/responsables";
import { useToasts } from "@/context/ToastContext";
import { useDebounced } from "@/hooks/useDebounced";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";
import { fetchMinistryStructure } from "@/services/orgService";
import {
  deleteUser, inviteUser, reassignUser, searchUsers, setUserPassword, updateUserInfo, userLogin,
  type AdminUserResponse, type InviteUserRequest, type ModuleRole,
} from "@/services/userService";

const ROLES: ModuleRole[] = ["MEMBRE", "DIRIGEANT_UNITE", "DIRIGEANT", "DIRIGEANT_SENIOR", "DIRIGEANT_COORDINATEUR", "LEADER", "SECRETARIAT"];

/** Tailles de page proposées — 25 par défaut : une page qui tient à l'écran, sans scroll infini. */
const PAGE_SIZES = [25, 50, 100];

/**
 * Rôles pour lesquels le rattachement géographique est OBLIGATOIRE : un responsable d'assemblée ou
 * de ville sans assemblée ni ville n'a pas de sens. À partir du rang SENIOR le rattachement est
 * facultatif — la visibilité vient de l'organigramme de personnes (superviseur), pas de la carte,
 * ce qui permet de nommer un senior / coordinateur / leader avant que sa région n'existe.
 */
const ENTITY_REQUIRED_ROLES: ModuleRole[] = ["MEMBRE", "DIRIGEANT_UNITE", "DIRIGEANT"];

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
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(PAGE_SIZES[0]);

  const [editUser, setEditUser] = useState<AdminUserResponse | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editActive, setEditActive] = useState(true);
  // Création d'un compte depuis le back-office : identifiant + rôle, rattachement facultatif.
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<ModuleRole>("DIRIGEANT_SENIOR");
  const [newEntity, setNewEntity] = useState("");
  const [newEntities, setNewEntities] = useState<string[]>([]);
  const [newSupervisor, setNewSupervisor] = useState("");
  // Le superviseur est choisi par recherche serveur : on garde le compte retenu pour l'afficher.
  const [newSupervisorRef, setNewSupervisorRef] = useState<UserRef | undefined>(undefined);
  // Code d'activation retourné à la création : à transmettre, la personne pose son mot de passe.
  const [created, setCreated] = useState<{ login: string; code: string | null } | null>(null);
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
  const [roleSupervisorRef, setRoleSupervisorRef] = useState<UserRef | undefined>(undefined);

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });

  // Recherche et filtres CÔTÉ SERVEUR : la liste peut compter des milliers de comptes, on ne charge
  // jamais l'annuaire complet. La recherche (nom approché, identifiant, email) porte sur TOUT le
  // périmètre — le backend ignore volontairement le filtre géographique quand elle est renseignée.
  const debouncedSearch = useDebounced(search);
  const searching = debouncedSearch.trim() !== "";
  // Le backend prend le sous-arbre du nœud : on ne transmet que le filtre le plus fin.
  const placeNodeId = fUnit || fZone || fCountry || undefined;

  const usersQ = useQuery({
    queryKey: ["users-page", ministryId, debouncedSearch, placeNodeId ?? "", fRole, page, size],
    queryFn: () => searchUsers({
      ministryId: ministryId || undefined,
      search: debouncedSearch,
      placeNodeId: searching ? undefined : placeNodeId,
      role: (fRole || undefined) as ModuleRole | undefined,
      page,
      size,
    }),
    placeholderData: (prev) => prev, // pagination sans clignotement
  });

  // Retour en première page dès qu'un critère change : rester page 12 sur un résultat de 3 pages
  // afficherait une liste vide.
  useEffect(() => { setPage(0); }, [ministryId, debouncedSearch, placeNodeId, fRole, size]);

  // Chargée MÊME sans ministère sélectionné (« Tous les ministères », l'état par défaut de la
  // page) : sans elle, les noms de rattachement s'affichaient « Région · — » et les sélecteurs
  // d'entité de la modale Rôle étaient vides — on ne pouvait plus affecter personne.
  const structureQ = useQuery({
    queryKey: ["ministry-structure", ministryId],
    queryFn: () => fetchMinistryStructure(ministryId),
  });

  const org = structureQ.data;
  const unitName = useMemo(() => new Map((org?.units ?? []).map((u) => [u.id, u.name])), [org]);
  const zoneName = useMemo(() => new Map((org?.zones ?? []).map((z) => [z.id, z.name])), [org]);
  const cityName = useMemo(() => new Map((org?.localities ?? []).map((l) => [l.id, l.name])), [org]);
  const countryName = useMemo(() => new Map((org?.countries ?? []).map((c) => [c.id, c.name])), [org]);

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
    // Palier A2 : un DIRIGEANT_UNITE peut tenir plusieurs assemblées — les lister toutes.
    const units = unionIds(u.goalUnitId, u.goalUnitIds);
    if (units.length) return `${t("subscriptions.level.UNIT")} · ${units.map((x) => unitName.get(x) ?? "—").join(", ")}`;
    if (u.goalCountryIds?.length) return `${t("subscriptions.level.COUNTRY")} · ${u.goalCountryIds.map((c) => countryName.get(c) ?? "—").join(", ")}`;
    if (u.goalRole === "LEADER" || u.goalRole === "SECRETARIAT") return t("subscriptions.level.MINISTRY");
    return "—";
  };

  // Les lignes viennent telles quelles du serveur : plus aucun filtrage en mémoire, sinon la
  // pagination serait fausse (on retirerait des lignes d'une page déjà découpée par le backend).
  const rows = useMemo(
    () => (usersQ.data?.content ?? []).map((u) => ({ ...u, _key: u.id })),
    [usersQ.data],
  );

  const total = usersQ.data?.totalElements ?? 0;
  const totalPages = usersQ.data?.totalPages ?? 0;
  const firstShown = total === 0 ? 0 : page * size + 1;
  const lastShown = Math.min(total, page * size + rows.length);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["users-page"] });
    qc.invalidateQueries({ queryKey: ["user-search"] }); // combobox superviseur (recherche serveur)
  };

  const updateM = useMutation({
    // Champs laissés vides = inchangés côté backend (null = « ne touche pas »).
    mutationFn: () => updateUserInfo(editUser!.id, {
      fullName: editName.trim(),
      email: editEmail.trim() || undefined,
      username: editUsername.trim() || undefined,
      active: editActive,
    }),
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

  const openEdit = (u: AdminUserResponse) => {
    setEditName(u.fullName ?? "");
    setEditEmail(u.email ?? "");
    setEditUsername(u.username ?? "");
    setEditActive(u.active);
    setEditUser(u);
  };

  /** Libellé d'identification : l'identifiant de connexion prime, l'email n'est qu'un contact. */
  

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
    const set = kind === "city" ? u.goalCityIds
      : kind === "zone" ? u.goalZoneIds
      : r === "DIRIGEANT_UNITE" ? u.goalUnitIds
      : [];
    const rest = (set ?? []).filter((id) => id !== home);
    return home ? [home, ...rest] : rest;
  };

  const isMultiKind = isMultiAttachmentRole;
  const entityRequired = (r: ModuleRole) => ENTITY_REQUIRED_ROLES.includes(r);

  const optionsForKind = (r: ModuleRole): Array<{ id: string; name: string }> =>
    entityKind(r) === "unit" ? (org?.units ?? [])
    : entityKind(r) === "city" ? (org?.localities ?? [])
    : entityKind(r) === "zone" ? (org?.zones ?? [])
    : entityKind(r) === "country" ? (org?.countries ?? [])
    : [];

  const labelForKind = (r: ModuleRole) =>
    entityKind(r) === "unit" ? t("subscriptions.level.UNIT")
    : entityKind(r) === "city" ? t("subscriptions.level.LOCALITY")
    : entityKind(r) === "zone" ? t("subscriptions.level.ZONE")
    : t("subscriptions.level.COUNTRY");

  const openRole = (u: AdminUserResponse) => {
    const r = u.goalRole ?? "MEMBRE";
    setRoleValue(r);
    setRoleEntity(currentEntityFor(u, r));
    setRoleEntities(currentEntitiesFor(u, r));
    setRoleSupervisor(u.supervisorId ?? "");
    // Le nom du superviseur vient de la ligne (résolu par le backend) : pas de recherche à l'ouverture.
    setRoleSupervisorRef(u.supervisorId
      ? { id: u.supervisorId, fullName: u.supervisorFullName ?? "", username: null, email: null }
      : undefined);
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

  const roleEntityOptions = optionsForKind(roleValue);
  const roleEntityLabel = labelForKind(roleValue);
  const roleValid = !entityRequired(roleValue)
    || (isMultiKind(roleValue) ? roleEntities.length > 0 : roleEntity !== "");

  // ---- Création d'un compte (invitation : le code d'activation permet à la personne de poser
  // son mot de passe elle-même sur l'écran /invitation/{token}) ----
  const resetCreate = () => {
    setNewName(""); setNewUsername(""); setNewEmail("");
    setNewRole("DIRIGEANT_SENIOR"); setNewEntity(""); setNewEntities([]);
    setNewSupervisor(""); setNewSupervisorRef(undefined);
  };

  const createM = useMutation({
    mutationFn: () => {
      const kind = entityKind(newRole);
      const body: InviteUserRequest = {
        fullName: newName.trim(),
        username: newUsername.trim() || undefined,
        email: newEmail.trim() || undefined,
        ministryId,
        supervisorId: newSupervisor || null,
        goalRole: newRole,
      };
      // Rattachement posé selon le rôle, uniquement s'il a été renseigné (facultatif ≥ SENIOR).
      const picked = isMultiKind(newRole) ? newEntities : (newEntity ? [newEntity] : []);
      // A2 : la 1ʳᵉ assemblée est la principale (home), les suivantes élargissent le périmètre.
      if (kind === "unit" && picked[0]) {
        body.goalUnitId = picked[0];
        if (isMultiKind(newRole)) body.goalUnitIds = picked;
      }
      if (kind === "city" && picked[0]) { body.goalCityId = picked[0]; body.goalCityIds = picked; }
      if (kind === "zone" && picked[0]) { body.goalZoneId = picked[0]; body.goalZoneIds = picked; }
      if (kind === "country" && picked.length) body.goalCountryIds = picked;
      return inviteUser(body);
    },
    onSuccess: (res) => {
      invalidate();
      setCreateOpen(false);
      setCreated({ login: newUsername.trim() || newEmail.trim(), code: res.invitationShortCode });
      resetCreate();
      push({ kind: "ok", title: t("users.createdToast"), msg: t("users.createdToastMsg") });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const createValid = newName.trim() !== ""
    && (newUsername.trim() !== "" || newEmail.trim() !== "")
    && (!entityRequired(newRole) || (isMultiKind(newRole) ? newEntities.length > 0 : newEntity !== ""));

  const cols = [
    { label: t("users.colName"), render: (u: AdminUserResponse) => <span style={{ fontWeight: 500 }}>{u.fullName}</span> },
    {
      label: t("users.colLogin"),
      render: (u: AdminUserResponse) => (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
          <span style={{ color: "var(--ink-600)" }}>{userLogin(u)}</span>
          {u.username && u.email && <span style={{ color: "var(--ink-400)", fontSize: 12 }}>{u.email}</span>}
        </div>
      ),
    },
    { label: t("users.colRole"), render: (u: AdminUserResponse) => { const r = u.goalRole ?? u.donationRole; return r ? <Badge tone="earth">{t(`responsables.role.${r}`)}</Badge> : <span style={{ color: "var(--ink-400)" }}>—</span>; } },
    { label: t("users.colAttachment"), render: (u: AdminUserResponse) => <span style={{ color: "var(--ink-500)" }}>{attachmentLabel(u)}</span> },
    { label: t("users.colSupervisor"), render: (u: AdminUserResponse) => <span style={{ color: "var(--ink-500)" }}>{u.supervisorId ? (u.supervisorFullName ?? "—") : t("responsables.root")}</span> },
    {
      label: t("users.colRegisteredAt"),
      render: (u: AdminUserResponse) => (
        <span style={{ color: "var(--ink-500)" }}>
          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
        </span>
      ),
    },
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
            {/* Vide = TOUS les ministères : un nouvel inscrit est rattaché au ministère par défaut,
                le masquer derrière un choix obligatoire le rendait introuvable. */}
            <Select value={ministryId} onChange={(e) => { setMinistryId(e.target.value); setFCountry(""); setFZone(""); setFUnit(""); }}>
              <option value="">{t("users.allMinistries")}</option>
              {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
            <div style={{ marginLeft: "auto" }}>
              {/* La création exige un ministère : la vue « tous les ministères » ne dit pas où créer. */}
              <Button variant="primary" size="sm" disabled={!ministryId}
                title={!ministryId ? t("users.createNeedsMinistry") : undefined}
                onClick={() => { resetCreate(); setCreateOpen(true); }}>
                {t("users.create")}
              </Button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, padding: "12px 16px", flexWrap: "wrap", borderBottom: "1px solid var(--line,#eee)" }}>
            <Field label={t("users.search")} hint={searching ? t("users.searchScopeHint") : undefined}>
              <Input placeholder={t("users.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </Field>
            {/* Filtres géographiques : ils ont besoin de la structure d'UN ministère. */}
            <Field label={t("subscriptions.level.COUNTRY")}>
              <Select value={fCountry} disabled={!ministryId || searching}
                onChange={(e) => { setFCountry(e.target.value); setFZone(""); setFUnit(""); }}>
                <option value="">{t("users.all")}</option>
                {(org?.countries ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={t("subscriptions.level.ZONE")}>
              <Select value={fZone} disabled={!ministryId || searching} onChange={(e) => { setFZone(e.target.value); setFUnit(""); }}>
                <option value="">{t("users.allFem")}</option>
                {(org?.zones ?? [])
                  .filter((z) => !fCountry || z.countryId === fCountry)
                  .map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </Select>
            </Field>
            <Field label={t("subscriptions.level.UNIT")}>
              <Select value={fUnit} disabled={!ministryId || searching} onChange={(e) => setFUnit(e.target.value)}>
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
          </div>

          {usersQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : (
            <>
              <Table columns={cols} rows={rows} zebra />
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--line,#eee)", flexWrap: "wrap" }}>
                <span style={{ color: "var(--ink-500)", fontSize: 13 }}>
                  {t("users.pageRange", { first: firstShown, last: lastShown, total })}
                </span>
                <Select value={String(size)} onChange={(e) => setSize(Number(e.target.value))} style={{ width: "auto" }}>
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{t("users.perPage", { count: n })}</option>)}
                </Select>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                  <Button variant="ghost" size="sm" disabled={page === 0 || usersQ.isFetching}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}>
                    {t("users.prevPage")}
                  </Button>
                  <span style={{ color: "var(--ink-500)", fontSize: 13 }}>
                    {t("users.pageOf", { page: totalPages === 0 ? 0 : page + 1, pages: totalPages })}
                  </span>
                  <Button variant="ghost" size="sm" disabled={page + 1 >= totalPages || usersQ.isFetching}
                    onClick={() => setPage((p) => p + 1)}>
                    {t("users.nextPage")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Création d'un compte */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("users.createTitle")} sub={t("users.createSub")}
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!createValid || createM.isPending} onClick={() => createM.mutate()}>{createM.isPending ? t("common.loading") : t("users.createConfirm")}</Button></>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={t("users.colName")}><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>
          <Field label={t("users.colUsername")} hint={t("users.usernameHint")}>
            <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="prenom.nom@shephr.org" />
          </Field>
          <Field label={t("users.emailOptional")} hint={t("users.emailOptionalHint")}>
            <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </Field>
          <Field label={t("users.colRole")}>
            <Select value={newRole} onChange={(e) => { setNewRole(e.target.value as ModuleRole); setNewEntity(""); setNewEntities([]); }}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`responsables.role.${r}`)}</option>)}
            </Select>
          </Field>
          {entityKind(newRole) == null ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>{t("users.roleMinistryWideHint")}</p>
          ) : isMultiKind(newRole) ? (
            <Field label={`${labelForKind(newRole)}${entityRequired(newRole) ? "" : ` · ${t("users.optional")}`}`}
              hint={entityRequired(newRole) ? t("users.multiEntityHint") : t("users.entityOptionalHint")}>
              <EntityMultiPicker options={optionsForKind(newRole)} selected={newEntities} onChange={setNewEntities}
                placeholder={t("users.searchEntityPlaceholder")} />
            </Field>
          ) : (
            <Field label={`${labelForKind(newRole)}${entityRequired(newRole) ? "" : ` · ${t("users.optional")}`}`}
              hint={entityRequired(newRole) ? undefined : t("users.entityOptionalHint")}>
              <Select value={newEntity} onChange={(e) => setNewEntity(e.target.value)}>
                <option value="">{entityRequired(newRole) ? t("common.choose") : t("users.noAttachment")}</option>
                {optionsForKind(newRole).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
          )}
          <RemoteSupervisorSelect ministryId={ministryId || undefined} value={newSupervisor} selected={newSupervisorRef}
            onChange={(id, u) => { setNewSupervisor(id); setNewSupervisorRef(u); }} t={t} />
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-400)" }}>{t("users.createHint")}</p>
        </div>
      </Modal>

      {/* Code d'activation à transmettre */}
      <Modal open={!!created} onClose={() => setCreated(null)} title={t("users.codeTitle")} sub={created?.login}
        footer={<Button variant="primary" onClick={() => setCreated(null)}>{t("common.close")}</Button>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, color: "var(--ink-600)" }}>{t("users.codeHint")}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 10, background: "var(--parchment,#faf7f0)", border: "1px solid var(--line,#eee)" }}>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 3, fontFamily: "ui-monospace, monospace" }}>
              {created?.code ?? "—"}
            </span>
            {created?.code && (
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(created.code!)}>
                {t("common.copy")}
              </Button>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-400)" }}>{t("users.codeExpiry")}</p>
        </div>
      </Modal>

      {/* Édition infos */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={t("users.editTitle")} sub={editUser ? userLogin(editUser) : undefined}
        footer={<><Button variant="ghost" onClick={() => setEditUser(null)}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!editName.trim() || updateM.isPending} onClick={() => updateM.mutate()}>{updateM.isPending ? t("common.loading") : t("common.save")}</Button></>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={t("users.colName")}><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></Field>
          <Field label={t("users.colUsername")} hint={t("users.usernameHint")}><Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} /></Field>
          <Field label={t("users.emailOptional")}><Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} /></Field>
          <Field label={t("users.colStatus")}><Toggle checked={editActive} onChange={setEditActive} label={editActive ? t("users.active") : t("users.inactive")} /></Field>
        </div>
      </Modal>

      {/* Changement de rôle */}
      <Modal open={!!roleUser} onClose={() => setRoleUser(null)} title={t("users.roleTitle")} sub={roleUser ? `${roleUser.fullName} · ${userLogin(roleUser)}` : undefined}
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
          <RemoteSupervisorSelect ministryId={ministryId || undefined} value={roleSupervisor} selected={roleSupervisorRef}
            onChange={(id, u) => { setRoleSupervisor(id); setRoleSupervisorRef(u); }} t={t} excludeId={roleUser?.id} />
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
      <Modal open={!!delUser} onClose={() => setDelUser(null)} title={t("users.deleteTitle")} sub={delUser ? `${delUser.fullName} · ${userLogin(delUser)}` : undefined}
        footer={<><Button variant="ghost" onClick={() => setDelUser(null)}>{t("common.cancel")}</Button>
          <Button variant="danger" disabled={delM.isPending} onClick={() => delM.mutate()}>{delM.isPending ? t("common.loading") : t("users.confirmDelete")}</Button></>}>
        <p style={{ margin: 0, color: "var(--ink-600)" }}>{t("users.deleteWarning")}</p>
      </Modal>
    </>
  );
}
