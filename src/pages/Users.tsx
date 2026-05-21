import { useEffect, useState } from "react";
import { Icons } from "@/components/icons";
import {
  Badge, Button, Field, Input, Modal, RoleBadge, Select, StatusBadge, Table, Toggle, TopBar,
} from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { UNITS, USERS } from "@/data/mock";

type User = (typeof USERS)[number];

function EditUserModal({
  user, onClose, onSave,
}: { user: User | null; onClose: () => void; onSave: (u: User) => void }) {
  const [draft, setDraft] = useState<User | null>(null);
  useEffect(() => { if (user) setDraft({ ...user }); }, [user]);
  if (!user || !draft) return null;
  const willDemote = user.role === "LEADER" && draft.role !== "LEADER";

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Modifier l'utilisateur"
      sub={user.email}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={() => onSave(draft)}>Enregistrer</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="avatar" style={{ width: 48, height: 48, fontSize: 16 }}>
            {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, color: "var(--green-800)" }}>{user.name}</div>
            <div style={{ color: "var(--ink-500)", fontSize: 12.5 }}>{user.email}</div>
          </div>
        </div>

        <Field label="Rôle">
          <Select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
            <option value="MEMBER">Membre</option>
            <option value="LEADER">Dirigeant</option>
            <option value="ADMIN">Administrateur</option>
          </Select>
        </Field>

        {draft.role === "LEADER" && (
          <Field label="Niveau">
            <Select
              value={draft.level === "—" ? "Junior" : draft.level}
              onChange={(e) => setDraft({ ...draft, level: e.target.value })}
            >
              <option>Senior</option>
              <option>Junior</option>
            </Select>
          </Field>
        )}

        <Field label="Unité de rattachement">
          <Select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>
            <option>—</option>
            {UNITS.map((u) => <option key={u.id}>{u.name}</option>)}
          </Select>
        </Field>

        {willDemote && (
          <div style={{
            padding: "12px 14px", background: "var(--warn-bg)", border: "1px solid rgba(176,122,42,.3)",
            borderRadius: 10, display: "flex", gap: 10,
          }}>
            <Icons.Warning size={18} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: "var(--ink-800)", lineHeight: 1.45 }}>
              <strong>Rétrogradation d'un dirigeant.</strong> En changeant son rôle, ses attributions d'unités
              et ses relations Senior/Junior seront automatiquement supprimées. Cette action peut être annulée
              en rétablissant son rôle puis en ré-assignant les unités.
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 12px", background: "var(--ivory-raised)", borderRadius: 8, border: "1px solid var(--line)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Compte actif</div>
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
              Désactivé : l'utilisateur ne peut plus se connecter.
            </div>
          </div>
          <Toggle checked={draft.status === "Actif"} onChange={(v) => setDraft({ ...draft, status: v ? "Actif" : "Inactif" })} />
        </div>
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const { push } = useToasts();
  const [rows, setRows] = useState(USERS);
  const [filters, setFilters] = useState({ role: "Tous", unit: "Toutes", status: "Tous", search: "" });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [inviteResult, setInviteResult] = useState<{ link: string; email: string } | null>(null);
  const [invite, setInvite] = useState({
    email: "", name: "", role: "MEMBER", level: "Junior", unit: "Londres Sud — Croydon",
  });

  const filtered = rows.filter((r) => {
    if (filters.role !== "Tous" && r.role !== filters.role) return false;
    if (filters.unit !== "Toutes" && r.unit !== filters.unit) return false;
    if (filters.status !== "Tous" && r.status !== filters.status) return false;
    if (filters.search && !`${r.name} ${r.email}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  const submitInvite = () => {
    if (!invite.email || !invite.name) return;
    const id = `us-${rows.length + 1}`;
    setRows([{
      id, name: invite.name, email: invite.email, role: invite.role,
      level: invite.role === "LEADER" ? invite.level : "—",
      unit: invite.unit, ministry: "CMCI UK", status: "Invité", lastSeen: "—",
    }, ...rows]);
    const token = `inv-${Math.random().toString(36).slice(2, 10)}`;
    setInviteResult({ link: `https://app.shephr.uk/rejoindre/${token}`, email: invite.email });
  };

  const closeInvite = () => {
    setInviteOpen(false);
    setInvite({ email: "", name: "", role: "MEMBER", level: "Junior", unit: "Londres Sud — Croydon" });
    setInviteResult(null);
  };

  const cols = [
    { label: "Nom", render: (r: User) => (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="avatar md">{r.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</div>
        <div>
          <div style={{ fontWeight: 500, color: "var(--ink-900)" }}>{r.name}</div>
          <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{r.email}</div>
        </div>
      </div>
    )},
    { label: "Rôle",   render: (r: User) => <RoleBadge role={r.role} /> },
    { label: "Niveau", render: (r: User) => r.level === "—"
      ? <span style={{ color: "var(--ink-400)" }}>—</span>
      : <Badge tone={r.level === "Senior" ? "green" : "earth"}>{r.level}</Badge> },
    { label: "Unité", render: (r: User) => <span style={{ color: "var(--ink-700)" }}>{r.unit}</span> },
    { label: "Ministère", render: (r: User) => <span style={{ color: "var(--ink-700)" }}>{r.ministry}</span> },
    { label: "Statut", render: (r: User) => <StatusBadge status={r.status} /> },
    { label: "Dernière connexion", render: (r: User) => <span style={{ color: "var(--ink-500)" }}>{r.lastSeen}</span> },
    { label: "", style: { width: 90 }, render: (r: User) => (
      <div className="row-actions">
        <button className="icon-btn" title="Modifier" onClick={() => setEditUser(r)}><Icons.Edit size={15} /></button>
        <button className="icon-btn" title="Plus"><Icons.More size={15} /></button>
      </div>
    )},
  ];

  return (
    <>
      <TopBar
        title="Utilisateurs"
        crumbs={["Shephr", "Utilisateurs"]}
        actions={
          <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={() => setInviteOpen(true)}>
            Inviter un utilisateur
          </Button>
        }
      />
      <div className="content">
        <p className="section-sub">
          Membres, dirigeants et administrateurs. Les invitations sont envoyées par lien partageable.
        </p>

        <div className="filters">
          <Field label="Recherche" style={{ minWidth: 260, flex: 1 }}>
            <Input
              placeholder="Nom ou email…"
              icon={<Icons.Search size={14} />}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </Field>
          <Field label="Rôle">
            <Select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
              <option>Tous</option>
              <option value="MEMBER">Membre</option>
              <option value="LEADER">Dirigeant</option>
              <option value="ADMIN">Administrateur</option>
            </Select>
          </Field>
          <Field label="Unité">
            <Select value={filters.unit} onChange={(e) => setFilters({ ...filters, unit: e.target.value })}>
              <option>Toutes</option>
              {UNITS.map((u) => <option key={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Statut">
            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option>Tous</option>
              <option>Actif</option>
              <option>Inactif</option>
            </Select>
          </Field>
        </div>

        <div style={{ color: "var(--ink-500)", fontSize: 13, marginBottom: 10 }}>
          <strong style={{ color: "var(--ink-800)" }}>{filtered.length}</strong> utilisateurs ·{" "}
          <span>{filtered.filter((r) => r.role === "LEADER").length} dirigeants</span>,{" "}
          <span>{filtered.filter((r) => r.role === "MEMBER").length} membres</span>,{" "}
          <span>{filtered.filter((r) => r.role === "ADMIN").length} administrateur(s)</span>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table columns={cols} rows={filtered.map((r) => ({ ...r, _key: r.id }))} zebra />
        </div>
      </div>

      <Modal
        open={inviteOpen}
        onClose={closeInvite}
        title={inviteResult ? "Invitation prête" : "Inviter un utilisateur"}
        sub={inviteResult ? "Partagez ce lien avec la personne invitée." : "Saisissez les informations et le rôle dans l'organisation."}
        size="lg"
        footer={inviteResult ? (
          <Button variant="primary" onClick={closeInvite}>Terminé</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={closeInvite}>Annuler</Button>
            <Button variant="primary" onClick={submitInvite}>Générer l'invitation</Button>
          </>
        )}
      >
        {inviteResult ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="stat-row" style={{ background: "var(--green-50)", borderColor: "rgba(42,81,66,.18)" }}>
              <div className="icon-wrap" style={{ background: "var(--green-700)", color: "#FBF5E4" }}>
                <Icons.Check size={18} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--green-800)" }}>
                  Invitation créée pour {invite.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>{inviteResult.email}</div>
              </div>
            </div>
            <Field label="Lien d'invitation" hint="Le lien expire dans 7 jours.">
              <div style={{ display: "flex", gap: 8 }}>
                <Input value={inviteResult.link} readOnly style={{ fontFamily: "var(--font-mono)", fontSize: 12 }} />
                <Button
                  variant="secondary"
                  iconL={<Icons.Copy size={14} />}
                  onClick={() => {
                    navigator.clipboard?.writeText(inviteResult.link);
                    push({ kind: "ok", title: "Lien copié", msg: "Collez-le pour le partager." });
                  }}
                >
                  Copier
                </Button>
              </div>
            </Field>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Nom complet">
                <Input placeholder="Prénom Nom" value={invite.name}
                  onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
              </Field>
              <Field label="Adresse email">
                <Input type="email" placeholder="email@cmci.uk" value={invite.email}
                  onChange={(e) => setInvite({ ...invite, email: e.target.value })} icon={<Icons.Mail size={14} />} />
              </Field>
            </div>

            <Field label="Rôle dans l'organisation">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { v: "MEMBER", t: "Membre", d: "Déclare ses propres dons." },
                  { v: "LEADER", t: "Dirigeant", d: "Encadre une unité." },
                  { v: "ADMIN",  t: "Administrateur", d: "Accès complet web." },
                ].map((r) => (
                  <button key={r.v} type="button" onClick={() => setInvite({ ...invite, role: r.v })}
                    style={{
                      padding: "12px 14px",
                      border: invite.role === r.v ? "1px solid var(--green-700)" : "1px solid var(--line)",
                      background: invite.role === r.v ? "var(--green-50)" : "var(--ivory-raised)",
                      borderRadius: 10, textAlign: "left", cursor: "pointer",
                    }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--green-800)" }}>{r.t}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2, lineHeight: 1.35 }}>{r.d}</div>
                  </button>
                ))}
              </div>
            </Field>

            {invite.role === "LEADER" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Niveau">
                  <Select value={invite.level} onChange={(e) => setInvite({ ...invite, level: e.target.value })}>
                    <option>Senior</option>
                    <option>Junior</option>
                  </Select>
                </Field>
                <Field label="Unité de rattachement">
                  <Select value={invite.unit} onChange={(e) => setInvite({ ...invite, unit: e.target.value })}>
                    {UNITS.map((u) => <option key={u.id}>{u.name}</option>)}
                  </Select>
                </Field>
              </div>
            )}
            {invite.role === "MEMBER" && (
              <Field label="Unité de rattachement">
                <Select value={invite.unit} onChange={(e) => setInvite({ ...invite, unit: e.target.value })}>
                  {UNITS.map((u) => <option key={u.id}>{u.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
        )}
      </Modal>

      <EditUserModal
        user={editUser}
        onClose={() => setEditUser(null)}
        onSave={(updated) => {
          setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
          setEditUser(null);
          push({ kind: "ok", title: "Utilisateur mis à jour", msg: updated.name });
        }}
      />
    </>
  );
}
