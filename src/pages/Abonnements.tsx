import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Checkbox, Drawer, Field, IconButton, Input, Modal, Select, Toggle, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { buildTree, type TreeNode } from "@/lib/orgTree";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";
import {
  createSubscription,
  fetchMinistryOrg,
  listModules,
  listSubscriptions,
  pricingQuote,
  reactivateSubscription,
  suspendSubscription,
  updateModule,
  type BillingPeriod,
  type PricingQuoteResponse,
  type PricingZone,
  type SubscriptionResponse,
} from "@/services/subscriptionService";

const ZONES: PricingZone[] = ["A", "B", "C", "D"];

function grants(s: SubscriptionResponse): boolean {
  return s.effectiveStatus === "ACTIVE";
}

type Grant = { nodeId: string; nodeName: string };
interface NodeCov {
  directSubs: SubscriptionResponse[];
  inherited: Map<string, Grant>; // module -> ancêtre le plus proche qui l'accorde
}

function buildCoverage(root: TreeNode, subsByEntity: Map<string, SubscriptionResponse[]>): Map<string, NodeCov> {
  const out = new Map<string, NodeCov>();
  const walk = (node: TreeNode, inheritedFromAncestors: Map<string, Grant>) => {
    const direct = subsByEntity.get(node.id) ?? [];
    out.set(node.id, { directSubs: direct, inherited: new Map(inheritedFromAncestors) });
    const passDown = new Map(inheritedFromAncestors);
    for (const s of direct) {
      if (grants(s)) for (const m of s.moduleCodes) passDown.set(m, { nodeId: node.id, nodeName: node.name });
    }
    for (const c of node.children) walk(c, passDown);
  };
  walk(root, new Map());
  return out;
}

type ModuleState = "active" | "inherited" | "suspended" | "none";
function moduleState(cov: NodeCov | undefined, code: string): ModuleState {
  if (!cov) return "none";
  if (cov.directSubs.some((s) => grants(s) && s.moduleCodes.includes(code))) return "active";
  if (cov.inherited.has(code)) return "inherited";
  if (cov.directSubs.some((s) => !grants(s) && s.moduleCodes.includes(code))) return "suspended";
  return "none";
}

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

