import { useState } from "react";
import { Icons } from "@/components/icons";
import { Badge, Button, Field, Modal, Select, Table, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { ADMIN, ASSIGNMENTS, HIERARCHY, UNITS, USERS } from "@/data/mock";

export default function HierarchyPage() {
  const { push } = useToasts();
  const [assignments, setAssignments] = useState(ASSIGNMENTS);
  const [tree, setTree] = useState(HIERARCHY);
  const [assignOpen, setAssignOpen] = useState(false);
  const [superOpen, setSuperOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ leader: "Marc Diallo", unit: "Londres Sud — Croydon" });
  const [superForm, setSuperForm] = useState({ senior: "Marc Diallo", junior: "Patrick Okongo" });
  const [superError, setSuperError] = useState("");

  const leaders = USERS.filter((u) => u.role === "LEADER");
  const seniors = leaders.filter((u) => u.level === "Senior");
  const juniors = leaders.filter((u) => u.level === "Junior");

  const submitAssign = () => {
    setAssignments([{
      id: `a-${assignments.length + 1}`,
      leader: assignForm.leader, unit: assignForm.unit,
      by: ADMIN.shortName, since: "18 mai 2026",
    }, ...assignments]);
    setAssignOpen(false);
    push({ kind: "ok", title: "Attribution créée", msg: `${assignForm.leader} → ${assignForm.unit}` });
  };

  const submitSuper = () => {
    const reverse = tree.find((t) => t.senior === superForm.junior && t.juniors.includes(superForm.senior));
    if (reverse) {
      setSuperError("Cette supervision créerait un cycle. Vérifiez les rôles.");
      return;
    }
    setSuperError("");
    setTree((prev) => {
      const exists = prev.find((t) => t.senior === superForm.senior);
      if (exists) {
        return prev.map((t) =>
          t.senior === superForm.senior
            ? { ...t, juniors: t.juniors.includes(superForm.junior) ? t.juniors : [...t.juniors, superForm.junior] }
            : t
        );
      }
      return [...prev, { senior: superForm.senior, juniors: [superForm.junior] }];
    });
    setSuperOpen(false);
    push({ kind: "ok", title: "Supervision ajoutée", msg: `${superForm.senior} supervise ${superForm.junior}` });
  };

  const removeAssignment = (id: string) => {
    setAssignments((a) => a.filter((x) => x.id !== id));
    push({ kind: "ok", title: "Attribution supprimée" });
  };

  const removeJunior = (senior: string, junior: string) => {
    setTree((prev) =>
      prev
        .map((t) => (t.senior === senior ? { ...t, juniors: t.juniors.filter((j) => j !== junior) } : t))
        .filter((t) => t.juniors.length > 0)
    );
    push({ kind: "ok", title: "Supervision supprimée", msg: `${senior} ↛ ${junior}` });
  };

  const assignCols = [
    { label: "Dirigeant", render: (r: any) => (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="avatar md">{r.leader.split(" ").map((p: string) => p[0]).slice(0, 2).join("")}</div>
        <div>
          <div style={{ fontWeight: 500, color: "var(--ink-900)" }}>{r.leader}</div>
          <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
            {leaders.find((l) => l.name === r.leader)?.level === "Senior"
              ? <Badge tone="green">Senior</Badge>
              : <Badge tone="earth">Junior</Badge>}
          </div>
        </div>
      </div>
    )},
    { label: "Unité", render: (r: any) => <span style={{ color: "var(--ink-800)" }}>{r.unit}</span> },
    { label: "Attribué par", render: (r: any) => <span style={{ color: "var(--ink-700)" }}>{r.by}</span> },
    { label: "Depuis", render: (r: any) => <span style={{ color: "var(--ink-500)" }}>{r.since}</span> },
    { label: "", style: { width: 60 }, render: (r: any) => (
      <div className="row-actions">
        <button className="icon-btn danger" title="Supprimer" onClick={() => removeAssignment(r.id)}>
          <Icons.Trash size={15} />
        </button>
      </div>
    )},
  ];

  return (
    <>
      <TopBar title="Hiérarchie des dirigeants" crumbs={["Shephr", "Hiérarchie"]} />
      <div className="content">
        <p className="section-sub">
          Deux mécanismes structurent l'encadrement : les <strong>attributions</strong> relient un dirigeant à une unité,
          la <strong>supervision Senior-Junior</strong> relie un dirigeant Senior à ses Juniors.
        </p>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, marginTop: 6 }}>
          <div>
            <h2 className="section-title">Attributions</h2>
            <div className="muted" style={{ fontSize: 13 }}>
              {assignments.length} attribution(s) actives · un dirigeant peut encadrer plusieurs unités.
            </div>
          </div>
          <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={() => setAssignOpen(true)}>
            Attribuer un dirigeant
          </Button>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <Table columns={assignCols} rows={assignments.map((r) => ({ ...r, _key: r.id }))} zebra />
        </div>

        <div className="divider section" />

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h2 className="section-title">Supervision Senior — Junior</h2>
            <div className="muted" style={{ fontSize: 13 }}>
              Un Senior accompagne et forme un ou plusieurs Juniors. Les boucles sont automatiquement bloquées.
            </div>
          </div>
          <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={() => setSuperOpen(true)}>
            Ajouter une supervision
          </Button>
        </div>

        <div className="card card-pad">
          <div className="tree">
            {tree.filter((t) => t.juniors.length > 0).map((t) => (
              <div key={t.senior}>
                <div className="tree-row">
                  <div className="avatar md">{t.senior.split(" ").map((p) => p[0]).slice(0, 2).join("")}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, color: "var(--ink-900)" }}>{t.senior}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                      <Badge tone="green">Senior</Badge>
                      <span style={{ marginLeft: 8 }}>{t.juniors.length} junior(s) supervisé(s)</span>
                    </div>
                  </div>
                </div>
                <div className="tree-children">
                  {t.juniors.map((j) => (
                    <div className="tree-row" key={j}>
                      <div className="avatar sm">{j.split(" ").map((p) => p[0]).slice(0, 2).join("")}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "var(--ink-800)", fontSize: 13.5 }}>{j}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                          <Badge tone="earth">Junior</Badge>
                        </div>
                      </div>
                      <button className="icon-btn danger" title="Retirer" onClick={() => removeJunior(t.senior, j)}>
                        <Icons.Trash size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Attribuer un dirigeant"
        sub="Reliez un dirigeant existant à une unité."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Annuler</Button>
            <Button variant="primary" onClick={submitAssign}>Attribuer</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Dirigeant">
            <Select value={assignForm.leader} onChange={(e) => setAssignForm({ ...assignForm, leader: e.target.value })}>
              {leaders.map((l) => <option key={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Unité">
            <Select value={assignForm.unit} onChange={(e) => setAssignForm({ ...assignForm, unit: e.target.value })}>
              {UNITS.map((u) => <option key={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={superOpen}
        onClose={() => { setSuperOpen(false); setSuperError(""); }}
        title="Ajouter une supervision"
        sub="Reliez un dirigeant Senior à un Junior qu'il accompagne."
        footer={
          <>
            <Button variant="ghost" onClick={() => { setSuperOpen(false); setSuperError(""); }}>Annuler</Button>
            <Button variant="primary" onClick={submitSuper}>Lier</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Dirigeant Senior">
            <Select value={superForm.senior} onChange={(e) => setSuperForm({ ...superForm, senior: e.target.value })}>
              {seniors.map((l) => <option key={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <div style={{ display: "flex", justifyContent: "center", color: "var(--ink-400)" }}>
            <Icons.Arrow_Down size={18} />
          </div>
          <Field label="Dirigeant Junior">
            <Select value={superForm.junior} onChange={(e) => setSuperForm({ ...superForm, junior: e.target.value })}>
              {juniors.map((l) => <option key={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          {superError && (
            <div style={{
              padding: "10px 12px", background: "var(--err-bg)", border: "1px solid rgba(168,70,58,.25)",
              borderRadius: 8, fontSize: 12.5, color: "var(--err)", display: "flex", gap: 8,
            }}>
              <Icons.Warning size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              {superError}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
