import { Icons } from "@/components/icons";
import { Badge, Button, TopBar } from "@/components/primitives";
import { AreaChart, HorizontalBars, Spark } from "@/components/charts";
import { useAuth } from "@/context/AuthContext";
import { useToasts } from "@/context/ToastContext";
import { ADMIN, DONATIONS, LOCALITY_BARS, MONTHLY_SERIES, TOP_UNITS, gbp } from "@/data/mock";

function KpiCard({
  label, value, delta, sub, mini, spark,
}: { label: string; value: string; delta?: number; sub?: string; mini?: string; spark?: any[] }) {
  return (
    <div className="kpi">
      <div className="deco" />
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <div>
          {delta != null ? (
            <div className={`delta ${delta >= 0 ? "up" : "down"}`}>
              {delta >= 0 ? <Icons.Arrow_Up size={13} /> : <Icons.Arrow_Down size={13} />}
              {Math.abs(delta).toFixed(1)} %
              <span className="vs">vs mois dernier</span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
              {sub} {mini && <span style={{ color: "var(--green-700)", fontWeight: 500, marginLeft: 6 }}>· {mini}</span>}
            </div>
          )}
        </div>
        {spark && <Spark data={spark} />}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { push } = useToasts();
  const { user } = useAuth();
  const firstName = (user?.fullName || ADMIN.shortName).split(" ")[0];
  const ministry = (user as any)?.ministryName || ADMIN.ministry;

  const cur = MONTHLY_SERIES[MONTHLY_SERIES.length - 1].total;
  const prev = MONTHLY_SERIES[MONTHLY_SERIES.length - 2].total;
  const ytd = MONTHLY_SERIES.slice(-5).reduce((a, b) => a + b.total, 0);
  const delta = ((cur - prev) / prev) * 100;
  const dateToday = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <TopBar
        title="Tableau de bord"
        crumbs={["Shephr", "Tableau de bord"]}
        actions={
          <>
            <Button variant="ghost" iconL={<Icons.Calendar size={15} />}>Ce mois-ci</Button>
            <Button
              variant="secondary"
              iconL={<Icons.Download size={15} />}
              onClick={() => push({ kind: "ok", title: "Rapport mensuel téléchargé", msg: "Mai 2026 · CSV (32 Ko)" })}
            >
              Exporter le mois
            </Button>
          </>
        }
      />

      <div className="content">
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <div style={{
              fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 500,
              color: "var(--green-800)", letterSpacing: "-0.015em", lineHeight: 1.1,
            }}>
              Bonjour, <em style={{ fontStyle: "italic", color: "var(--earth-600)" }}>{firstName}</em>.
            </div>
            <div style={{ color: "var(--ink-500)", marginTop: 6, fontSize: 13.5 }}>
              {dateToday} · Voici un aperçu de la générosité dans votre ministère.
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, color: "var(--ink-500)", fontSize: 12.5 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-400)" }}>Ministère</div>
              <div style={{ color: "var(--ink-800)", fontWeight: 500, marginTop: 2 }}>{ministry}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-400)" }}>Devise</div>
              <div style={{ color: "var(--ink-800)", fontWeight: 500, marginTop: 2 }}>GBP £</div>
            </div>
          </div>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <KpiCard label="Total ce mois" value={`£ ${gbp(cur)}`} delta={delta} spark={MONTHLY_SERIES.slice(-6)} />
          <KpiCard label="Mois précédent" value={`£ ${gbp(prev)}`} sub="Avril 2026" spark={MONTHLY_SERIES.slice(-8, -2)} />
          <KpiCard label="Année en cours" value={`£ ${gbp(ytd)}`} sub="Janv. → Mai 2026" spark={MONTHLY_SERIES.slice(-5)} />
          <KpiCard label="Membres actifs" value="294" sub="Donné dans 3 derniers mois" mini="71 % du total" />
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div>
              <h3 className="ttl">Évolution mensuelle des dons</h3>
              <div className="sub">12 derniers mois · toutes localités confondues</div>
            </div>
            <div className="right chart-legend">
              <span><span className="swatch" style={{ background: "var(--green-700)" }} />Total mensuel</span>
            </div>
          </div>
          <div className="card-body">
            <AreaChart data={MONTHLY_SERIES} />
          </div>
        </div>

        <div className="two-col" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="ttl">Répartition par localité</h3>
                <div className="sub">Mai 2026</div>
              </div>
              <div className="right"><Button variant="ghost" size="sm">Voir détail</Button></div>
            </div>
            <div className="card-body">
              <HorizontalBars data={LOCALITY_BARS} />
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="ttl">Top 5 unités · ce mois</h3>
                <div className="sub">Par volume cumulé</div>
              </div>
              <div className="right"><Button variant="ghost" size="sm">Tout voir</Button></div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {TOP_UNITS.map((u, i) => {
                const max = TOP_UNITS[0].total;
                return (
                  <div className="list-row" key={i}>
                    <div className="rank">{i + 1}</div>
                    <div className="label">
                      <div className="nm">{u.name}</div>
                      <div className="sub">{u.locality}</div>
                    </div>
                    <div className="meter"><div className="fill" style={{ width: `${(u.total / max) * 100}%` }} /></div>
                    <div className="val">£ {gbp(u.total)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="ttl">Derniers dons</h3>
              <div className="sub">10 entrées les plus récentes</div>
            </div>
            <div className="right">
              <Button variant="ghost" size="sm" iconR={<Icons.ArrowRight size={13} />}>Voir tous les dons</Button>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="activity-row" style={{
              borderBottom: "1px solid var(--line)",
              background: "var(--ivory-raised)",
              fontSize: 11.5, fontWeight: 600, textTransform: "uppercase",
              letterSpacing: ".08em", color: "var(--ink-500)",
            }}>
              <div>Date</div>
              <div>Membre</div>
              <div>Unité</div>
              <div>Catégorie</div>
              <div style={{ textAlign: "right" }}>Montant</div>
            </div>
            {DONATIONS.slice(0, 10).map((d) => (
              <div className="activity-row" key={d.id}>
                <div className="dt">{d.dateLabel}</div>
                <div className="who">{d.member}</div>
                <div className="where">
                  {d.unit}
                  <div style={{ color: "var(--ink-400)", fontSize: 11.5 }}>{d.locality}</div>
                </div>
                <div><Badge tone="gray">{d.category}</Badge></div>
                <div style={{ textAlign: "right" }}><span className="amount">£ {gbp(d.amount)}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
