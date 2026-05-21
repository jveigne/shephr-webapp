import { useState } from "react";
import { Icons } from "@/components/icons";
import { Button, Field, Input, Select, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { CATEGORIES, EXPORT_HISTORY, EXPORT_PRESETS, LOCALITIES, UNITS } from "@/data/mock";

export default function ExportsPage() {
  const { push } = useToasts();
  const [active, setActive] = useState("preset-min");
  const [config, setConfig] = useState({
    period: "Mois en cours",
    from: "01/05/2026",
    to: "31/05/2026",
    locality: "Toutes",
    unit: "Toutes",
    category: "Toutes",
    grouping: "Aucun",
  });
  const [history, setHistory] = useState(EXPORT_HISTORY);

  const generate = () => {
    const preset = EXPORT_PRESETS.find((p) => p.id === active);
    if (!preset) return;
    const id = `exp-${Date.now()}`;
    setHistory([
      { id, title: `${preset.title} · ${config.from} → ${config.to}`, by: "Vous", when: "à l'instant", rows: 248, size: "21 Ko" },
      ...history,
    ]);
    push({ kind: "ok", title: "Export généré", msg: "Téléchargement disponible dans l'historique." });
  };

  return (
    <>
      <TopBar title="Exports" crumbs={["Shephr", "Exports"]} />
      <div className="content">
        <p className="section-sub">
          Choisissez un modèle d'export, ajustez les paramètres puis générez un fichier CSV.
          Les exports passés restent disponibles au téléchargement pendant 90 jours.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.1fr", gap: 20 }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: 14, marginTop: 4 }}>Modèles d'export</h2>
            <div className="preset-grid">
              {EXPORT_PRESETS.map((p) => {
                const IconComp = Icons[p.icon as keyof typeof Icons];
                return (
                  <button
                    key={p.id}
                    className={`preset ${active === p.id ? "active" : ""}`}
                    onClick={() => setActive(p.id)}
                    type="button"
                    style={{ textAlign: "left" }}
                  >
                    <div className="icon-wrap">{IconComp ? <IconComp size={20} /> : null}</div>
                    <div style={{ flex: 1 }}>
                      <div className="tt">{p.title}</div>
                      <div className="ds">{p.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="section-title" style={{ marginBottom: 14, marginTop: 4 }}>Configuration</h2>
            <div className="card card-pad">
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="Période">
                  <Select value={config.period} onChange={(e) => setConfig({ ...config, period: e.target.value })}>
                    <option>Mois en cours</option>
                    <option>Mois dernier</option>
                    <option>3 derniers mois</option>
                    <option>Année en cours</option>
                    <option>Personnalisée</option>
                  </Select>
                </Field>
                {config.period === "Personnalisée" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Du">
                      <Input value={config.from} onChange={(e) => setConfig({ ...config, from: e.target.value })}
                        icon={<Icons.Calendar size={14} />} />
                    </Field>
                    <Field label="Au">
                      <Input value={config.to} onChange={(e) => setConfig({ ...config, to: e.target.value })}
                        icon={<Icons.Calendar size={14} />} />
                    </Field>
                  </div>
                )}

                {(active === "preset-loc" || active === "preset-min") && (
                  <Field label="Localité">
                    <Select value={config.locality} onChange={(e) => setConfig({ ...config, locality: e.target.value })}>
                      <option>Toutes</option>
                      {LOCALITIES.map((l) => <option key={l.id}>{l.name}</option>)}
                    </Select>
                  </Field>
                )}
                {active === "preset-uni" && (
                  <Field label="Unité">
                    <Select value={config.unit} onChange={(e) => setConfig({ ...config, unit: e.target.value })}>
                      <option>Toutes</option>
                      {UNITS.map((u) => <option key={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                )}
                {active === "preset-cat" && (
                  <Field label="Catégorie">
                    <Select value={config.category} onChange={(e) => setConfig({ ...config, category: e.target.value })}>
                      <option>Toutes</option>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </Select>
                  </Field>
                )}

                <Field label="Regrouper par">
                  <Select value={config.grouping} onChange={(e) => setConfig({ ...config, grouping: e.target.value })}>
                    <option>Aucun</option>
                    <option>Localité</option>
                    <option>Unité</option>
                    <option>Catégorie</option>
                    <option>Mois</option>
                  </Select>
                </Field>

                <div className="divider" style={{ margin: "4px 0" }} />

                <div className="stat-row" style={{ background: "var(--earth-50)", borderColor: "rgba(176,127,84,.25)" }}>
                  <div className="icon-wrap" style={{ background: "var(--earth-500)", color: "var(--green-900)" }}>
                    <Icons.Download size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-900)" }}>
                      Aperçu : ~248 lignes · 21 Ko
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                      Format CSV (séparateur point-virgule), UTF-8 avec BOM, compatible Excel.
                    </div>
                  </div>
                </div>

                <Button variant="primary" iconL={<Icons.Download size={15} />} onClick={generate}
                  style={{ justifyContent: "center", padding: "12px 14px" }}>
                  Générer l'export
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="divider section" />

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Historique des exports</h2>
          <Button variant="ghost" size="sm" iconL={<Icons.History size={13} />}>Tout l'historique</Button>
        </div>
        <div className="card" style={{ padding: 0 }}>
          {history.map((h) => (
            <div key={h.id} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 22px",
              borderBottom: "1px solid var(--line-soft)",
            }}>
              <div className="icon-wrap" style={{
                width: 36, height: 36, borderRadius: 8,
                background: "var(--green-50)", color: "var(--green-700)",
                display: "grid", placeItems: "center", flexShrink: 0,
              }}>
                <Icons.Folder size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, color: "var(--ink-900)" }}>{h.title}</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
                  Généré par {h.by} · {h.when} · {h.rows} lignes · {h.size}
                </div>
              </div>
              <Button variant="secondary" size="sm" iconL={<Icons.Download size={13} />}
                onClick={() => push({ kind: "ok", title: "Téléchargement", msg: h.title })}>
                Télécharger
              </Button>
            </div>
          ))}
          {history.length === 0 && (
            <div className="empty">
              <div className="icon-wrap"><Icons.History size={26} /></div>
              <h4>Aucun export pour l'instant</h4>
              <p>Vos exports apparaîtront ici. Sélectionnez un modèle ci-dessus pour commencer.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
