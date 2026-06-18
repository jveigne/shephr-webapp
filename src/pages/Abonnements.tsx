import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Checkbox, Field, Input, Modal, Select, Table, Toggle, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";
import {
  createSubscription,
  listCountries,
  listLocalities,
  listModules,
  listSubscriptions,
  listUnits,
  listZones,
  pricingQuote,
  suspendSubscription,
  updateModule,
  type BillingPeriod,
  type PricingQuoteResponse,
  type PricingZone,
  type SubscriptionResponse,
  type SubscriptionScope,
} from "@/services/subscriptionService";

const SCOPES: SubscriptionScope[] = ["MINISTRY", "COUNTRY", "ZONE", "LOCALITY", "UNIT"];
const ZONES: PricingZone[] = ["A", "B", "C", "D"];

function statusTone(s: string): "ok" | "gray" | "warn" {
  if (s === "ACTIVE") return "ok";
  if (s === "EXPIRED") return "warn";
  return "gray";
}

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

const EMPTY = {
  ministryId: "",
  scope: "MINISTRY" as SubscriptionScope,
  countryId: "",
  entityId: "",
  modules: [] as string[],
  zone: "A" as PricingZone,
  cmci: false,
  billingPeriod: "ANNUAL" as BillingPeriod,
  startDate: "",
  endDate: "",
  priceAmount: "",
  priceCurrency: "",
  notes: "",
};

