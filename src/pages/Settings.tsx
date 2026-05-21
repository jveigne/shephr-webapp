import { useState } from "react";
import { Icons } from "@/components/icons";
import { Badge, Button, Field, Input, Select, Toggle, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { ADMIN, CATEGORIES } from "@/data/mock";

function ProfilTab() {
  const { push } = useToasts();
  const [name, setName] = useState(ADMIN.name);
  const [email, setEmail] = useState(ADMIN.email);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card card-pad" style={{ gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
          <div className="avatar" style={{ width: 64, height: 64, fontSize: 22 }}>{ADMIN.initials}</div>
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 500, color: "var(--green-800)" }}>
              {ADMIN.name}
            </div>
            <div style={{ color: "var(--ink-500)", fontSize: 13.5 }}>
              {ADMIN.role} · {ADMIN.ministry}
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <Button variant="secondary" iconL={<Icons.Upload size={14} />}>Changer la photo</Button>
          </div>
        </div>
        <div className="divider" style={{ margin: "12px 0 18px" }} />
        <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "0 0 14px" }}>
          Informations personnelles
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Nom complet"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} icon={<Icons.Mail size={14} />} /></Field>
          <Field label="Langue de l'interface">
            <Select defaultValue="Français"><option>Français</option><option>English</option></Select>
          </Field>
          <Field label="Fuseau horaire">
            <Select defaultValue="Europe/London"><option>Europe/London</option><option>Europe/Paris</option></Select>
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <Button variant="ghost">Annuler</Button>
          <Button variant="primary" onClick={() => push({ kind: "ok", title: "Profil mis à jour" })}>Enregistrer</Button>
        </div>
      </div>

      <div className="card card-pad" style={{ gridColumn: "1 / -1" }}>
        <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "0 0 6px" }}>
          Mot de passe
        </h3>
        <div style={{ color: "var(--ink-500)", fontSize: 13, marginBottom: 14 }}>
          Choisissez un mot de passe d'au moins 12 caractères. Évitez les mots du dictionnaire.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Field label="Mot de passe actuel"><Input type="password" placeholder="••••••••" /></Field>
          <Field label="Nouveau mot de passe"><Input type="password" placeholder="••••••••" /></Field>
          <Field label="Confirmer"><Input type="password" placeholder="••••••••" /></Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <Button variant="primary" onClick={() => push({ kind: "ok", title: "Mot de passe modifié" })}>
            Mettre à jour
          </Button>
        </div>
      </div>
    </div>
  );
}

function NotifsTab() {
  const { push } = useToasts();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    digestWeekly: true, digestMonthly: true,
    newDonation: false, lowActivity: true,
    newUser: true, invitePending: false,
    exportReady: true,
  });
  const NotifRow = ({ k, title, desc }: { k: string; title: string; desc: string }) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 14, color: "var(--ink-900)" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 2 }}>{desc}</div>
      </div>
      <Toggle checked={prefs[k]} onChange={(v) => setPrefs({ ...prefs, [k]: v })} />
    </div>
  );
  return (
    <div className="card card-pad">
      <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "0 0 6px" }}>
        Alertes par email
      </h3>
      <div style={{ color: "var(--ink-500)", fontSize: 13, marginBottom: 6 }}>
        Toutes les notifications sont envoyées à <strong style={{ color: "var(--ink-800)" }}>{ADMIN.email}</strong>.
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-400)", marginTop: 14, marginBottom: 4 }}>Synthèses</div>
        <NotifRow k="digestWeekly"  title="Synthèse hebdomadaire" desc="Récapitulatif des dons reçus chaque lundi matin." />
        <NotifRow k="digestMonthly" title="Synthèse mensuelle"     desc="Bilan complet à la clôture de chaque mois." />
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-400)", marginTop: 18, marginBottom: 4 }}>Activité</div>
        <NotifRow k="newDonation"  title="Chaque nouveau don" desc="Peut générer un volume important — réservé aux périodes calmes." />
        <NotifRow k="lowActivity"  title="Unité sans don depuis 30 jours" desc="Une unité active n'a rien déclaré récemment." />
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-400)", marginTop: 18, marginBottom: 4 }}>Utilisateurs</div>
        <NotifRow k="newUser"      title="Nouvel utilisateur inscrit" desc="Lorsqu'une invitation est acceptée." />
        <NotifRow k="invitePending" title="Invitation en attente > 7 jours" desc="Un rappel pour relancer la personne invitée." />
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-400)", marginTop: 18, marginBottom: 4 }}>Exports</div>
        <NotifRow k="exportReady" title="Export prêt à télécharger" desc="Pour les exports volumineux générés en arrière-plan." />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}>
        <Button variant="primary" onClick={() => push({ kind: "ok", title: "Préférences enregistrées" })}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

