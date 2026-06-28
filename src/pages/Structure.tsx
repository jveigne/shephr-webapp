import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Field, IconButton, Input, Modal, Select, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { buildTree, type NodeLevel, type TreeNode } from "@/lib/orgTree";
import { COUNTRIES_FR_SORTED } from "@/lib/countries";
import { canHaveResponsables, isResponsableOf } from "@/lib/responsables";
import { ResponsablesDrawer } from "@/components/ResponsablesDrawer";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";
import { listMinistryUsers, type AdminUserResponse } from "@/services/userService";
import {
  createCountry, createLocality, createUnit, createZone,
  deleteCountry, deleteLocality, deleteUnit, deleteZone,
  fetchMinistryStructure, listContinents,
  updateCountry, updateLocality, updateUnit, updateZone,
} from "@/services/orgService";

const CHILD: Partial<Record<NodeLevel, NodeLevel>> = {
  MINISTRY: "COUNTRY", COUNTRY: "ZONE", ZONE: "LOCALITY", LOCALITY: "UNIT",
};

type Editing =
  | { mode: "add"; level: NodeLevel; parent: TreeNode }
  | { mode: "edit"; level: NodeLevel; node: TreeNode };

interface FormValues {
  continentId: string;
  code: string;
  name: string;
  nameEn: string;
  defaultCurrency: string;
  description: string;
  country: string;
  type: "CENTER" | "ASSEMBLY";
}
const EMPTY_VALUES: FormValues = {
  continentId: "", code: "", name: "", nameEn: "", defaultCurrency: "", description: "", country: "", type: "CENTER",
};

