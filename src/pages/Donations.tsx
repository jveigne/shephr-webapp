import { useMemo, useState } from "react";
import { Icons } from "@/components/icons";
import {
  Badge, Button, Drawer, Field, Input, Pagination, Select, Table, TopBar, UnitTypeBadge,
} from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { CATEGORIES, DONATIONS, LOCALITIES, UNITS, gbp } from "@/data/mock";

type Donation = (typeof DONATIONS)[number];

function DetailRow({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 11, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
      <div style={{ marginTop: 4, color: "var(--ink-800)" }}>{value}</div>
    </div>
  );
}

const DEFAULT_FILTERS = {
  period: "Mai 2026",
  locality: "Toutes",
  unit: "Toutes",
  type: "Tous",
  category: "Toutes",
  member: "",
  minAmount: "",
  maxAmount: "",
};

export default function DonationsPage() {
  const { push } = useToasts();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<Donation | null>(null);
  const perPage = 14;

  const filtered = useMemo(() => {
    return DONATIONS.filter((d) => {
      if (filters.locality !== "Toutes" && d.locality !== filters.locality) return false;
      if (filters.unit !== "Toutes" && d.unit !== filters.unit) return false;
      if (filters.type !== "Tous" && d.type !== filters.type) return false;
      if (filters.category !== "Toutes" && d.category !== filters.category) return false;
      if (filters.member && !d.member.toLowerCase().includes(filters.member.toLowerCase())) return false;
      if (filters.minAmount && d.amount < Number(filters.minAmount)) return false;
      if (filters.maxAmount && d.amount > Number(filters.maxAmount)) return false;
      return true;
    });
  }, [filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const activeChips: { key: string; val: string; on?: string }[] = [];
  if (filters.period !== "—") activeChips.push({ key: "Période", val: filters.period });
  if (filters.locality !== "Toutes") activeChips.push({ key: "Localité", val: filters.locality, on: "locality" });
  if (filters.unit !== "Toutes") activeChips.push({ key: "Unité", val: filters.unit, on: "unit" });
  if (filters.type !== "Tous") activeChips.push({ key: "Type", val: filters.type, on: "type" });
  if (filters.category !== "Toutes") activeChips.push({ key: "Catégorie", val: filters.category, on: "category" });
  if (filters.member) activeChips.push({ key: "Membre", val: filters.member, on: "member" });
  if (filters.minAmount) activeChips.push({ key: "Min", val: `£${filters.minAmount}`, on: "minAmount" });
  if (filters.maxAmount) activeChips.push({ key: "Max", val: `£${filters.maxAmount}`, on: "maxAmount" });

  const clearOne = (key: string) =>
    setFilters((f) => ({
      ...f,
      [key]:
        key === "member" || key === "minAmount" || key === "maxAmount" ? ""
        : key === "type" ? "Tous"
        : "Toutes",
    }));
  const clearAll = () => setFilters(DEFAULT_FILTERS);

  const cols = [
    { label: "Date",      sortable: true, render: (r: Donation) => <span className="num">{r.date}</span> },
    { label: "Localité",  sortable: true, render: (r: Donation) => <span style={{ color: "var(--ink-700)" }}>{r.locality}</span> },
    { label: "Unité",     sortable: true, render: (r: Donation) => r.unit },
    { label: "Type",      render: (r: Donation) => <UnitTypeBadge type={r.type} /> },
    { label: "Membre",    sortable: true, render: (r: Donation) => r.member },
    { label: "Catégorie", render: (r: Donation) => <Badge tone="gray">{r.category}</Badge> },
    { label: "Montant",   sortable: true, cellClass: "num right", style: { textAlign: "right" as const }, render: (r: Donation) => <span className="amount">£ {gbp(r.amount)}</span> },
    { label: "Saisi le",  render: (r: Donation) => (
      <span style={{ color: "var(--ink-500)", fontSize: 12 }}>
        {r.capturedAt}
        <div style={{ color: "var(--ink-400)" }}>par {r.capturedBy}</div>
      </span>
    )},
  ];

  return (
    <>
      <TopBar
        title="Dons"
        crumbs={["Shephr", "Dons"]}
        actions={
          <>
            <Button variant="ghost" iconL={<Icons.Filter size={15} />}>Filtres avancés</Button>
            <Button
              variant="primary"
              iconL={<Icons.Download size={15} />}
              onClick={() => push({ kind: "ok", title: "Export en cours", msg: `${filtered.length} dons · CSV` })}
            >
              Exporter CSV
            </Button>
          </>
        }
      />

      <div className="content">
        <div className="filters">
          <Field label="Période">
            <Select value={filters.period} onChange={(e) => setFilters({ ...filters, period: e.target.value })}>
              <option>Mai 2026</option>
              <option>Avril 2026</option>
              <option>30 derniers jours</option>
              <option>Année en cours</option>
              <option>Personnalisée…</option>
            </Select>
          </Field>
          <Field label="Localité">
            <Select value={filters.locality} onChange={(e) => setFilters({ ...filters, locality: e.target.value })}>
              <option>Toutes</option>
              {LOCALITIES.map((l) => <option key={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Unité">
            <Select value={filters.unit} onChange={(e) => setFilters({ ...filters, unit: e.target.value })}>
              <option>Toutes</option>
              {UNITS.map((u) => <option key={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option>Tous</option>
              <option>Centre</option>
              <option>Assemblée</option>
            </Select>
          </Field>
          <Field label="Catégorie">
            <Select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
              <option>Toutes</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Membre" style={{ minWidth: 180 }}>
            <Input placeholder="Recherche…" icon={<Icons.Search size={14} />}
              value={filters.member} onChange={(e) => setFilters({ ...filters, member: e.target.value })} />
          </Field>
          <Field label="Min £">
            <Input placeholder="0" value={filters.minAmount}
              onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })} style={{ width: 90 }} />
          </Field>
          <Field label="Max £">
            <Input placeholder="∞" value={filters.maxAmount}
              onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })} style={{ width: 90 }} />
          </Field>
        </div>

        {activeChips.length > 0 && (
          <div className="chips" style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: "var(--ink-500)", marginRight: 4 }}>Filtres actifs :</span>
            {activeChips.map((c, i) => (
              <span className="chip" key={i}>
                <span className="key">{c.key} :</span>
                <span>{c.val}</span>
                {c.on && <button className="x" onClick={() => clearOne(c.on!)}><Icons.X size={11} /></button>}
              </span>
            ))}
            <Button variant="ghost" size="sm" onClick={clearAll}>Tout effacer</Button>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ color: "var(--ink-500)", fontSize: 13 }}>
            <strong style={{ color: "var(--ink-800)" }}>{filtered.length}</strong> dons trouvés ·
            <strong style={{ color: "var(--green-800)", marginLeft: 6 }}>
              £ {gbp(filtered.reduce((a, b) => a + b.amount, 0))}
            </strong> au total
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table
            columns={cols}
            rows={pageRows.map((r) => ({ ...r, _key: r.id }))}
            zebra
            onRowClick={(r: any) => setDrawer(r)}
            empty={
              <div className="empty">
                <div className="icon-wrap"><Icons.Inbox size={26} /></div>
                <h4>Aucun don ne correspond</h4>
                <p>Aucun résultat pour ces filtres. Essayez d'élargir la période ou de retirer un filtre.</p>
                <Button variant="secondary" onClick={clearAll}>Réinitialiser les filtres</Button>
              </div>
            }
          />
          {filtered.length > 0 && (
            <Pagination page={page} pageCount={pageCount} total={filtered.length} perPage={perPage} onPage={setPage} />
          )}
        </div>
      </div>

      <Drawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title="Détail du don"
        sub={drawer?.id ? `Référence ${drawer.id.toUpperCase()}` : null}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDrawer(null)}>Fermer</Button>
            <Button variant="secondary" iconL={<Icons.Edit size={14} />}>Modifier</Button>
          </>
        }
      >
        {drawer && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <div style={{ color: "var(--ink-500)", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em" }}>
                Montant
              </div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 36, fontWeight: 500, color: "var(--green-800)", letterSpacing: "-.015em", marginTop: 4 }}>
                £ {gbp(drawer.amount)}
              </div>
              <div style={{ marginTop: 6 }}>
                <Badge tone="gray">{drawer.category}</Badge>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <DetailRow label="Date" value={drawer.date} />
              <DetailRow label="Devise" value="GBP" />
              <DetailRow label="Membre" value={drawer.member} />
              <DetailRow label="Saisi le" value={drawer.capturedAt} />
              <DetailRow label="Localité" value={drawer.locality} />
              <DetailRow label="Saisi par" value={drawer.capturedBy} />
              <DetailRow label="Unité" value={drawer.unit} full />
              <DetailRow label="Type d'unité" value={<UnitTypeBadge type={drawer.type} />} />
            </div>

            <div className="stat-row">
              <div className="icon-wrap"><Icons.Info size={16} /></div>
              <div>
                <div style={{ fontSize: 12.5, color: "var(--ink-800)", fontWeight: 500 }}>Don physique déclaré</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
                  Espèces remises lors du culte du dimanche. La saisie est immuable une fois enregistrée.
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
