import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Checkbox, Drawer, Field, IconButton, Input, Modal, Select, Toggle, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { apiErrorCode } from "@/services/api";
import { buildTree, type TreeNode } from "@/lib/orgTree";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";
import {
  createModuleExclusion,
  createSubscription,
  deleteModuleExclusion,
  fetchMinistryOrg,
  listModuleExclusions,
  listModules,
  listSubscriptions,
  reactivateSubscription,
  suspendSubscription,
  updateModule,
  accordGrantsModule,
  HIERARCHIE_SUIVI,
  type BillingPeriod,
  type ModuleResponse,
  type SubscriptionScope,
  type SubscriptionResponse,
} from "@/services/subscriptionService";

// P-11 / O12 (JP 27/10, lot « Offres Caleb / Néhémie ») — plus de zone tarifaire A–D, de palier, de remise
// CMCI ni de devis (`/admin/pricing/*` retiré) : la couverture posée ici est un ACCORD (ex. ETUDE_SUIVI au
// niveau ministère / nation / région, D-ABO-28), son prix éventuel est une simple information saisie à la main.
// §3.7 + P-06 (JP 27/10) — HIERARCHIE_SUIVI (Caleb, droit de CHAÎNE) n'est ouvert par un accord que s'il est
// de portée MINISTÈRE **et** marqué « Accord CMCI » (`cmci`, `Subscription#grantsModule`) ; les autres
// ministères passent par l'activation manuelle d'un dirigeant (/facturation). Le booléen `cmci` n'est plus une
// remise : c'est ce marqueur, qu'on coche dans la modale « Activer ici » au niveau du ministère.
// D-OFF-01 (JP 27/10) — les modules GRATUITS (ASSEMBLY, EVENTS, DOCUMENTS, MEMBER_CARE…) sont ouverts par défaut
// à tous les ministères ; l'interrupteur « Activé pour ce ministère » crée / supprime une exclusion
// (`/admin/modules/exclusions`). L'interrupteur global `enabled` du catalogue coupe toujours pour tous.

/** §3.7 + P-06 (JP 27/10) — code de droit de CHAÎNE (Caleb) : un accord ne l'ouvre qu'au niveau du ministère et CMCI. */
const MINISTRY_ONLY_CODE = HIERARCHIE_SUIVI;

/** Code d'erreur traduit (`subscriptions.errors.*`, puis `billing.errors.*`), repli sur le message du serveur. */
function errMsg(t: TFunction, e: unknown): string {
  const code = apiErrorCode(e);
  if (code) {
    for (const key of [`subscriptions.errors.${code}`, `billing.errors.${code}`]) {
      const tr = t(key);
      if (tr !== key) return tr;
    }
  }
  return e instanceof Error ? e.message : t("common.error");
}

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
      // §3.7 + P-06 — un accord HIERARCHIE_SUIVI hors ministère ou sans CMCI n'ouvre rien : il ne descend pas.
      for (const m of s.moduleCodes) if (accordGrantsModule(s, m)) passDown.set(m, { nodeId: node.id, nodeName: node.name });
    }
    for (const c of node.children) walk(c, passDown);
  };
  walk(root, new Map());
  return out;
}

// « inert » : accord actif qui porte le code sans l'ouvrir (HIERARCHIE_SUIVI hors ministère ou sans CMCI — §3.7 + P-06).
type ModuleState = "active" | "inherited" | "inert" | "suspended" | "none";
function moduleState(cov: NodeCov | undefined, code: string): ModuleState {
  if (!cov) return "none";
  if (cov.directSubs.some((s) => accordGrantsModule(s, code))) return "active";
  if (cov.inherited.has(code)) return "inherited";
  if (cov.directSubs.some((s) => grants(s) && s.moduleCodes.includes(code))) return "inert";
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
  billingPeriod: "ANNUAL" as BillingPeriod,
  startDate: "",
  endDate: "",
  priceAmount: "",
  priceCurrency: "",
  notes: "",
  // §3.7 + P-06 (JP 27/10) — « Accord CMCI » : seule voie, au niveau MINISTÈRE, pour qu'un accord ouvre HIERARCHIE_SUIVI.
  cmci: false,
};