export default function AbonnementsPage() {
  const { push } = useToasts();
  const qc = useQueryClient();
  const { t, i18n } = useTranslation();
  const dateLocale = (i18n.resolvedLanguage || i18n.language) === "en" ? "en-GB" : "fr-FR";

  const [filterMinistry, setFilterMinistry] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [quote, setQuote] = useState<PricingQuoteResponse | null>(null);

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const modulesQ = useQuery({ queryKey: ["modules"], queryFn: listModules });
  const subsQ = useQuery({
    queryKey: ["subscriptions", filterMinistry],
    queryFn: () => listSubscriptions(filterMinistry ? { ministryId: filterMinistry } : undefined),
  });

  // Pickers d'entité dépendants du scope + ministère choisis dans le formulaire de création.
  const needCountry = form.scope === "COUNTRY" || form.scope === "ZONE";
  const countriesQ = useQuery({
    queryKey: ["countries", form.ministryId],
    queryFn: () => listCountries(form.ministryId),
    enabled: open && needCountry && !!form.ministryId,
  });
  const zonesQ = useQuery({
    queryKey: ["zones", form.countryId],
    queryFn: () => listZones(form.countryId),
    enabled: open && form.scope === "ZONE" && !!form.countryId,
  });
  const localitiesQ = useQuery({
    queryKey: ["localities", form.ministryId],
    queryFn: () => listLocalities(form.ministryId),
    enabled: open && form.scope === "LOCALITY" && !!form.ministryId,
  });
  const unitsQ = useQuery({
    queryKey: ["units", form.ministryId],
    queryFn: () => listUnits(form.ministryId),
    enabled: open && form.scope === "UNIT" && !!form.ministryId,
  });

  const ministryName = useMemo(() => {
    const map = new Map((ministriesQ.data ?? []).map((m) => [m.id, m.name]));
    return (id: string | null) => (id ? map.get(id) ?? "—" : "—");
  }, [ministriesQ.data]);

  const payableModules = (modulesQ.data ?? []).filter((m) => !m.free);

  const resolvedEntityId = form.scope === "MINISTRY" ? form.ministryId : form.entityId;
  const canQuote = !!form.ministryId && !!resolvedEntityId && form.modules.length > 0;

  const toggleModuleM = useMutation({
    mutationFn: (v: { code: string; patch: { free?: boolean; enabled?: boolean } }) => updateModule(v.code, v.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["modules"] });
      push({ kind: "ok", title: t("subscriptions.moduleUpdated"), msg: "" });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const quoteM = useMutation({
    mutationFn: () =>
      pricingQuote({
        scope: form.scope,
        scopeEntityId: resolvedEntityId,
        moduleCodes: form.modules,
        zone: form.zone,
        cmci: form.cmci,
      }),
    onSuccess: (q) => {
      setQuote(q);
      // Pré-remplir le prix si toutes les lignes tarifées ont la même devise.
      const priced = q.lines.filter((l) => !l.onQuote && l.finalAmount != null);
      const currencies = new Set(priced.map((l) => l.currency));
      if (priced.length > 0 && currencies.size === 1) {
        const total = priced.reduce((s, l) => s + (l.finalAmount ?? 0), 0);
        setForm((f) => ({
          ...f,
          priceAmount: String(Math.round(total * 100) / 100),
          priceCurrency: priced[0].currency ?? "",
          billingPeriod: priced[0].billingPeriod ?? f.billingPeriod,
        }));
      }
    },
    onError: (e: unknown) => push({ kind: "error", title: t("subscriptions.quoteFailToast"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const createM = useMutation({
    mutationFn: () =>
      createSubscription({
        moduleCodes: form.modules,
        ministryId: form.ministryId,
        scope: form.scope,
        scopeEntityId: resolvedEntityId,
        tier: quote?.tier ?? null,
        pricingZone: form.zone,
        cmci: form.cmci,
        priceAmount: form.priceAmount ? Number(form.priceAmount) : null,
        priceCurrency: form.priceCurrency || null,
        billingPeriod: form.billingPeriod,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      setOpen(false);
      setForm(EMPTY);
      setQuote(null);
      push({ kind: "ok", title: t("subscriptions.createdToast"), msg: "" });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("subscriptions.createFailToast"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const suspendM = useMutation({
    mutationFn: (id: string) => suspendSubscription(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      push({ kind: "ok", title: t("subscriptions.suspendedToast"), msg: "" });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const entityOptions =
    form.scope === "COUNTRY" ? countriesQ.data
      : form.scope === "ZONE" ? zonesQ.data
        : form.scope === "LOCALITY" ? localitiesQ.data
          : form.scope === "UNIT" ? unitsQ.data
            : [];

  const subCols = [
    { label: t("subscriptions.colMinistry"), render: (r: SubscriptionResponse) => <span style={{ fontWeight: 500 }}>{ministryName(r.ministryId)}</span> },
    { label: t("subscriptions.colModules"), render: (r: SubscriptionResponse) => <span>{r.moduleCodes.join(", ")}</span> },
    { label: t("subscriptions.colScope"), render: (r: SubscriptionResponse) => <Badge tone="gray">{r.scope}</Badge> },
    { label: t("subscriptions.colStatus"), render: (r: SubscriptionResponse) => <Badge tone={statusTone(r.effectiveStatus)} dot>{r.effectiveStatus}</Badge> },
    { label: t("subscriptions.colTier"), render: (r: SubscriptionResponse) => <span>{r.tier ?? "—"}{r.pricingZone ? ` · ${r.pricingZone}` : ""}{r.cmci ? " · CMCI" : ""}</span> },
    {
      label: t("subscriptions.colPrice"),
      render: (r: SubscriptionResponse) =>
        r.priceAmount != null ? <span>{r.priceAmount} {r.priceCurrency} {r.billingPeriod === "MONTHLY" ? t("subscriptions.perMonth") : t("subscriptions.perYear")}</span> : <span style={{ color: "var(--ink-400)" }}>—</span>,
    },
    { label: t("subscriptions.colStart"), render: (r: SubscriptionResponse) => <span style={{ color: "var(--ink-500)" }}>{fmtDate(r.startDate, dateLocale)}</span> },
    {
      label: "",
      render: (r: SubscriptionResponse) =>
        r.status === "ACTIVE" ? (
          <Button variant="ghost" onClick={() => suspendM.mutate(r.id)} disabled={suspendM.isPending}>{t("subscriptions.suspend")}</Button>
        ) : null,
    },
  ];

  const rows = subsQ.data ?? [];

  return (
    <>
      <TopBar
        title={t("subscriptions.title")}
        crumbs={[t("common.jexcellence"), t("subscriptions.title")]}
        actions={
          <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={() => { setForm(EMPTY); setQuote(null); setOpen(true); }}>
            {t("subscriptions.newSubscription")}
          </Button>
        }
      />
      <div className="content">
        {/* Catalogue des modules */}
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 4px" }}>{t("subscriptions.modulesTitle")}</h3>
          <p className="section-sub" style={{ marginTop: 0 }}>
            <Trans i18nKey="subscriptions.modulesIntro" components={{ strong: <strong /> }} />
          </p>
          {modulesQ.isLoading ? (
            <div style={{ color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(modulesQ.data ?? []).map((m) => (
                <div key={m.code} style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", borderBottom: "1px solid var(--line, #eee)", padding: "8px 0" }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{m.name}</span>{" "}
                    <Badge tone={m.free ? "green" : "earth"}>{m.free ? t("subscriptions.free") : t("subscriptions.paid")}</Badge>{" "}
                    {!m.enabled && <Badge tone="gray">{t("subscriptions.disabled")}</Badge>}
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <Toggle checked={m.free} onChange={(v) => toggleModuleM.mutate({ code: m.code, patch: { free: v } })} label={t("subscriptions.freeToggle")} />
                    <Toggle checked={m.enabled} onChange={(v) => toggleModuleM.mutate({ code: m.code, patch: { enabled: v } })} label={t("subscriptions.enabledToggle")} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Liste des abonnements */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line,#eee)" }}>
            <span style={{ color: "var(--ink-600)" }}>{t("subscriptions.filterLabel")}</span>
            <Select value={filterMinistry} onChange={(e) => setFilterMinistry(e.target.value)}>
              <option value="">{t("subscriptions.allMinistries")}</option>
              {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>
          {subsQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("subscriptions.empty")}</div>
          ) : (
            <Table columns={subCols} rows={rows.map((r) => ({ ...r, _key: r.id }))} zebra />
          )}
        </div>
      </div>

      {/* Création d'un abonnement */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={t("subscriptions.createTitle")}
        sub={t("subscriptions.createSub")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="secondary" onClick={() => quoteM.mutate()} disabled={!canQuote || quoteM.isPending}>
              {quoteM.isPending ? t("subscriptions.calculating") : t("subscriptions.calculateQuote")}
            </Button>
            <Button variant="primary" onClick={() => createM.mutate()} disabled={!canQuote || createM.isPending}>
              {createM.isPending ? t("subscriptions.creating") : t("subscriptions.createButton")}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("subscriptions.ministryLabel")}>
              <Select value={form.ministryId} onChange={(e) => setForm({ ...form, ministryId: e.target.value, entityId: "", countryId: "" })}>
                <option value="">{t("subscriptions.chooseOption")}</option>
                {(ministriesQ.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
            <Field label={t("subscriptions.scopeLabel")}>
              <Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as SubscriptionScope, entityId: "", countryId: "" })}>
                {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </div>

          {form.scope === "ZONE" && (
            <Field label={t("subscriptions.countryForZoneLabel")}>
              <Select value={form.countryId} onChange={(e) => setForm({ ...form, countryId: e.target.value, entityId: "" })}>
                <option value="">{t("subscriptions.chooseOption")}</option>
                {(countriesQ.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
            </Field>
          )}

          {form.scope !== "MINISTRY" && (
            <Field label={t("subscriptions.entityLabel", { scope: form.scope })}>
              <Select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })}>
                <option value="">{t("subscriptions.chooseOption")}</option>
                {(entityOptions ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
            </Field>
          )}

          <Field label={t("subscriptions.payableModulesLabel")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {payableModules.length === 0 && <span style={{ color: "var(--ink-400)" }}>{t("subscriptions.noPayableModules")}</span>}
              {payableModules.map((m) => {
                const checked = form.modules.includes(m.code);
                return (
                  <label key={m.code} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <Checkbox checked={checked} onChange={(v) => setForm({ ...form, modules: v ? [...form.modules, m.code] : form.modules.filter((c) => c !== m.code) })} />
                    <span>{m.name} <span style={{ color: "var(--ink-400)" }}>({m.code})</span></span>
                  </label>
                );
              })}
            </div>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label={t("subscriptions.pricingZoneLabel")}>
              <Select value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value as PricingZone })}>
                {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
              </Select>
            </Field>
            <Field label={t("subscriptions.billingPeriodLabel")}>
              <Select value={form.billingPeriod} onChange={(e) => setForm({ ...form, billingPeriod: e.target.value as BillingPeriod })}>
                <option value="ANNUAL">{t("subscriptions.annual")}</option>
                <option value="MONTHLY">{t("subscriptions.monthly")}</option>
              </Select>
            </Field>
            <Field label={t("subscriptions.cmciDiscountLabel")}>
              <Toggle checked={form.cmci} onChange={(v) => setForm({ ...form, cmci: v })} label={form.cmci ? t("common.yes") : t("common.no")} />
            </Field>
          </div>

          {quote && (
            <div className="card" style={{ background: "var(--parchment, #faf7f0)" }}>
              <div style={{ marginBottom: 6 }}>
                <strong>{t("subscriptions.quoteWord")}</strong> — {t("subscriptions.quoteMembers", { count: quote.memberCount })} <Badge tone="earth">{quote.tier}</Badge>
              </div>
              {quote.lines.map((l) => (
                <div key={l.moduleCode} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "2px 0" }}>
                  <span>{l.moduleCode}{l.cmciApplied ? " · CMCI" : ""}{l.cumulApplied ? " · cumul" : ""}</span>
                  <span>{l.onQuote ? t("subscriptions.onQuote") : `${l.finalAmount} ${l.currency} ${l.billingPeriod === "MONTHLY" ? t("subscriptions.perMonth") : t("subscriptions.perYear")}`}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label={t("subscriptions.priceLabel")}><Input type="number" value={form.priceAmount} onChange={(e) => setForm({ ...form, priceAmount: e.target.value })} /></Field>
            <Field label={t("subscriptions.currencyLabel")}><Input value={form.priceCurrency} onChange={(e) => setForm({ ...form, priceCurrency: e.target.value.toUpperCase().slice(0, 3) })} /></Field>
            <Field label={t("subscriptions.startLabel")}><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("subscriptions.endLabel")}><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
            <Field label={t("subscriptions.noteLabel")}><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
        </div>
      </Modal>
    </>
  );
}