function todayPlusYearISO(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

const ACTIVATE_EMPTY = {
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

  const [ministryId, setMinistryId] = useState("");
  const [drawerNode, setDrawerNode] = useState<TreeNode | null>(null);
  const [activateNode, setActivateNode] = useState<TreeNode | null>(null);
  const [form, setForm] = useState(ACTIVATE_EMPTY);
  const [quote, setQuote] = useState<PricingQuoteResponse | null>(null);
  const [reactivateSub, setReactivateSub] = useState<SubscriptionResponse | null>(null);
  const [reEndDate, setReEndDate] = useState("");

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });
  const modulesQ = useQuery({ queryKey: ["modules"], queryFn: listModules });
  const subsQ = useQuery({
    queryKey: ["subscriptions", ministryId],
    queryFn: () => listSubscriptions({ ministryId }),
    enabled: !!ministryId,
  });
  const orgQ = useQuery({
    queryKey: ["ministry-org", ministryId],
    queryFn: () => fetchMinistryOrg(ministryId),
    enabled: !!ministryId,
  });

  const ministryName = useMemo(() => {
    const m = (ministriesQ.data ?? []).find((x) => x.id === ministryId);
    return m?.name ?? "—";
  }, [ministriesQ.data, ministryId]);

  const payableModules = (modulesQ.data ?? []).filter((m) => !m.free);
  const moduleName = useMemo(() => {
    const map = new Map((modulesQ.data ?? []).map((m) => [m.code, m.name]));
    return (code: string) => map.get(code) ?? code;
  }, [modulesQ.data]);

  const tree = useMemo(() => {
    if (!orgQ.data || !ministryId) return null;
    return buildTree(orgQ.data, ministryId, ministryName);
  }, [orgQ.data, ministryId, ministryName]);

  const coverage = useMemo(() => {
    if (!tree) return new Map<string, NodeCov>();
    const byEntity = new Map<string, SubscriptionResponse[]>();
    for (const s of subsQ.data ?? []) {
      const arr = byEntity.get(s.scopeEntityId) ?? [];
      arr.push(s);
      byEntity.set(s.scopeEntityId, arr);
    }
    return buildCoverage(tree, byEntity);
  }, [tree, subsQ.data]);

  // Re-sync le node ouvert dans le drawer après refetch (nouvel objet coverage).
  const drawerCov = drawerNode ? coverage.get(drawerNode.id) : undefined;

  const toggleModuleM = useMutation({
    mutationFn: (v: { code: string; patch: { free?: boolean; enabled?: boolean } }) => updateModule(v.code, v.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["modules"] });
      push({ kind: "ok", title: t("subscriptions.moduleUpdated"), msg: "" });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const invalidateMinistry = () => {
    qc.invalidateQueries({ queryKey: ["subscriptions", ministryId] });
  };

  const suspendM = useMutation({
    mutationFn: (id: string) => suspendSubscription(id),
    onSuccess: () => { invalidateMinistry(); push({ kind: "ok", title: t("subscriptions.suspendedToast"), msg: "" }); },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const reactivateM = useMutation({
    mutationFn: (v: { id: string; endDate: string }) => reactivateSubscription(v.id, { endDate: v.endDate }),
    onSuccess: () => {
      invalidateMinistry();
      setReactivateSub(null);
      push({ kind: "ok", title: t("subscriptions.reactivatedToast"), msg: "" });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("subscriptions.reactivateFailToast"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const quoteM = useMutation({
    mutationFn: () =>
      pricingQuote({
        scope: activateNode!.level,
        scopeEntityId: activateNode!.id,
        moduleCodes: form.modules,
        zone: form.zone,
        cmci: form.cmci,
      }),
    onSuccess: (q) => {
      setQuote(q);
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
        ministryId,
        scope: activateNode!.level,
        scopeEntityId: activateNode!.id,
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
      invalidateMinistry();
      setActivateNode(null);
      setForm(ACTIVATE_EMPTY);
      setQuote(null);
      push({ kind: "ok", title: t("subscriptions.createdToast"), msg: "" });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("subscriptions.createFailToast"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const openActivate = (node: TreeNode) => {
    setForm({ ...ACTIVATE_EMPTY });
    setQuote(null);
    setActivateNode(node);
  };

  // Modules déjà actifs directement sur le node ouvert dans la modale → non re-cochables.
  const activateCov = activateNode ? coverage.get(activateNode.id) : undefined;
  const moduleAlreadyDirect = (code: string) =>
    !!activateCov?.directSubs.some((s) => grants(s) && s.moduleCodes.includes(code));

  const canQuote = !!activateNode && form.modules.length > 0;

  return (
    <>
      <TopBar title={t("subscriptions.title")} crumbs={[t("common.jexcellence"), t("subscriptions.title")]} />
      <div className="content">
        {/* Catalogue des modules (transverse plateforme) */}
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

        {/* Espace de gestion par ministère */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line,#eee)", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{t("subscriptions.workspaceTitle")}</span>
            <Select value={ministryId} onChange={(e) => { setMinistryId(e.target.value); setDrawerNode(null); }}>
              <option value="">{t("subscriptions.pickMinistry")}</option>
              {(ministriesQ.data ?? []).map((m: MinistryResponse) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
            <div className="spacer" style={{ flex: 1 }} />
            <Legend t={t} />
          </div>

          {!ministryId ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>{t("subscriptions.pickMinistryHint")}</div>
          ) : orgQ.isLoading || subsQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("subscriptions.loadingTree")}</div>
          ) : !tree || tree.children.length === 0 ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("subscriptions.noOrg")}</div>
          ) : (
            <div style={{ padding: "8px 4px" }}>
              <TreeRow
                node={tree}
                depth={0}
                coverage={coverage}
                payableModules={payableModules.map((m) => m.code)}
                moduleName={moduleName}
                onOpen={setDrawerNode}
                selectedId={drawerNode?.id ?? null}
                t={t}
              />
            </div>
          )}
        </div>
      </div>

      {/* Drawer de gestion d'un nœud */}
      <Drawer
        open={!!drawerNode}
        onClose={() => setDrawerNode(null)}
        title={drawerNode?.name}
        sub={drawerNode ? `${t(`subscriptions.level.${drawerNode.level}`)}` : undefined}
      >
        {drawerNode && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Abonnements posés directement ici */}
            <div>
              <h4 style={{ margin: "0 0 8px" }}>{t("subscriptions.nodeSubsHere")}</h4>
              {(drawerCov?.directSubs ?? []).length === 0 ? (
                <p style={{ color: "var(--ink-500)", margin: 0 }}>{t("subscriptions.nodeNoSubsHere")}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {drawerCov!.directSubs.map((s) => (
                    <div key={s.id} className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Badge tone={statusTone(s.effectiveStatus)} dot>{s.effectiveStatus}</Badge>
                        <span style={{ fontWeight: 500 }}>{s.moduleCodes.map(moduleName).join(", ")}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ink-500)" }}>
                        {fmtDate(s.startDate, dateLocale)} → {s.endDate ? fmtDate(s.endDate, dateLocale) : "∞"}
                        {s.priceAmount != null ? ` · ${s.priceAmount} ${s.priceCurrency} ${s.billingPeriod === "MONTHLY" ? t("subscriptions.perMonth") : t("subscriptions.perYear")}` : ""}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {grants(s) ? (
                          <Button variant="danger" size="sm" onClick={() => suspendM.mutate(s.id)} disabled={suspendM.isPending}>{t("subscriptions.suspend")}</Button>
                        ) : (
                          <Button variant="primary" size="sm" onClick={() => { setReactivateSub(s); setReEndDate(todayPlusYearISO()); }}>{t("subscriptions.reactivate")}</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Couverture héritée */}
            {drawerCov && drawerCov.inherited.size > 0 && (
              <div>
                <h4 style={{ margin: "0 0 8px" }}>{t("subscriptions.nodeInherited")}</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[...drawerCov.inherited.entries()].map(([code, g]) => (
                    <div key={code} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                      <Badge tone="earth">{moduleName(code)}</Badge>
                      <span style={{ color: "var(--ink-500)" }}>{t("subscriptions.inheritedFrom", { name: g.nodeName })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button variant="primary" iconL={<Icons.Plus size={15} />} onClick={() => openActivate(drawerNode)}>
              {t("subscriptions.activateHere")}
            </Button>
          </div>
        )}
      </Drawer>

      {/* Modale Réactivation */}
      <Modal
        open={!!reactivateSub}
        onClose={() => setReactivateSub(null)}
        title={t("subscriptions.reactivateTitle")}
        sub={t("subscriptions.reactivateSub")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReactivateSub(null)}>{t("common.cancel")}</Button>
            <Button variant="primary" disabled={!reEndDate || reactivateM.isPending}
              onClick={() => reactivateSub && reactivateM.mutate({ id: reactivateSub.id, endDate: reEndDate })}>
              {t("subscriptions.reactivateConfirm")}
            </Button>
          </>
        }
      >
        {reactivateSub && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ color: "var(--ink-500)" }}>{reactivateSub.moduleCodes.map(moduleName).join(", ")}</div>
            <Field label={t("subscriptions.newEndDate")}>
              <Input type="date" value={reEndDate} onChange={(e) => setReEndDate(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>

      {/* Modale Activer ici */}
      <Modal
        open={!!activateNode}
        onClose={() => setActivateNode(null)}
        size="lg"
        title={t("subscriptions.activateTitle")}
        sub={activateNode ? `${t(`subscriptions.level.${activateNode.level}`)} · ${activateNode.name}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setActivateNode(null)}>{t("common.cancel")}</Button>
            <Button variant="secondary" onClick={() => quoteM.mutate()} disabled={!canQuote || quoteM.isPending}>
              {quoteM.isPending ? t("subscriptions.calculating") : t("subscriptions.calculateQuote")}
            </Button>
            <Button variant="primary" onClick={() => createM.mutate()} disabled={!canQuote || createM.isPending}>
              {createM.isPending ? t("subscriptions.creating") : t("subscriptions.createButton")}
            </Button>
          </>
        }
      >
        {activateNode && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label={t("subscriptions.payableModulesLabel")}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {payableModules.length === 0 && <span style={{ color: "var(--ink-400)" }}>{t("subscriptions.noPayableModules")}</span>}
                {payableModules.map((m) => {
                  const direct = moduleAlreadyDirect(m.code);
                  const inherited = activateCov?.inherited.has(m.code);
                  const checked = form.modules.includes(m.code);
                  return (
                    <label key={m.code} style={{ display: "flex", alignItems: "center", gap: 8, cursor: direct ? "not-allowed" : "pointer", opacity: direct ? 0.5 : 1 }}>
                      <Checkbox checked={checked} onChange={(v) => { if (direct) return; setForm({ ...form, modules: v ? [...form.modules, m.code] : form.modules.filter((c) => c !== m.code) }); }} />
                      <span>{m.name} <span style={{ color: "var(--ink-400)" }}>({m.code})</span></span>
                      {direct && <Badge tone="ok">{t("subscriptions.alreadyActiveHere")}</Badge>}
                      {!direct && inherited && <Badge tone="earth">{t("subscriptions.coveredByInheritance")}</Badge>}
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
        )}
      </Modal>
    </>
  );
}

// ---- Légende ----
function Legend({ t }: { t: (k: string) => string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Badge tone="green">{t("subscriptions.stateActive")}</Badge>
      <Badge tone="earth">{t("subscriptions.stateInherited")}</Badge>
      <Badge tone="warn">{t("subscriptions.stateSuspended")}</Badge>
    </div>
  );
}

// ---- Ligne d'arbre (récursive) ----
function ModuleBadges({ codes, cov, moduleName }: { codes: string[]; cov: NodeCov | undefined; moduleName: (c: string) => string }) {
  const toneByState: Record<Exclude<ModuleState, "none">, "green" | "earth" | "warn"> = {
    active: "green", inherited: "earth", suspended: "warn",
  };
  const shown = codes
    .map((code) => ({ code, st: moduleState(cov, code) }))
    .filter((x) => x.st !== "none");
  if (shown.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", gap: 6, marginLeft: 8, flexWrap: "wrap" }}>
      {shown.map(({ code, st }) => (
        <Badge key={code} tone={toneByState[st as Exclude<ModuleState, "none">]}>{moduleName(code)}</Badge>
      ))}
    </span>
  );
}

function TreeRow({
  node, depth, coverage, payableModules, moduleName, onOpen, selectedId, t,
}: {
  node: TreeNode;
  depth: number;
  coverage: Map<string, NodeCov>;
  payableModules: string[];
  moduleName: (c: string) => string;
  onOpen: (n: TreeNode) => void;
  selectedId: string | null;
  t: (k: string, o?: any) => string;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const cov = coverage.get(node.id);
  const selected = selectedId === node.id;
  return (
    <div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 8px",
          paddingLeft: 8 + depth * 18, borderRadius: 8, cursor: "pointer",
          background: selected ? "var(--accent-50, #eef3ee)" : undefined,
        }}
        className="tree-row"
        onClick={() => onOpen(node)}
      >
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            style={{ display: "inline-flex", width: 18, justifyContent: "center", transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }}
          >
            <Icons.ChevRight size={13} />
          </span>
        ) : (
          <span style={{ width: 18 }} />
        )}
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--ink-400)", minWidth: 62 }}>
          {t(`subscriptions.level.${node.level}`)}
        </span>
        <span style={{ fontWeight: node.level === "MINISTRY" ? 600 : 500 }}>{node.name}</span>
        <ModuleBadges codes={payableModules} cov={cov} moduleName={moduleName} />
        <span style={{ flex: 1 }} />
        <IconButton icon={<Icons.ChevRight size={14} />} title={t("subscriptions.openManage")} onClick={(e) => { e.stopPropagation(); onOpen(node); }} />
      </div>
      {open && hasChildren && node.children.map((c) => (
        <TreeRow
          key={c.id}
          node={c}
          depth={depth + 1}
          coverage={coverage}
          payableModules={payableModules}
          moduleName={moduleName}
          onOpen={onOpen}
          selectedId={selectedId}
          t={t}
        />
      ))}
    </div>
  );
}
