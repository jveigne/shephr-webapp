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
    items: [{ id: "ministeres", labelKey: "nav.ministries", icon: "Building", path: "/ministeres" }],
  },
  {
    sectionKey: "nav.billing",
    items: [{ id: "abonnements", labelKey: "nav.subscriptions", icon: "Currency", path: "/abonnements" }],
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