export default function StructurePage() {
  const { push } = useToasts();
  const qc = useQueryClient();
  const { t } = useTranslation();

  const [ministryId, setMinistryId] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [deleting, setDeleting] = useState<TreeNode | null>(null);
  const [responsablesNode, setResponsablesNode] = useState<TreeNode | null>(null);

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const continentsQ = useQuery({ queryKey: ["continents"], queryFn: listContinents });
  const structureQ = useQuery({
    queryKey: ["ministry-structure", ministryId],
    queryFn: () => fetchMinistryStructure(ministryId),
    enabled: !!ministryId,
  });
  const usersQ = useQuery({
    queryKey: ["ministry-users", ministryId],
    queryFn: () => listMinistryUsers(ministryId),
    enabled: !!ministryId,
  });
  const users: AdminUserResponse[] = usersQ.data ?? [];

  const ministryName = useMemo(
    () => (ministriesQ.data ?? []).find((m) => m.id === ministryId)?.name ?? "—",
    [ministriesQ.data, ministryId],
  );

  const tree = useMemo(() => {
    if (!structureQ.data || !ministryId) return null;
    return buildTree(structureQ.data, ministryId, ministryName);
  }, [structureQ.data, ministryId, ministryName]);

  const continentIdByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of continentsQ.data ?? []) m.set(c.code, c.id);
    return m;
  }, [continentsQ.data]);

  // Sélection d'un pays dans le référentiel → préremplit code / noms / devise / continent.
  const pickCountry = (code: string) => {
    const c = COUNTRIES_FR_SORTED.find((x) => x.code === code);
    if (!c) { setValues((v) => ({ ...v, code: "" })); return; }
    setValues((v) => ({
      ...v,
      code: c.code,
      name: c.fr,
      nameEn: c.en,
      defaultCurrency: c.cur,
      continentId: continentIdByCode.get(c.cont) ?? v.continentId,
    }));
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ministry-structure", ministryId] });
  const closeForm = () => { setEditing(null); setValues(EMPTY_VALUES); };

  const openAdd = (parent: TreeNode) => {
    const level = CHILD[parent.level]!;
    setValues({ ...EMPTY_VALUES, continentId: continentsQ.data?.[0]?.id ?? "" });
    setEditing({ mode: "add", level, parent });
  };
  const openEdit = (node: TreeNode) => {
    const d = node.data ?? {};
    setValues({
      ...EMPTY_VALUES,
      continentId: d.continentId ?? "",
      code: d.code ?? "",
      name: d.name ?? "",
      nameEn: d.nameEn ?? "",
      defaultCurrency: d.defaultCurrency ?? "",
      description: d.description ?? "",
      country: d.country ?? "",
      type: d.type ?? "CENTER",
    });
    setEditing({ mode: "edit", level: node.level, node });
  };

  const saveM = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const v = values;
      if (editing.mode === "add") {
        const parent = editing.parent;
        switch (editing.level) {
          case "COUNTRY":
            return createCountry({ ministryId, continentId: v.continentId, code: v.code.trim(), name: v.name.trim(), nameEn: v.nameEn.trim(), defaultCurrency: v.defaultCurrency.trim() });
          case "ZONE":
            return createZone({ countryId: parent.id, name: v.name.trim(), description: v.description.trim() || undefined });
          case "LOCALITY":
            return createLocality({ ministryId, zoneId: parent.id, name: v.name.trim(), country: v.country.trim() || undefined });
          case "UNIT":
            return createUnit({ ministryId, localityId: parent.id, name: v.name.trim(), type: v.type });
        }
      } else {
        const id = editing.node.id;
        switch (editing.level) {
          case "COUNTRY":
            return updateCountry(id, { continentId: v.continentId, name: v.name.trim(), nameEn: v.nameEn.trim(), defaultCurrency: v.defaultCurrency.trim() });
          case "ZONE":
            return updateZone(id, { name: v.name.trim(), description: v.description.trim() });
          case "LOCALITY":
            return updateLocality(id, { name: v.name.trim(), country: v.country.trim() });
          case "UNIT":
            return updateUnit(id, { name: v.name.trim(), type: v.type });
        }
      }
    },
    onSuccess: () => { invalidate(); closeForm(); push({ kind: "ok", title: t("structure.savedToast"), msg: "" }); },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const deleteM = useMutation({
    mutationFn: async (node: TreeNode) => {
      switch (node.level) {
        case "COUNTRY": return deleteCountry(node.id);
        case "ZONE": return deleteZone(node.id);
        case "LOCALITY": return deleteLocality(node.id);
        case "UNIT": return deleteUnit(node.id);
      }
    },
    onSuccess: () => { invalidate(); setDeleting(null); push({ kind: "ok", title: t("structure.deletedToast"), msg: "" }); },
    onError: (e: unknown) => push({ kind: "error", title: t("structure.deleteFailToast"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  // Validation des champs requis selon le niveau.
  const valid = (() => {
    if (!editing) return false;
    if (!values.name.trim()) return false;
    if (editing.level === "COUNTRY") {
      if (!values.continentId || !values.nameEn.trim() || !values.defaultCurrency.trim()) return false;
      if (editing.mode === "add" && !values.code.trim()) return false;
    }
    return true;
  })();

  return (
    <>
      <TopBar title={t("structure.title")} crumbs={[t("common.jexcellence"), t("structure.title")]} />
      <div className="content">
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line,#eee)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{t("structure.workspaceTitle")}</span>
            <Select value={ministryId} onChange={(e) => setMinistryId(e.target.value)}>
              <option value="">{t("structure.pickMinistry")}</option>
              {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>

          {!ministryId ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>{t("structure.pickMinistryHint")}</div>
          ) : structureQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("structure.loading")}</div>
          ) : tree ? (
            <div style={{ padding: "8px 4px" }}>
              <StructureRow node={tree} depth={0} users={users} onAdd={openAdd} onEdit={openEdit} onDelete={setDeleting} onResponsables={setResponsablesNode} t={t} />
            </div>
          ) : null}
        </div>
      </div>

      <ResponsablesDrawer
        node={responsablesNode}
        ministryId={ministryId}
        users={users}
        org={structureQ.data ? { countries: structureQ.data.countries, zones: structureQ.data.zones, units: structureQ.data.units } : undefined}
        onClose={() => setResponsablesNode(null)}
      />

      {/* Modale ajout / édition */}
      <Modal
        open={!!editing}
        onClose={closeForm}
        title={editing ? (editing.mode === "add" ? t("structure.addTitle", { level: t(`subscriptions.level.${editing.level}`) }) : t("structure.editTitle", { level: t(`subscriptions.level.${editing.level}`) })) : ""}
        sub={editing?.mode === "add" ? t("structure.underNode", { name: editing.parent.name }) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>{t("common.cancel")}</Button>
            <Button variant="primary" disabled={!valid || saveM.isPending} onClick={() => saveM.mutate()}>
              {saveM.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </>
        }
      >
        {editing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {editing.level === "COUNTRY" && (
              <>
                <Field label={t("structure.countrySelect")} hint={editing.mode === "edit" ? t("structure.codeLocked") : undefined}>
                  <Select value={values.code} onChange={(e) => pickCountry(e.target.value)}>
                    <option value="">{t("subscriptions.chooseOption")}</option>
                    {COUNTRIES_FR_SORTED.map((c) => <option key={c.code} value={c.code}>{c.fr}</option>)}
                  </Select>
                </Field>
                {values.code && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <Field label={t("structure.code")}><Input value={values.code} disabled /></Field>
                    <Field label={t("structure.nameEn")}><Input value={values.nameEn} disabled /></Field>
                    <Field label={t("structure.currency")}><Input value={values.defaultCurrency} disabled /></Field>
                  </div>
                )}
                <Field label={t("structure.continent")}>
                  <Select value={values.continentId} onChange={(e) => setValues({ ...values, continentId: e.target.value })}>
                    <option value="">{t("subscriptions.chooseOption")}</option>
                    {(continentsQ.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              </>
            )}

            {editing.level === "ZONE" && (
              <>
                <Field label={t("structure.name")}>
                  <Input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
                </Field>
                <Field label={t("structure.description")}>
                  <Input value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} />
                </Field>
              </>
            )}

            {editing.level === "LOCALITY" && (
              <>
                <Field label={t("structure.name")}>
                  <Input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
                </Field>
                <Field label={t("structure.countryLabel")}>
                  <Input value={values.country} onChange={(e) => setValues({ ...values, country: e.target.value })} />
                </Field>
              </>
            )}

            {editing.level === "UNIT" && (
              <>
                <Field label={t("structure.name")}>
                  <Input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
                </Field>
                <Field label={t("structure.unitType")}>
                  <Select value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value as "CENTER" | "ASSEMBLY" })}>
                    <option value="CENTER">{t("structure.typeCenter")}</option>
                    <option value="ASSEMBLY">{t("structure.typeAssembly")}</option>
                  </Select>
                </Field>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Confirmation suppression */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={t("structure.deleteTitle")}
        sub={deleting ? `${t(`subscriptions.level.${deleting.level}`)} · ${deleting.name}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>{t("common.cancel")}</Button>
            <Button variant="danger" disabled={deleteM.isPending} onClick={() => deleting && deleteM.mutate(deleting)}>
              {deleteM.isPending ? t("common.loading") : t("structure.confirmDelete")}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: "var(--ink-600)" }}>{t("structure.deleteWarning")}</p>
      </Modal>
    </>
  );
}

function StructureRow({
  node, depth, users, onAdd, onEdit, onDelete, onResponsables, t,
}: {
  node: TreeNode;
  depth: number;
  users: AdminUserResponse[];
  onAdd: (n: TreeNode) => void;
  onEdit: (n: TreeNode) => void;
  onDelete: (n: TreeNode) => void;
  onResponsables: (n: TreeNode) => void;
  t: (k: string, o?: any) => string;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const canAddChild = !!CHILD[node.level];
  const isMinistry = node.level === "MINISTRY";
  const respCount = canHaveResponsables(node.level)
    ? users.filter((u) => isResponsableOf(u, node.level, node.id)).length
    : 0;
  return (
    <div>
      <div className="tree-row" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 8px", paddingLeft: 8 + depth * 18, borderRadius: 8 }}>
        {hasChildren ? (
          <span onClick={() => setOpen((v) => !v)} style={{ display: "inline-flex", width: 18, justifyContent: "center", cursor: "pointer", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }}>
            <Icons.ChevRight size={13} />
          </span>
        ) : <span style={{ width: 18 }} />}
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--ink-400)", minWidth: 62 }}>
          {t(`subscriptions.level.${node.level}`)}
        </span>
        <span style={{ fontWeight: isMinistry ? 600 : 500 }}>{node.name}</span>
        {node.level === "UNIT" && node.data?.type && (
          <Badge tone={node.data.type === "CENTER" ? "green" : "earth"}>
            {node.data.type === "CENTER" ? t("structure.typeCenter") : t("structure.typeAssembly")}
          </Badge>
        )}
        <span style={{ flex: 1 }} />
        {canHaveResponsables(node.level) && (
          <button type="button" className="btn ghost sm" onClick={() => onResponsables(node)} title={t("responsables.title")} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icons.Users size={14} />{respCount > 0 ? respCount : ""}
          </button>
        )}
        {canAddChild && (
          <IconButton icon={<Icons.Plus size={15} />} title={t("structure.addChild", { level: t(`subscriptions.level.${CHILD[node.level]}`) })} onClick={() => onAdd(node)} />
        )}
        {!isMinistry && (
          <>
            <IconButton icon={<Icons.Edit size={15} />} title={t("common.update")} onClick={() => onEdit(node)} />
            <IconButton icon={<Icons.Trash size={15} />} danger title={t("structure.delete")} onClick={() => onDelete(node)} />
          </>
        )}
      </div>
      {open && hasChildren && node.children.map((c) => (
        <StructureRow key={c.id} node={c} depth={depth + 1} users={users} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onResponsables={onResponsables} t={t} />
      ))}
    </div>
  );
}
