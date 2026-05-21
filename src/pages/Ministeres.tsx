import { useState } from "react";
import { Icons } from "@/components/icons";
import { Badge, Button, Field, Input, Modal, Select, Table, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { MINISTRIES } from "@/data/mock";

export default function MinisteresPage() {
  const { push } = useToasts();
  const [rows, setRows] = useState(MINISTRIES);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", country: "Royaume-Uni", currency: "GBP" });

  const submit = () => {
    if (!form.name.trim()) return;
    const id = `min-${rows.length + 1}`;
    setRows([...rows, {
      id, name: form.name, country: form.country, currency: form.currency,
      createdAt: "18 mai 2026", localities: 0, units: 0, members: 0,
    }]);
    setForm({ name: "", country: "Royaume-Uni", currency: "GBP" });
    setOpen(false);
    push({ kind: "ok", title: "Ministère créé", msg: form.name });
  };

  const cols = [
    { label: "Nom", render: (r: any) => <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>{r.name}</span> },
    { label: "Pays", render: (r: any) => (
      <span style={{ color: "var(--ink-700)" }}>
        <Icons.Globe size={13} style={{ verticalAlign: -2, marginRight: 6, color: "var(--ink-400)" }} />{r.country}
      </span>
    )},
    { label: "Devise par défaut", render: (r: any) => <Badge tone="earth">{r.currency} £</Badge> },
    { label: "Localités", cellClass: "num", render: (r: any) => <span style={{ color: "var(--ink-800)" }}>{r.localities}</span> },
    { label: "Unités",    cellClass: "num", render: (r: any) => <span style={{ color: "var(--ink-800)" }}>{r.units}</span> },
    { label: "Date de création", render: (r: any) => <span style={{ color: "var(--ink-500)" }}>{r.createdAt}</span> },
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
        title="Ministères"
        crumbs={["Shephr", "Structure", "Ministères"]}
        actions={
          <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={() => setOpen(true)}>
            Ajouter un ministère
          </Button>
        }
      />
      <div className="content narrow">
        <p className="section-sub">
          Un ministère regroupe l'ensemble des localités sous une même autorité spirituelle et administrative.
          Pour ce pilote, vous gérez <strong style={{ color: "var(--green-800)" }}>CMCI UK</strong>.
        </p>
        <div className="card" style={{ padding: 0 }}>
          <Table columns={cols} rows={rows.map((r) => ({ ...r, _key: r.id }))} zebra />
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nouveau ministère"
        sub="Définissez l'entité racine de votre organisation."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="primary" onClick={submit}>Créer le ministère</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Nom du ministère" hint="Ex. CMCI UK, CMCI Île-de-France…">
            <Input placeholder="CMCI UK" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Pays">
              <Select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                <option>Royaume-Uni</option>
                <option>France</option>
                <option>Belgique</option>
                <option>Suisse</option>
                <option>Canada</option>
              </Select>
            </Field>
            <Field label="Devise par défaut">
              <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option>GBP</option>
                <option>EUR</option>
                <option>CHF</option>
                <option>CAD</option>
              </Select>
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}
