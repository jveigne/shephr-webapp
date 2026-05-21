import { useState } from "react";
import { Icons } from "@/components/icons";
import { Button, Field, Input, Modal, Select, Table, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { LOCALITIES } from "@/data/mock";

export default function LocalitesPage() {
  const { push } = useToasts();
  const [rows, setRows] = useState(LOCALITIES);
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({ ministry: "Tous", country: "Tous" });
  const [form, setForm] = useState({ name: "", ministry: "CMCI UK", country: "Royaume-Uni" });

  const submit = () => {
    if (!form.name.trim()) return;
    setRows([...rows, { id: `loc-${rows.length + 1}`, name: form.name, ministry: form.ministry, country: form.country, units: 0, members: 0 }]);
    setForm({ name: "", ministry: "CMCI UK", country: "Royaume-Uni" });
    setOpen(false);
    push({ kind: "ok", title: "Localité ajoutée", msg: form.name });
  };

  const filtered = rows.filter((r) =>
    (filters.ministry === "Tous" || r.ministry === filters.ministry) &&
    (filters.country === "Tous" || r.country === filters.country)
  );

  const cols = [
    { label: "Nom", render: (r: any) => (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--green-50)", color: "var(--green-700)", display: "grid", placeItems: "center" }}>
          <Icons.Locality size={15} />
        </div>
        <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>{r.name}</span>
      </div>
    )},
    { label: "Ministère", render: (r: any) => <span style={{ color: "var(--ink-700)" }}>{r.ministry}</span> },
    { label: "Pays", render: (r: any) => r.country },
    { label: "Unités",  cellClass: "num", render: (r: any) => <span style={{ fontWeight: 500 }}>{r.units}</span> },
    { label: "Membres", cellClass: "num", render: (r: any) => <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{r.members}</span> },
    { label: "", style: { width: 90 }, render: () => (
      <div className="row-actions">
        <button className="icon-btn" title="Modifier"><Icons.Edit size={15} /></button>
        <button className="icon-btn danger" title="Supprimer"><Icons.Trash size={15} /></button>
      </div>
    )},
  ];

  return (
    <>
      <TopBar
        title="Localités"
        crumbs={["Shephr", "Structure", "Localités"]}
        actions={
          <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={() => setOpen(true)}>
            Ajouter une localité
          </Button>
        }
      />
      <div className="content">
        <p className="section-sub">
          Les localités regroupent les unités d'une même ville ou région. Une localité contient un ou plusieurs Centres et leurs Assemblées rattachées.
        </p>
        <div className="filters">
          <Field label="Ministère">
            <Select value={filters.ministry} onChange={(e) => setFilters({ ...filters, ministry: e.target.value })}>
              <option>Tous</option>
              <option>CMCI UK</option>
            </Select>
          </Field>
          <Field label="Pays">
            <Select value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })}>
              <option>Tous</option>
              <option>Royaume-Uni</option>
            </Select>
          </Field>
          <div className="right">
            <Field label="Recherche">
              <Input placeholder="Nom de localité…" icon={<Icons.Search size={14} />} />
            </Field>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table columns={cols} rows={filtered.map((r) => ({ ...r, _key: r.id }))} zebra />
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nouvelle localité"
        sub="Une localité regroupe les unités d'une même ville ou région."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="primary" onClick={submit}>Créer la localité</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Nom de la localité">
            <Input placeholder="Ex. Manchester" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Ministère de rattachement">
              <Select value={form.ministry} onChange={(e) => setForm({ ...form, ministry: e.target.value })}>
                <option>CMCI UK</option>
              </Select>
            </Field>
            <Field label="Pays">
              <Select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                <option>Royaume-Uni</option>
                <option>France</option>
              </Select>
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}
