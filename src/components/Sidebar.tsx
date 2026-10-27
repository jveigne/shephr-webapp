import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icons, IconName } from "./icons";
import { useAuth } from "@/context/AuthContext";
import { setLanguage, type AppLang } from "@/i18n";

type NavItem = { id: string; labelKey: string; icon: IconName; path: string };
type NavSection = { sectionKey: string; items: NavItem[] };

const NAV: NavSection[] = [
  {
    sectionKey: "nav.clients",
    items: [
      { id: "ministeres", labelKey: "nav.ministries", icon: "Building", path: "/ministeres" },
      { id: "structure", labelKey: "nav.structure", icon: "Hierarchy", path: "/structure" },
      { id: "demandes", labelKey: "nav.requests", icon: "Inbox", path: "/demandes" },
      // D-HIE-08 (JP 28/10) — historique des demandes de supervision (chaîne), lecture seule, à côté des Demandes.
      { id: "supervision", labelKey: "nav.supervision", icon: "Hierarchy", path: "/supervision" },
      { id: "utilisateurs", labelKey: "nav.users", icon: "Users", path: "/utilisateurs" },
    ],
  },
  {
    sectionKey: "nav.billing",
    items: [
      { id: "abonnements", labelKey: "nav.subscriptions", icon: "Currency", path: "/abonnements" },
      // D-ABO-15 (JP 23/10) — facturation (abonnements payants, factures, offres, codes promo), à côté
      // des Abonnements qui gardent l'accès aux modules (D-ABO-01).
      { id: "facturation", labelKey: "nav.invoicing", icon: "Tag", path: "/facturation" },
      // D-ASM-10 (JP 23/09) — référentiel des modules d'enseignement, à côté des Abonnements (§6.1).
      { id: "modules-enseignement", labelKey: "nav.teachingModules", icon: "Folder", path: "/modules-enseignement" },
      // RG-EVT-01 (JP 14/10) — catalogue des types d'évènement, à côté des modules d'enseignement (§6.1).
      { id: "types-evenement", labelKey: "nav.eventTypes", icon: "Calendar", path: "/types-evenement" },
      // D-DOC-07 (JP 18/10) — documents partagés par lien + catégories, à côté des types d'évènement (§6.1).
      { id: "documents", labelKey: "nav.documents", icon: "Document", path: "/documents" },
    ],
  },
  {
    sectionKey: "nav.governance",
    items: [
      { id: "goals", labelKey: "nav.globalGoals", icon: "Sparkle", path: "/goals" },
      { id: "audit", labelKey: "nav.audit", icon: "Shield", path: "/audit" },
    ],
  },
  {
    sectionKey: "nav.system",
    items: [{ id: "settings", labelKey: "nav.settings", icon: "Settings", path: "/settings" }],
  },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { t, i18n } = useTranslation();

  const initials = user?.fullName
    ? user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")
    : "JX";
  const shortName = user?.fullName || "JExcellence";
  const role = user?.superAdmin ? t("common.superAdmin") : t("common.dash");

  const isActive = (p: string) => location.pathname === p;
  const lang = (i18n.resolvedLanguage || i18n.language || "fr") as AppLang;

  return (
    <aside className="sidebar">
      <span className="grain-overlay" />
      <div className="sidebar-inner">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div className="brand-text">
            <span className="word">{t("common.shephr")}</span>
            <span className="sub">{t("nav.backOffice")}</span>
          </div>
        </div>

        <nav className="nav">
          {NAV.map(({ sectionKey, items }) => (
            <div key={sectionKey}>
              <div className="nav-section-label">{t(sectionKey)}</div>
              {items.map((item) => {
                const Icon = Icons[item.icon];
                return (
                  <button
                    key={item.id}
                    className={`nav-item ${isActive(item.path) ? "active" : ""}`}
                    onClick={() => navigate(item.path)}
                  >
                    {Icon && <Icon size={18} />}
                    <span>{t(item.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="lang-switch" style={{ display: "flex", gap: 4, padding: "0 4px 10px" }}>
          <button
            type="button"
            className={`nav-item ${lang === "fr" ? "active" : ""}`}
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => setLanguage("fr")}
          >
            FR
          </button>
          <button
            type="button"
            className={`nav-item ${lang === "en" ? "active" : ""}`}
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => setLanguage("en")}
          >
            EN
          </button>
        </div>

        <div className="sidebar-foot">
          <div className="avatar">{initials}</div>
          <div className="who">
            <div className="nm">{shortName}</div>
            <div className="rl">{role}</div>
          </div>
          <button className="logout" onClick={logout} title={t("common.logout")}>
            <Icons.Logout size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
