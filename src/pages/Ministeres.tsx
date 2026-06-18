import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
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

function fmtDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

export default function MinisteresPage() {
  const { push } = useToasts();
  const qc = useQueryClient();
  const { t, i18n } = useTranslation();
  const dateLocale = (i18n.resolvedLanguage || i18n.language) === "en" ? "en-GB" : "fr-FR";
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
      push({ kind: "ok", title: t("ministries.createdToastTitle"), msg: t("ministries.createdToastMsg", { email: res.adminEmail }) });
    },
    onError: (e: unknown) => {
      push({ kind: "error", title: t("ministries.createFailToast"), msg: e instanceof Error ? e.message : t("common.errorUnknown") });
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
      () => push({ kind: "ok", title: t("common.copied"), msg: label }),
      () => push({ kind: "error", title: t("ministries.copyImpossibleTitle"), msg: t("ministries.copyImpossibleMsg") }),
    );
  };

  const rows = ministriesQ.data ?? [];

  const cols = [
    { label: t("ministries.colName"), render: (r: MinistryResponse) => <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>{r.name}</span> },
    {
      label: t("ministries.colCountry"),
      render: (r: MinistryResponse) => (
        <span style={{ color: "var(--ink-700)" }}>
          <Icons.Globe size={13} style={{ verticalAlign: -2, marginRight: 6, color: "var(--ink-400)" }} />
          {r.country || "—"}
        </span>
      ),
    },
    { label: t("ministries.colDefaultCurrency"), render: (r: MinistryResponse) => <Badge tone="earth">{r.defaultCurrency}</Badge> },
    { label: t("ministries.colCreatedAt"), render: (r: MinistryResponse) => <span style={{ color: "var(--ink-500)" }}>{fmtDate(r.createdAt, dateLocale)}</span> },
  ];

  return (
    <>
      <TopBar
        title={t("ministries.title")}
        crumbs={[t("common.shephr"), t("ministries.crumbStructure"), t("ministries.title")]}
        actions={
          <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={() => setOpen(true)}>
            {t("ministries.addMinistry")}
          </Button>
        }
      />
      <div className="content narrow">
        <p className="section-sub">
          <Trans i18nKey="ministries.intro" components={{ strong: <strong /> }} />
        </p>

        <div className="card" style={{ padding: 0 }}>
          {ministriesQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : ministriesQ.isError ? (
            <div style={{ padding: 24, color: "var(--danger, #b4452f)" }}>
              {t("ministries.loadError", { error: ministriesQ.error instanceof Error ? ministriesQ.error.message : t("ministries.errorWord") })}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("ministries.empty")}</div>
          ) : (
            <Table columns={cols} rows={rows.map((r) => ({ ...r, _key: r.id }))} zebra />
          )}
        </div>
      </div>

      {/* Création de ministère (bootstrap) */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("ministries.createTitle")}
        sub={t("ministries.createSub")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={submit} disabled={!canSubmit || bootstrapM.isPending}>
              {bootstrapM.isPending ? t("ministries.creating") : t("ministries.createButton")}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label={t("ministries.nameLabel")} hint={t("ministries.nameHint")}>
            <Input placeholder="CMCI UK" value={form.ministryName} onChange={(e) => setForm({ ...form, ministryName: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("ministries.countryLabel")}>
              <Select value={form.ministryCountry} onChange={(e) => setForm({ ...form, ministryCountry: e.target.value })}>
                <option>Royaume-Uni</option>
                <option>France</option>
                <option>Belgique</option>
                <option>Suisse</option>
                <option>Canada</option>
                <option>Cameroun</option>
              </Select>
            </Field>
            <Field label={t("ministries.currencyLabel")} hint={t("ministries.currencyHint")}>
              <Select value={form.defaultCurrency} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}>
                <option>GBP</option>
                <option>EUR</option>
                <option>CHF</option>
                <option>CAD</option>
                <option>XOF</option>
              </Select>
            </Field>
          </div>
          <Field label={t("ministries.firstLocalityLabel")} hint={t("ministries.firstLocalityHint")}>
            <Input placeholder={t("ministries.firstLocalityPlaceholder")} value={form.localityName} onChange={(e) => setForm({ ...form, localityName: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("ministries.contactNameLabel")}>
              <Input placeholder={t("ministries.contactNamePlaceholder")} value={form.adminFullName} onChange={(e) => setForm({ ...form, adminFullName: e.target.value })} />
            </Field>
            <Field label={t("ministries.contactEmailLabel")}>
              <Input type="email" placeholder={t("ministries.contactEmailPlaceholder")} value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      {/* Résultat : lien d'invitation à transmettre */}
      <Modal
        open={created != null}
        onClose={() => setCreated(null)}
        title={t("ministries.createdTitle")}
        sub={t("ministries.createdSub")}
        footer={<Button variant="primary" onClick={() => setCreated(null)}>{t("common.done")}</Button>}
      >
        {created && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label={t("ministries.contactReferentLabel")}>
              <Input readOnly value={created.adminEmail} />
            </Field>
            <Field label={t("ministries.invitationLinkLabel")} hint={t("ministries.invitationLinkHint")}>
              <div style={{ display: "flex", gap: 8 }}>
                <Input readOnly value={invitationLink(created.invitationToken)} />
                <Button variant="secondary" iconL={<Icons.Copy size={15} />} onClick={() => copy(invitationLink(created.invitationToken), t("ministries.copyInvitationLink"))}>
                  {t("common.copy")}
                </Button>
              </div>
            </Field>
            <Field label={t("ministries.tokenLabel")}>
              <div style={{ display: "flex", gap: 8 }}>
                <Input readOnly value={created.invitationToken} />
                <Button variant="secondary" iconL={<Icons.Copy size={15} />} onClick={() => copy(created.invitationToken, t("ministries.copyToken"))}>
                  {t("common.copy")}
                </Button>
              </div>
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