function SecuTab() {
  const sessions = [
    { dev: "MacBook Pro · Safari",   where: "Londres, Royaume-Uni",    when: "Active maintenant", current: true },
    { dev: "iPhone 14 · App Shephr", where: "Londres, Royaume-Uni",    when: "il y a 2 j" },
    { dev: "Windows · Chrome",       where: "Birmingham, Royaume-Uni", when: "il y a 6 j" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card card-pad">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div className="icon-wrap" style={{ width: 44, height: 44, borderRadius: 10, background: "var(--earth-50)", color: "var(--earth-700)", display: "grid", placeItems: "center" }}>
            <Icons.Shield size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: 0 }}>
                Authentification à deux facteurs
              </h3>
              <Badge tone="warn">Bientôt</Badge>
            </div>
            <div style={{ color: "var(--ink-500)", fontSize: 13, marginTop: 4 }}>
              Une couche supplémentaire de sécurité : un code à 6 chiffres demandé à chaque connexion.
              Disponible dans la version 2 de Shephr.
            </div>
          </div>
          <Button variant="secondary" disabled>Configurer</Button>
        </div>
      </div>

      <div className="card card-pad">
        <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "0 0 6px" }}>
          Sessions actives
        </h3>
        <div style={{ color: "var(--ink-500)", fontSize: 13, marginBottom: 14 }}>
          Appareils actuellement connectés à votre compte. Déconnectez ceux que vous ne reconnaissez pas.
        </div>
        {sessions.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid var(--line-soft)" }}>
            <div className="icon-wrap" style={{ width: 34, height: 34, borderRadius: 8, background: "var(--ivory-raised)", border: "1px solid var(--line)", color: "var(--ink-700)", display: "grid", placeItems: "center" }}>
              <Icons.Lock size={15} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>{s.dev}</span>
                {s.current && <Badge tone="ok" dot>Cette session</Badge>}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 2 }}>{s.where} · {s.when}</div>
            </div>
            {!s.current && <Button variant="ghost" size="sm">Déconnecter</Button>}
          </div>
        ))}
        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <Button variant="danger" iconL={<Icons.Logout size={14} />}>
            Se déconnecter de toutes les autres sessions
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConfigTab() {
  const { push } = useToasts();
  const [categories, setCategories] = useState(CATEGORIES.map((c, i) => ({ id: `c-${i}`, name: c, active: true })));
  const [newCat, setNewCat] = useState("");
  const [supported, setSupported] = useState<Record<string, boolean>>({ GBP: true, EUR: true, USD: false, CHF: false, CAD: false });
  const [defaultCur, setDefaultCur] = useState("GBP");

  const addCat = () => {
    if (!newCat.trim()) return;
    setCategories([...categories, { id: `c-${Date.now()}`, name: newCat.trim(), active: true }]);
    setNewCat("");
    push({ kind: "ok", title: "Catégorie ajoutée", msg: newCat });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card card-pad">
        <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "0 0 6px" }}>
          Catégories de dons
        </h3>
        <div style={{ color: "var(--ink-500)", fontSize: 13, marginBottom: 14 }}>
          Ces catégories apparaissent dans l'application mobile lors de la déclaration.
          Désactivez celles que vous n'utilisez plus sans rompre l'historique.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
          {categories.map((c) => (
            <div key={c.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px",
              background: "var(--ivory-raised)",
              border: "1px solid var(--line-soft)",
              borderRadius: 8,
            }}>
              <Icons.Tag size={14} style={{ color: "var(--earth-600)" }} />
              <span style={{ flex: 1, fontSize: 13.5, color: c.active ? "var(--ink-900)" : "var(--ink-400)" }}>{c.name}</span>
              <Toggle checked={c.active} onChange={(v) => setCategories(categories.map((x) => (x.id === c.id ? { ...x, active: v } : x)))} />
              <button className="icon-btn danger" onClick={() => setCategories(categories.filter((x) => x.id !== c.id))}>
                <Icons.Trash size={14} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Input
            placeholder="Nouvelle catégorie…"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCat()}
            icon={<Icons.Plus size={14} />}
          />
          <Button variant="secondary" onClick={addCat}>Ajouter</Button>
        </div>
      </div>

      <div className="card card-pad">
        <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "0 0 6px" }}>
          Devises
        </h3>
        <div style={{ color: "var(--ink-500)", fontSize: 13, marginBottom: 14 }}>
          La devise par défaut est utilisée pour toutes les saisies sauf indication contraire.
        </div>
        <Field label="Devise par défaut">
          <Select value={defaultCur} onChange={(e) => setDefaultCur(e.target.value)}>
            <option>GBP — Livre sterling</option>
            <option>EUR — Euro</option>
            <option>USD — Dollar US</option>
            <option>CHF — Franc suisse</option>
            <option>CAD — Dollar canadien</option>
          </Select>
        </Field>

        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-400)", marginTop: 18, marginBottom: 8 }}>
          Devises acceptées
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.keys(supported).map((cur) => (
            <div key={cur} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px",
              background: "var(--ivory-raised)",
              border: "1px solid var(--line-soft)",
              borderRadius: 8,
            }}>
              <Icons.Currency size={14} style={{ color: "var(--earth-600)" }} />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{cur}</span>
              <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
                {{ GBP: "Livre sterling", EUR: "Euro", USD: "Dollar US", CHF: "Franc suisse", CAD: "Dollar canadien" }[cur as "GBP"]}
              </span>
              <Toggle checked={supported[cur]} onChange={(v) => setSupported({ ...supported, [cur]: v })} />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <Button variant="primary" onClick={() => push({ kind: "ok", title: "Configuration enregistrée" })}>
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<"profil" | "notifs" | "secu" | "config">("profil");
  return (
    <>
      <TopBar title="Paramètres" crumbs={["Shephr", "Paramètres"]} />
      <div className="content narrow">
        <div className="tabs">
          <button className={`tab ${tab === "profil" ? "active" : ""}`} onClick={() => setTab("profil")}>
            <Icons.User size={15} /> Profil
          </button>
          <button className={`tab ${tab === "notifs" ? "active" : ""}`} onClick={() => setTab("notifs")}>
            <Icons.Bell size={15} /> Notifications
          </button>
          <button className={`tab ${tab === "secu" ? "active" : ""}`} onClick={() => setTab("secu")}>
            <Icons.Shield size={15} /> Sécurité
          </button>
          <button className={`tab ${tab === "config" ? "active" : ""}`} onClick={() => setTab("config")}>
            <Icons.Tag size={15} /> Devises et catégories
          </button>
        </div>

        {tab === "profil" && <ProfilTab />}
        {tab === "notifs" && <NotifsTab />}
        {tab === "secu" && <SecuTab />}
        {tab === "config" && <ConfigTab />}
      </div>
    </>
  );
}