export default function AbonnementsPage() {
  const { push } = useToasts();
  const qc = useQueryClient();
  const { t, i18n } = useTranslation();
  const dateLocale = (i18n.resolvedLanguage || i18n.language) === "en" ? "en-GB" : "fr-FR";

  // D-ABO-15 (JP 23/10) — `?ministryId=` : ouverte depuis la fiche d'un abonnement payant
  // (/facturation), la page arrive sur la couverture de modules de ce ministère.
  const [searchParams] = useSearchParams();
  const [ministryId, setMinistryId] = useState(() => searchParams.get("ministryId") ?? "");
  const [drawerNode, setDrawerNode] = useState<TreeNode | null>(null);
  const [activateNode, setActivateNode] = useState<TreeNode | null>(null);
  const [form, setForm] = useState(ACTIVATE_EMPTY);
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
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  // D-OFF-01 (JP 27/10) — exclusions du ministère choisi : un module gratuit exclu est DÉSACTIVÉ pour lui.
  const exclusionsQ = useQuery({
    queryKey: ["module-exclusions", ministryId],
    queryFn: () => listModuleExclusions(ministryId),
    enabled: !!ministryId,
  });
  const excluded = useMemo(() => new Set((exclusionsQ.data ?? []).map((x) => x.moduleCode)), [exclusionsQ.data]);
  // D-FIX-1B, JP 29/10 (constat B-02 clos, voulu) : l'interrupteur vaut pour TOUT module gratuit, GOALS et STUDY
  // compris (et non les seuls ASSEMBLY / EVENTS / DOCUMENTS / MEMBER_CARE de D-OFF-01) — le serveur accepte l'exclusion
  // de tout module `free` (AdminModuleExclusionService) et `@RequiresModule("GOALS" | "STUDY")` répond alors 403.
  const freeModules = (modulesQ.data ?? []).filter((m) => m.free);
  const exclusionM = useMutation({
    mutationFn: async (v: { code: string; enabledForMinistry: boolean }): Promise<void> => {
      if (v.enabledForMinistry) await deleteModuleExclusion(ministryId, v.code);
      else await createModuleExclusion(ministryId, v.code);
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["module-exclusions", ministryId] });
      push({
        kind: "ok",
        title: v.enabledForMinistry ? t("subscriptions.exclusions.enabledToast") : t("subscriptions.exclusions.disabledToast"),
        msg: `${moduleName(v.code)} · ${ministryName}`,
      });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const invalidateMinistry = () => {
    qc.invalidateQueries({ queryKey: ["subscriptions", ministryId] });
  };

  const suspendM = useMutation({
    mutationFn: (id: string) => suspendSubscription(id),
    onSuccess: () => { invalidateMinistry(); push({ kind: "ok", title: t("subscriptions.suspendedToast"), msg: "" }); },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: errMsg(t, e) }),
  });

  const reactivateM = useMutation({
    mutationFn: (v: { id: string; endDate: string }) => reactivateSubscription(v.id, { endDate: v.endDate }),
    onSuccess: () => {
      invalidateMinistry();
      setReactivateSub(null);
      push({ kind: "ok", title: t("subscriptions.reactivatedToast"), msg: "" });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("subscriptions.reactivateFailToast"), msg: errMsg(t, e) }),
  });

  const createM = useMutation({
    mutationFn: () =>
      createSubscription({
        moduleCodes: form.modules,
        ministryId,
        scope: activateNode!.level as SubscriptionScope,
        scopeEntityId: activateNode!.id,
        // §3.7 + P-06 — le marqueur n'a de sens qu'au niveau du ministère (le serveur l'ignore ailleurs pour HIERARCHIE_SUIVI).
        cmci: activateNode!.level === "MINISTRY" && form.cmci,
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
      push({ kind: "ok", title: t("subscriptions.createdToast"), msg: "" });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("subscriptions.createFailToast"), msg: errMsg(t, e) }),
  });

  const openActivate = (node: TreeNode) => {
    setForm({ ...ACTIVATE_EMPTY });
    setActivateNode(node);
  };

  // Modules déjà actifs directement sur le node ouvert dans la modale → non re-cochables.
  const activateCov = activateNode ? coverage.get(activateNode.id) : undefined;
  const moduleAlreadyDirect = (code: string) =>
    !!activateCov?.directSubs.some((s) => grants(s) && s.moduleCodes.includes(code));

  const canCreate = !!activateNode && form.modules.length > 0;

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

          {/* D-OFF-01 (JP 27/10) — modules gratuits : ouverts par défaut, désactivables pour CE ministère. */}
          {ministryId && (
            <FreeModulesForMinistry
              modules={freeModules}
              excluded={excluded}
              loading={exclusionsQ.isLoading || modulesQ.isLoading}
              error={exclusionsQ.isError ? errMsg(t, exclusionsQ.error) : null}
              pending={exclusionM.isPending}
              onToggle={(code, enabledForMinistry) => exclusionM.mutate({ code, enabledForMinistry })}
              t={t}
            />
          )}

          {ministryId && (
            <div style={{ padding: "12px 16px 0" }}>
              <h4 style={{ margin: "0 0 2px" }}>{t("subscriptions.agreementsTitle")}</h4>
              <p className="section-sub" style={{ margin: 0 }}>{t("subscriptions.agreementsHint")}</p>
            </div>
          )}

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
                        {s.cmci && <Badge tone="green">{t("subscriptions.cmciBadge")}</Badge>}
                      </div>
                      {/* §3.7 + P-06 (JP 27/10) — accord HIERARCHIE_SUIVI enregistré mais sans effet : on le dit. */}
                      {s.moduleCodes.includes(MINISTRY_ONLY_CODE) && grants(s) && !accordGrantsModule(s, MINISTRY_ONLY_CODE) && (
                        <div style={{ fontSize: 13, color: "var(--warn)" }}>
                          {t("subscriptions.cmciInert", { module: moduleName(MINISTRY_ONLY_CODE) })}
                        </div>
                      )}
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
            <Button variant="primary" onClick={() => createM.mutate()} disabled={!canCreate || createM.isPending}>
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
                  // §3.7 + P-06 (JP 27/10) — un accord n'ouvre HIERARCHIE_SUIVI (droit de CHAÎNE) qu'à la portée
                  // MINISTÈRE et s'il est marqué « Accord CMCI » : un accord géographique (nation, région, ville,
                  // assemblée) n'ouvre pas un droit de chaîne. Filtre d'affichage ; le serveur reste juge.
                  const ministryOnly = m.code === MINISTRY_ONLY_CODE && activateNode.level !== "MINISTRY";
                  const needsCmci = m.code === MINISTRY_ONLY_CODE && activateNode.level === "MINISTRY" && !form.cmci;
                  const locked = direct || ministryOnly || needsCmci;
                  return (
                    <label key={m.code} style={{ display: "flex", alignItems: "center", gap: 8, cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.5 : 1 }}>
                      <Checkbox checked={checked} onChange={(v) => { if (locked) return; setForm({ ...form, modules: v ? [...form.modules, m.code] : form.modules.filter((c) => c !== m.code) }); }} />
                      <span>{m.name} <span style={{ color: "var(--ink-400)" }}>({m.code})</span></span>
                      {ministryOnly && <Badge tone="gray">{t("subscriptions.ministryOnly")}</Badge>}
                      {needsCmci && <Badge tone="gray">{t("subscriptions.cmciRequired")}</Badge>}
                      {direct && <Badge tone="ok">{t("subscriptions.alreadyActiveHere")}</Badge>}
                      {!direct && inherited && <Badge tone="earth">{t("subscriptions.coveredByInheritance")}</Badge>}
                    </label>
                  );
                })}
              </div>
            </Field>

            {/* §3.7 + P-06 (JP 27/10) — « Accord CMCI », au niveau du ministère seulement. Décocher retire HIERARCHIE_SUIVI. */}
            {activateNode.level === "MINISTRY" && (
              <Field label={t("subscriptions.cmciLabel")} hint={t("subscriptions.cmciHint", { module: moduleName(MINISTRY_ONLY_CODE) })}>
                <Toggle
                  checked={form.cmci}
                  onChange={(v) => setForm({ ...form, cmci: v, modules: v ? form.modules : form.modules.filter((c) => c !== MINISTRY_ONLY_CODE) })}
                  label={t("subscriptions.cmciToggle")}
                />
              </Field>
            )}

            {/* O12 (JP 27/10) — prix d'un accord : information saisie à la main (aucune grille ni devis). */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label={t("subscriptions.billingPeriodLabel")}>
                <Select value={form.billingPeriod} onChange={(e) => setForm({ ...form, billingPeriod: e.target.value as BillingPeriod })}>
                  <option value="ANNUAL">{t("subscriptions.annual")}</option>
                  <option value="MONTHLY">{t("subscriptions.monthly")}</option>
                </Select>
              </Field>
              <Field label={t("subscriptions.priceLabel")} hint={t("subscriptions.priceInfoHint")}><Input type="number" value={form.priceAmount} onChange={(e) => setForm({ ...form, priceAmount: e.target.value })} /></Field>
              <Field label={t("subscriptions.currencyLabel")}><Input value={form.priceCurrency} onChange={(e) => setForm({ ...form, priceCurrency: e.target.value.toUpperCase().slice(0, 3) })} /></Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label={t("subscriptions.startLabel")}><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
              <Field label={t("subscriptions.endLabel")}><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
              <Field label={t("subscriptions.noteLabel")}><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ---- Modules gratuits pour un ministère (D-OFF-01, JP 27/10) ----
function FreeModulesForMinistry({
  modules, excluded, loading, error, pending, onToggle, t,
}: {
  modules: ModuleResponse[];
  excluded: Set<string>;
  loading: boolean;
  error: string | null;
  pending: boolean;
  /** `enabledForMinistry` = état VOULU (vrai → supprimer l'exclusion, faux → la créer). */
  onToggle: (code: string, enabledForMinistry: boolean) => void;
  t: TFunction;
}) {
  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line,#eee)" }}>
      <h4 style={{ margin: "0 0 2px" }}>{t("subscriptions.exclusions.title")}</h4>
      <p className="section-sub" style={{ margin: "0 0 8px" }}>{t("subscriptions.exclusions.intro")}</p>
      {loading ? (
        <div style={{ color: "var(--ink-500)" }}>{t("common.loading")}</div>
      ) : error ? (
        <div style={{ color: "var(--ink-500)" }}>{error}</div>
      ) : modules.length === 0 ? (
        <div style={{ color: "var(--ink-500)" }}>{t("subscriptions.exclusions.none")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {modules.map((m) => {
            const on = !excluded.has(m.code);
            // Un module coupé pour toute la plateforme (`enabled = false`) l'est aussi pour ce ministère :
            // l'exclusion reste réglable mais sans effet tant que l'interrupteur global est coupé.
            return (
              <div key={m.code} style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", padding: "6px 0", flexWrap: "wrap" }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{m.name}</span>{" "}
                  <span style={{ color: "var(--ink-400)", fontSize: 12.5 }}>({m.code})</span>{" "}
                  {!on && <Badge tone="warn">{t("subscriptions.exclusions.excludedBadge")}</Badge>}{" "}
                  {!m.enabled && <Badge tone="gray">{t("subscriptions.exclusions.platformOff")}</Badge>}
                </div>
                <span style={{ opacity: pending ? 0.5 : 1, pointerEvents: pending ? "none" : undefined }}>
                  <Toggle checked={on} onChange={(v) => onToggle(m.code, v)} label={t("subscriptions.exclusions.toggle")} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Légende ----
function Legend({ t }: { t: (k: string) => string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Badge tone="green">{t("subscriptions.stateActive")}</Badge>
      <Badge tone="earth">{t("subscriptions.stateInherited")}</Badge>
      <Badge tone="warn">{t("subscriptions.stateSuspended")}</Badge>
      <Badge tone="gray">{t("subscriptions.stateInert")}</Badge>
    </div>
  );
}

// ---- Ligne d'arbre (récursive) ----
function ModuleBadges({ codes, cov, moduleName }: { codes: string[]; cov: NodeCov | undefined; moduleName: (c: string) => string }) {
  const toneByState: Record<Exclude<ModuleState, "none">, "green" | "earth" | "warn" | "gray"> = {
    active: "green", inherited: "earth", inert: "gray", suspended: "warn",
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
