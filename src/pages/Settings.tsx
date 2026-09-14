import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Field, Input, Select, Toggle, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import { setLanguage, type AppLang } from "@/i18n";
import { ADMIN } from "@/data/mock";
import { fetchContactSettings, updateContactSettings } from "@/services/platformService";
import { listMinistries, type MinistryResponse } from "@/services/ministryService";
import {
  createDonationCategory,
  deleteDonationCategory,
  listDonationCategories,
  updateDonationCategory,
  type DonationCategoryResponse,
} from "@/services/donationCategoryService";
import { apiErrorCode } from "@/services/api";

function ProfilTab() {
  const { push } = useToasts();
  const { t, i18n } = useTranslation();
  const [name, setName] = useState(ADMIN.name);
  const [email, setEmail] = useState(ADMIN.email);
  const currentLang = (i18n.resolvedLanguage || i18n.language) === "en" ? "en" : "fr";

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
            <Button variant="secondary" iconL={<Icons.Upload size={14} />}>{t("settings.changePhoto")}</Button>
          </div>
        </div>
        <div className="divider" style={{ margin: "12px 0 18px" }} />
        <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "0 0 14px" }}>
          {t("settings.personalInfo")}
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label={t("settings.fullNameLabel")}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t("settings.emailLabel")}><Input value={email} onChange={(e) => setEmail(e.target.value)} icon={<Icons.Mail size={14} />} /></Field>
          <Field label={t("settings.interfaceLanguageLabel")}>
            <Select value={currentLang} onChange={(e) => setLanguage(e.target.value as AppLang)}>
              <option value="fr">{t("settings.french")}</option>
              <option value="en">{t("settings.english")}</option>
            </Select>
          </Field>
          <Field label={t("settings.timezoneLabel")}>
            <Select defaultValue="Europe/London"><option>Europe/London</option><option>Europe/Paris</option></Select>
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <Button variant="ghost">{t("common.cancel")}</Button>
          <Button variant="primary" onClick={() => push({ kind: "ok", title: t("settings.profileUpdated") })}>{t("common.save")}</Button>
        </div>
      </div>

      <div className="card card-pad" style={{ gridColumn: "1 / -1" }}>
        <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "0 0 6px" }}>
          {t("settings.passwordTitle")}
        </h3>
        <div style={{ color: "var(--ink-500)", fontSize: 13, marginBottom: 14 }}>
          {t("settings.passwordHint")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Field label={t("settings.currentPasswordLabel")}><Input type="password" placeholder="••••••••" /></Field>
          <Field label={t("settings.newPasswordLabel")}><Input type="password" placeholder="••••••••" /></Field>
          <Field label={t("settings.confirmLabel")}><Input type="password" placeholder="••••••••" /></Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <Button variant="primary" onClick={() => push({ kind: "ok", title: t("settings.passwordChanged") })}>
            {t("common.update")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NotifsTab() {
  const { push } = useToasts();
  const { t } = useTranslation();
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
        {t("settings.emailAlertsTitle")}
      </h3>
      <div style={{ color: "var(--ink-500)", fontSize: 13, marginBottom: 6 }}>
        <Trans i18nKey="settings.notifsSentTo" values={{ email: ADMIN.email }} components={{ strong: <strong style={{ color: "var(--ink-800)" }} /> }} />
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-400)", marginTop: 14, marginBottom: 4 }}>{t("settings.groupDigests")}</div>
        <NotifRow k="digestWeekly"  title={t("settings.digestWeeklyTitle")} desc={t("settings.digestWeeklyDesc")} />
        <NotifRow k="digestMonthly" title={t("settings.digestMonthlyTitle")}     desc={t("settings.digestMonthlyDesc")} />
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-400)", marginTop: 18, marginBottom: 4 }}>{t("settings.groupActivity")}</div>
        <NotifRow k="newDonation"  title={t("settings.newDonationTitle")} desc={t("settings.newDonationDesc")} />
        <NotifRow k="lowActivity"  title={t("settings.lowActivityTitle")} desc={t("settings.lowActivityDesc")} />
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-400)", marginTop: 18, marginBottom: 4 }}>{t("settings.groupUsers")}</div>
        <NotifRow k="newUser"      title={t("settings.newUserTitle")} desc={t("settings.newUserDesc")} />
        <NotifRow k="invitePending" title={t("settings.invitePendingTitle")} desc={t("settings.invitePendingDesc")} />
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-400)", marginTop: 18, marginBottom: 4 }}>{t("settings.groupExports")}</div>
        <NotifRow k="exportReady" title={t("settings.exportReadyTitle")} desc={t("settings.exportReadyDesc")} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}>
        <Button variant="primary" onClick={() => push({ kind: "ok", title: t("settings.preferencesSaved") })}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function SecuTab() {
  const { t } = useTranslation();
  const sessions = [
    { dev: "MacBook Pro · Safari",   where: t("settings.sessionWhereLondon"),    when: t("settings.sessionActiveNow"), current: true },
    { dev: "iPhone 14 · App Shephr", where: t("settings.sessionWhereLondon"),    when: t("settings.sessionDaysAgo", { count: 2 }) },
    { dev: "Windows · Chrome",       where: t("settings.sessionWhereBirmingham"), when: t("settings.sessionDaysAgo", { count: 6 }) },
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
                {t("settings.twoFactorTitle")}
              </h3>
              <Badge tone="warn">{t("common.soon")}</Badge>
            </div>
            <div style={{ color: "var(--ink-500)", fontSize: 13, marginTop: 4 }}>
              {t("settings.twoFactorDesc")}
            </div>
          </div>
          <Button variant="secondary" disabled>{t("common.configure")}</Button>
        </div>
      </div>

      <div className="card card-pad">
        <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "0 0 6px" }}>
          {t("settings.activeSessionsTitle")}
        </h3>
        <div style={{ color: "var(--ink-500)", fontSize: 13, marginBottom: 14 }}>
          {t("settings.activeSessionsDesc")}
        </div>
        {sessions.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid var(--line-soft)" }}>
            <div className="icon-wrap" style={{ width: 34, height: 34, borderRadius: 8, background: "var(--ivory-raised)", border: "1px solid var(--line)", color: "var(--ink-700)", display: "grid", placeItems: "center" }}>
              <Icons.Lock size={15} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>{s.dev}</span>
                {s.current && <Badge tone="ok" dot>{t("settings.thisSession")}</Badge>}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 2 }}>{s.where} · {s.when}</div>
            </div>
            {!s.current && <Button variant="ghost" size="sm">{t("settings.disconnect")}</Button>}
          </div>
        ))}
        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <Button variant="danger" iconL={<Icons.Logout size={14} />}>
            {t("settings.logoutAllOthers")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Coordonnées de support de la plateforme (JP 31/07) — SEUL bloc réellement branché de cet
 * onglet, les autres sont encore alimentés par `data/mock`.
 *
 * <p>Ces coordonnées s'affichent dans l'app mobile (Paramètres › Aide, rattachement à une
 * assemblée), dans l'espace web (page « Contactez-nous ») et sur les pages publiques. Un
 * changement ici est visible partout sans redéploiement.
 */
function ContactSettingsCard() {
  const { push } = useToasts();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchContactSettings()
      .then((s) => {
        if (!alive) return;
        setEmail(s.email);
        setWhatsapp(s.whatsappNumber);
      })
      .catch((e: Error) => push({ kind: "error", title: t("settings.contactLoadFailed"), msg: e.message }))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Le backend refuse tout ce qui n'est pas un numéro international nu : on le dit AVANT
  // l'appel plutôt que de laisser l'utilisateur découvrir une 400.
  const whatsappValid = /^\d{6,20}$/.test(whatsapp.trim());
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSave = !loading && !saving && emailValid && whatsappValid;

  const save = async () => {
    setSaving(true);
    try {
      const saved = await updateContactSettings({ email: email.trim(), whatsappNumber: whatsapp.trim() });
      setEmail(saved.email);
      setWhatsapp(saved.whatsappNumber);
      push({ kind: "ok", title: t("settings.contactSaved") });
    } catch (e) {
      push({ kind: "error", title: t("settings.contactSaveFailed"), msg: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card card-pad" style={{ gridColumn: "1 / -1" }}>
      <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "0 0 6px" }}>
        {t("settings.contactTitle")}
      </h3>
      <div style={{ color: "var(--ink-500)", fontSize: 13, marginBottom: 14 }}>
        {t("settings.contactDesc")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label={t("settings.contactEmailLabel")}>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="support@exemple.com"
            icon={<Icons.Mail size={14} />}
            disabled={loading}
          />
        </Field>
        <Field label={t("settings.contactWhatsappLabel")} hint={t("settings.contactWhatsappHint")}>
          <Input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="33754596796"
            icon={<Icons.Hash size={14} />}
            disabled={loading}
          />
        </Field>
      </div>
      {!loading && whatsapp.trim() !== "" && !whatsappValid && (
        <div style={{ color: "var(--err, #B86A4A)", fontSize: 12.5, marginTop: 8 }}>
          {t("settings.contactWhatsappInvalid")}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 18 }}>
        <span style={{ fontSize: 12.5, color: "var(--ink-400)" }}>
          {whatsappValid ? `https://wa.me/${whatsapp.trim()}` : ""}
        </span>
        <Button variant="primary" disabled={!canSave} onClick={save}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Lot T5 (JP 14/09) — RUBRIQUES DE DON, branchées sur l'API.
 *
 * Cet écran tournait sur un MOCK : `useState(CATEGORIES.map(...))` depuis `@/data/mock`,
 * identifiants `c-${Date.now()}` fabriqués localement, aucun appel réseau — rien n'était persisté,
 * et les libellés affichés (« Offrande générale », « Reconnaissance ») ne correspondaient à aucune
 * des 6 clés réellement en service dans l'app mobile. **Le serveur fait foi.**
 *
 * Décision D0-5 : **une liste par ministère**, valable dans toutes ses assemblées. Le back-office
 * étant cross-tenant, il faut donc choisir le ministère avant de voir ou de toucher sa liste —
 * même geste que l'écran Abonnements.
 *
 * Deux règles de gouvernance se lisent directement dans l'UI :
 *  - le **code** est immuable (il rattache l'historique des dons) : il s'affiche, il ne se saisit
 *    pas ; le serveur le dérive du libellé français à la création ;
 *  - une rubrique **utilisée** ne se supprime pas, elle se **désactive** — le bouton de suppression
 *    est retiré et la bascule reste, pour ne pas trouer l'historique des dons déjà déclarés.
 */
function DonationCategoriesCard({ ministryId }: { ministryId: string }) {
  const { push } = useToasts();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const isEn = (i18n.resolvedLanguage || i18n.language) === "en";

  const [newName, setNewName] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNameEn, setEditNameEn] = useState("");

  const catsQ = useQuery({
    queryKey: ["donation-categories", ministryId],
    queryFn: () => listDonationCategories(ministryId, true),
    enabled: !!ministryId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["donation-categories", ministryId] });
  const fail = (e: unknown) =>
    push({ kind: "error", title: t("common.error"), msg: e instanceof Error ? e.message : String(e) });

  const addM = useMutation({
    mutationFn: () =>
      createDonationCategory(ministryId, {
        name: newName.trim(),
        nameEn: newNameEn.trim() || undefined,
      }),
    onSuccess: (created) => {
      setNewName("");
      setNewNameEn("");
      invalidate();
      push({ kind: "ok", title: t("settings.categoryAdded"), msg: created.name });
    },
    onError: fail,
  });

  const patchM = useMutation({
    mutationFn: (v: { id: string; name?: string; nameEn?: string; active?: boolean }) =>
      updateDonationCategory(v.id, { name: v.name, nameEn: v.nameEn, active: v.active }),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
      push({ kind: "ok", title: t("settings.categorySaved") });
    },
    onError: fail,
  });

  const removeM = useMutation({
    mutationFn: (id: string) => deleteDonationCategory(id),
    onSuccess: () => {
      invalidate();
      push({ kind: "ok", title: t("settings.categoryDeleted") });
    },
    onError: (e: unknown) => {
      // 422 CATEGORY_IN_USE : la rubrique porte déjà des dons. On le dit en clair et on renvoie
      // vers le bon geste — désactiver — au lieu d'un message d'erreur technique.
      if (apiErrorCode(e) === "CATEGORY_IN_USE") {
        push({ kind: "error", title: t("settings.categoryInUseTitle"), msg: t("settings.categoryInUseMsg") });
        invalidate();
        return;
      }
      fail(e);
    },
  });

  const startEdit = (c: DonationCategoryResponse) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditNameEn(c.nameEn ?? "");
  };

  const categories = catsQ.data ?? [];
  const busy = addM.isPending || patchM.isPending || removeM.isPending;

  return (
    <div className="card card-pad">
      <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "0 0 6px" }}>
        {t("settings.donationCategoriesTitle")}
      </h3>
      <div style={{ color: "var(--ink-500)", fontSize: 13, marginBottom: 14 }}>
        {t("settings.donationCategoriesDesc")}
      </div>

      {!ministryId ? (
        <div style={{ color: "var(--ink-500)", fontSize: 13, padding: "12px 0" }}>
          {t("settings.pickMinistryHint")}
        </div>
      ) : catsQ.isLoading ? (
        <div style={{ color: "var(--ink-500)", fontSize: 13, padding: "12px 0" }}>{t("common.loading")}</div>
      ) : catsQ.isError ? (
        <div style={{ color: "var(--err)", fontSize: 13, padding: "12px 0" }}>
          {catsQ.error instanceof Error ? catsQ.error.message : t("common.error")}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
            {categories.length === 0 && (
              <div style={{ color: "var(--ink-500)", fontSize: 13 }}>{t("settings.noCategories")}</div>
            )}
            {categories.map((c) => (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px",
                background: "var(--ivory-raised)",
                border: "1px solid var(--line-soft)",
                borderRadius: 8,
              }}>
                <Icons.Tag size={14} style={{ color: "var(--earth-600)" }} />
                {editingId === c.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder={t("settings.categoryNameFrPlaceholder")}
                    />
                    <Input
                      value={editNameEn}
                      onChange={(e) => setEditNameEn(e.target.value)}
                      placeholder={t("settings.categoryNameEnPlaceholder")}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy || !editName.trim()}
                      onClick={() => patchM.mutate({ id: c.id, name: editName.trim(), nameEn: editNameEn.trim() })}
                    >
                      {t("common.save")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      {t("common.cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13.5, color: c.active ? "var(--ink-900)" : "var(--ink-400)" }}>
                        {isEn ? c.nameEn || c.name : c.name}
                      </span>
                      {/* Le code est la clé de rattachement de l'historique : visible, jamais éditable. */}
                      <span style={{ fontSize: 11.5, color: "var(--ink-400)", marginLeft: 8, fontFamily: "var(--font-mono)" }}>
                        {c.code}
                      </span>
                    </div>
                    <button className="icon-btn" title={t("common.edit")} onClick={() => startEdit(c)}>
                      <Icons.Edit size={14} />
                    </button>
                    <Toggle checked={c.active} onChange={(v) => patchM.mutate({ id: c.id, active: v })} />
                    {c.inUse ? (
                      // §5.7 — utilisée : la suppression n'a même pas à être proposée.
                      <span style={{ fontSize: 11.5, color: "var(--ink-400)" }} title={t("settings.categoryInUseMsg")}>
                        {t("settings.categoryInUseBadge")}
                      </span>
                    ) : (
                      <button className="icon-btn danger" disabled={busy} onClick={() => removeM.mutate(c.id)}>
                        <Icons.Trash size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Input
              placeholder={t("settings.newCategoryPlaceholder")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newName.trim() && addM.mutate()}
              icon={<Icons.Plus size={14} />}
            />
            <Input
              placeholder={t("settings.categoryNameEnPlaceholder")}
              value={newNameEn}
              onChange={(e) => setNewNameEn(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newName.trim() && addM.mutate()}
            />
            <Button variant="secondary" disabled={busy || !newName.trim()} onClick={() => addM.mutate()}>
              {t("common.add")}
            </Button>
          </div>
          <div style={{ color: "var(--ink-400)", fontSize: 12, marginTop: 8 }}>
            {t("settings.categoryCodeHint")}
          </div>
        </>
      )}
    </div>
  );
}

function ConfigTab() {
  const { push } = useToasts();
  const { t } = useTranslation();
  const [ministryId, setMinistryId] = useState("");
  const [supported, setSupported] = useState<Record<string, boolean>>({ GBP: true, EUR: true, USD: false, CHF: false, CAD: false });
  const [defaultCur, setDefaultCur] = useState("GBP");

  const ministriesQ = useQuery({ queryKey: ["ministries"], queryFn: listMinistries });

  // Un seul ministère : inutile de faire choisir, on le sélectionne.
  useEffect(() => {
    const list = ministriesQ.data ?? [];
    if (!ministryId && list.length === 1) setMinistryId(list[0].id);
  }, [ministriesQ.data, ministryId]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <ContactSettingsCard />

      <div className="card card-pad" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{t("settings.ministryLabel")}</span>
        <Select value={ministryId} onChange={(e) => setMinistryId(e.target.value)}>
          <option value="">{t("settings.pickMinistry")}</option>
          {(ministriesQ.data ?? []).map((m: MinistryResponse) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </div>

      <DonationCategoriesCard ministryId={ministryId} />

      <div className="card card-pad">
        <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "0 0 6px" }}>
          {t("settings.currenciesTitle")}
        </h3>
        <div style={{ color: "var(--ink-500)", fontSize: 13, marginBottom: 14 }}>
          {t("settings.currenciesDesc")}
        </div>
        <Field label={t("settings.defaultCurrencyLabel")}>
          <Select value={defaultCur} onChange={(e) => setDefaultCur(e.target.value)}>
            <option value="GBP">GBP — {t("settings.currencyGBP")}</option>
            <option value="EUR">EUR — {t("settings.currencyEUR")}</option>
            <option value="USD">USD — {t("settings.currencyUSD")}</option>
            <option value="CHF">CHF — {t("settings.currencyCHF")}</option>
            <option value="CAD">CAD — {t("settings.currencyCAD")}</option>
          </Select>
        </Field>

        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-400)", marginTop: 18, marginBottom: 8 }}>
          {t("settings.acceptedCurrencies")}
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
                {t(`settings.currency${cur}`)}
              </span>
              <Toggle checked={supported[cur]} onChange={(v) => setSupported({ ...supported, [cur]: v })} />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <Button variant="primary" onClick={() => push({ kind: "ok", title: t("settings.configSaved") })}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"profil" | "notifs" | "secu" | "config">("profil");
  return (
    <>
      <TopBar title={t("settings.title")} crumbs={[t("common.shephr"), t("settings.title")]} />
      <div className="content narrow">
        <div className="tabs">
          <button className={`tab ${tab === "profil" ? "active" : ""}`} onClick={() => setTab("profil")}>
            <Icons.User size={15} /> {t("settings.tabProfile")}
          </button>
          <button className={`tab ${tab === "notifs" ? "active" : ""}`} onClick={() => setTab("notifs")}>
            <Icons.Bell size={15} /> {t("settings.tabNotifications")}
          </button>
          <button className={`tab ${tab === "secu" ? "active" : ""}`} onClick={() => setTab("secu")}>
            <Icons.Shield size={15} /> {t("settings.tabSecurity")}
          </button>
          <button className={`tab ${tab === "config" ? "active" : ""}`} onClick={() => setTab("config")}>
            <Icons.Tag size={15} /> {t("settings.tabConfig")}
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
