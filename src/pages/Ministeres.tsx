import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icons } from "@/components/icons";
import { Badge, Button, Field, Input, Modal, Select, Table, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import {
  bootstrapMinistry,
  invitationLink,
  listMinistries,
  type MinistryBootstrapResponse,
  type MinistryResponse,
} from "@/services/ministryService";

const EMPTY_FORM = {
  ministryName: "",
  defaultCurrency: "GBP",
  ministryCountry: "Royaume-Uni",
  localityName: "",
  adminEmail: "",
  adminFullName: "",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export default function MinisteresPage() {
  const { push } = useToasts();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [created, setCreated] = useState<MinistryBootstrapResponse | null>(null);

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });

  const bootstrapM = useMutation({
    mutationFn: bootstrapMinistry,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["ministries"] });
      setOpen(false);
      setForm(EMPTY_FORM);
      setCreated(res);
      push({ kind: "ok", title: "Ministère créé", msg: `Invitation générée pour ${res.adminEmail}` });
    },
    onError: (e: unknown) => {
      push({ kind: "error", title: "Échec de la création", msg: e instanceof Error ? e.message : "Erreur inconnue" });
    },
  });

  const canSubmit =
    !!form.ministryName.trim() &&
    /^[A-Z]{3}$/.test(form.defaultCurrency) &&
    !!form.localityName.trim() &&
    form.adminEmail.includes("@") &&
    !!form.adminFullName.trim();

  const submit = () => {
    if (!canSubmit) return;
    bootstrapM.mutate({
      ministryName: form.ministryName.trim(),
      defaultCurrency: form.defaultCurrency,
      ministryCountry: form.ministryCountry,
      localityName: form.localityName.trim(),
      adminEmail: form.adminEmail.trim(),
      adminFullName: form.adminFullName.trim(),
    });
  };

  const copy = (value: string, label: string) => {
    navigator.clipboard?.writeText(value).then(
      () => push({ kind: "ok", title: "Copié", msg: label }),
      () => push({ kind: "error", title: "Copie impossible", msg: "Copiez manuellement." }),
    );
  };

  const rows = ministriesQ.data ?? [];

  const cols = [
    { label: "Nom", render: (r: MinistryResponse) => <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>{r.name}</span> },
    {
      label: "Pays",
      render: (r: MinistryResponse) => (
        <span style={{ color: "var(--ink-700)" }}>
          <Icons.Globe size={13} style={{ verticalAlign: -2, marginRight: 6, color: "var(--ink-400)" }} />
          {r.country || "—"}
        </span>
      ),
    },
    { label: "Devise par défaut", render: (r: MinistryResponse) => <Badge tone="earth">{r.defaultCurrency}</Badge> },
    { label: "Date de création", render: (r: MinistryResponse) => <span style={{ color: "var(--ink-500)" }}>{fmtDate(r.createdAt)}</span> },
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
          Créer un ministère génère son premier contact (rôle Secrétariat) et un <strong>lien d'invitation</strong>
          {" "}à lui transmettre pour qu'il active son compte.
        </p>

        <div className="card" style={{ padding: 0 }}>
          {ministriesQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>Chargement…</div>
          ) : ministriesQ.isError ? (
            <div style={{ padding: 24, color: "var(--danger, #b4452f)" }}>
              Impossible de charger les ministères : {ministriesQ.error instanceof Error ? ministriesQ.error.message : "erreur"}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>Aucun ministère. Cliquez sur « Ajouter un ministère ».</div>
          ) : (
            <Table columns={cols} rows={rows.map((r) => ({ ...r, _key: r.id }))} zebra />
          )}
        </div>
      </div>

      {/* Création de ministère (bootstrap) */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nouveau ministère"
        sub="Crée le ministère, sa première localité et son contact référent (invitation)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="primary" onClick={submit} disabled={!canSubmit || bootstrapM.isPending}>
              {bootstrapM.isPending ? "Création…" : "Créer le ministère"}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Nom du ministère" hint="Ex. CMCI UK, CMCI Île-de-France…">
            <Input placeholder="CMCI UK" value={form.ministryName} onChange={(e) => setForm({ ...form, ministryName: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Pays">
              <Select value={form.ministryCountry} onChange={(e) => setForm({ ...form, ministryCountry: e.target.value })}>
                <option>Royaume-Uni</option>
                <option>France</option>
                <option>Belgique</option>
                <option>Suisse</option>
                <option>Canada</option>
                <option>Cameroun</option>
              </Select>
            </Field>
            <Field label="Devise par défaut" hint="Code ISO 4217">
              <Select value={form.defaultCurrency} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}>
                <option>GBP</option>
                <option>EUR</option>
                <option>CHF</option>
                <option>CAD</option>
                <option>XOF</option>
              </Select>
            </Field>
          </div>
          <Field label="Première localité" hint="Ex. Londres, Paris…">
            <Input placeholder="Londres" value={form.localityName} onChange={(e) => setForm({ ...form, localityName: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Contact référent — nom complet">
              <Input placeholder="Jean Dupont" value={form.adminFullName} onChange={(e) => setForm({ ...form, adminFullName: e.target.value })} />
            </Field>
            <Field label="Contact référent — e-mail">
              <Input type="email" placeholder="contact@cmci-uk.org" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      {/* Résultat : lien d'invitation à transmettre */}
      <Modal
        open={created != null}
        onClose={() => setCreated(null)}
        title="Ministère créé — invitation à transmettre"
        sub="Le contact référent activera son compte via ce lien (mot de passe à définir). Lien valable 14 jours."
        footer={<Button variant="primary" onClick={() => setCreated(null)}>Terminé</Button>}
      >
        {created && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Contact référent">
              <Input readOnly value={created.adminEmail} />
            </Field>
            <Field label="Lien d'invitation" hint="À transmettre au contact (hors-bande : e-mail, message…)">
              <div style={{ display: "flex", gap: 8 }}>
                <Input readOnly value={invitationLink(created.invitationToken)} />
                <Button variant="secondary" iconL={<Icons.Copy size={15} />} onClick={() => copy(invitationLink(created.invitationToken), "Lien d'invitation")}>
                  Copier
                </Button>
              </div>
            </Field>
            <Field label="Token (si besoin)">
              <div style={{ display: "flex", gap: 8 }}>
                <Input readOnly value={created.invitationToken} />
                <Button variant="secondary" iconL={<Icons.Copy size={15} />} onClick={() => copy(created.invitationToken, "Token")}>
                  Copier
                </Button>
              </div>
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
