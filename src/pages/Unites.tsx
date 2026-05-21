import { useState } from "react";
import { Icons } from "@/components/icons";
import {
  Button, Field, Input, Modal, Select, Table, Toggle, TopBar, UnitTypeBadge,
} from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { LOCALITIES, UNITS, gbp } from "@/data/mock";

export default function UnitesPage() {
  const { push } = useToasts();
  const [rows, setRows] = useState(UNITS);
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({ locality: "Toutes", type: "Tous", status: "Tous" });
  const [form, setForm] = useState({ name: "", type: "Assemblée", locality: "Londres", active: true });

  const submit = () => {
    if (!form.name.trim()) return;
    setRows([...rows, {
      id: `u-${rows.length + 1}`, name: form.name, type: form.type, locality: form.locality,
      leaders: [], members: 0, monthTotal: 0, active: form.active,
    }]);
    setForm({ name: "", type: "Assemblée", locality: "Londres", active: true });
    setOpen(false);
    push({ kind: "ok", title: "Unité créée", msg: form.name });
  };

  const toggleActive = (id: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, active: !r.active } : r)));

  const filtered = rows.filter((r) =>
    (filters.locality === "Toutes" || r.locality === filters.locality) &&
    (filters.type === "Tous" || r.type === filters.type) &&
    (filters.status === "Tous" || (filters.status === "Actif" ? r.active : !r.active))
  );

  const cols = [
    { label: "Nom", render: (r: any) => <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>{r.name}</span> },
    { label: "Type", render: (r: any) => <UnitTypeBadge type={r.type} /> },
    { label: "Localité", render: (r: any) => <span style={{ color: "var(--ink-700)" }}>{r.locality}</span> },
    { label: "Dirigeant(s)", render: (r: any) =>
      r.leaders.length === 0 ? (
        <span style={{ color: "var(--ink-400)", fontStyle: "italic" }}>Non assigné</span>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex" }}>
            {r.leaders.map((l: string, i: number) => (
              <div key={i} className="avatar sm" style={{ marginLeft: i > 0 ? -6 : 0, border: "2px solid var(--ivory-card)" }}>
                {l.split(" ").map((p: string) => p[0]).slice(0, 2).join("")}
              </div>
            ))}
          </div>
          <span style={{ fontSize: 12.5, color: "var(--ink-700)" }}>{r.leaders.join(", ")}</span>
        </div>
      )
    },
    { label: "Membres", cellClass: "num", render: (r: any) => <span style={{ fontWeight: 500 }}>{r.members}</span> },
    { label: "Mois en cours", cellClass: "num right", style: { textAlign: "right" as const },
      render: (r: any) => <span className="amount">£ {gbp(r.monthTotal)}</span> },
    { label: "Actif", render: (r: any) => <Toggle checked={r.active} onChange={() => toggleActive(r.id)} /> },
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
        title="Unités"
        crumbs={["Shephr", "Structure", "Unités"]}
        actions={
          <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={() => setOpen(true)}>
            Ajouter une unité
          </Button>
        }
      />
      <div className="content">
        <p className="section-sub">
          Une unité est une assemblée locale concrète. Les <strong>Centres</strong> rassemblent une congrégation principale ;
          les <strong>Assemblées</strong> sont rattachées et nourries par un Centre.
        </p>

        <div className="filters">
          <Field label="Localité">
            <Select value={filters.locality} onChange={(e) => setFilters({ ...filters, locality: e.target.value })}>
              <option>Toutes</option>
              {LOCALITIES.map((l) => <option key={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option>Tous</option>
              <option>Centre</option>
              <option>Assemblée</option>
            </Select>
          </Field>
          <Field label="Statut">
            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option>Tous</option>
              <option>Actif</option>
              <option>Inactif</option>
            </Select>
          </Field>
          <div className="right">
            <Field label="Recherche">
              <Input placeholder="Nom d'unité…" icon={<Icons.Search size={14} />} />
            </Field>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="card">
            <div className="empty">
              <div className="icon-wrap"><Icons.Unit size={26} /></div>
              <h4>Aucune unité ne correspond</h4>
              <p>Aucun résultat pour ces filtres. Réinitialisez ou créez une nouvelle unité pour commencer.</p>
              <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={() => setOpen(true)}>Ajouter une unité</Button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <Table columns={cols} rows={filtered.map((r) => ({ ...r, _key: r.id }))} zebra />
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nouvelle unité"
        sub="Précisez le type, la localité de rattachement et son statut."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="primary" onClick={submit}>Créer l'unité</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Nom de l'unité">
            <Input placeholder="Ex. Londres — Camden" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Type">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {["Centre", "Assemblée"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, type: t })}
                  style={{
                    padding: "14px 16px",
                    border: form.type === t
                      ? `1px solid ${t === "Centre" ? "var(--green-700)" : "var(--earth-600)"}`
                      : "1px solid var(--line)",
                    background: form.type === t
                      ? (t === "Centre" ? "var(--green-50)" : "var(--earth-50)")
                      : "var(--ivory-raised)",
                    borderRadius: 10, textAlign: "left", cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <UnitTypeBadge type={t} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                    {t === "Centre" ? "Congrégation principale." : "Rattachée à un Centre."}
                  </div>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Localité de rattachement">
            <Select value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })}>
              {LOCALITIES.map((l) => <option key={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "var(--ivory-raised)", borderRadius: 8, border: "1px solid var(--line)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Unité active</div>
              <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
                Les unités inactives n'apparaissent plus dans l'application mobile.
              </div>
            </div>
            <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
          </div>
        </div>
      </Modal>
    </>
  );
}
