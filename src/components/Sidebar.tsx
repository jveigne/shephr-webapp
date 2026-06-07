import { useLocation, useNavigate } from "react-router-dom";
import { Icons, IconName } from "./icons";
import { useAuth } from "@/context/AuthContext";

type NavItem = { id: string; label: string; icon: IconName; path: string };
type NavSection = { section: string; items: NavItem[] };

const NAV: NavSection[] = [
  {
    section: "Clients",
    items: [{ id: "ministeres", label: "Ministères", icon: "Building", path: "/ministeres" }],
  },
  {
    section: "Facturation",
    items: [{ id: "abonnements", label: "Abonnements", icon: "Currency", path: "/abonnements" }],
  },
  {
    section: "Gouvernance",
    items: [
      { id: "goals", label: "Goals globaux", icon: "Sparkle", path: "/goals" },
      { id: "audit", label: "Audit", icon: "Shield", path: "/audit" },
    ],
  },
  {
    section: "Système",
    items: [{ id: "settings", label: "Paramètres", icon: "Settings", path: "/settings" }],
  },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const initials = user?.fullName
    ? user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")
    : "JX";
  const shortName = user?.fullName || "JExcellence";
  const role = user?.superAdmin ? "Super Admin" : "—";

  const isActive = (p: string) => location.pathname === p;

  return (
    <aside className="sidebar">
      <span className="grain-overlay" />
      <div className="sidebar-inner">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div className="brand-text">
            <span className="word">Shephr</span>
            <span className="sub">JExcellence · Back-office</span>
          </div>
        </div>

        <nav className="nav">
          {NAV.map(({ section, items }) => (
            <div key={section}>
              <div className="nav-section-label">{section}</div>
              {items.map((item) => {
                const Icon = Icons[item.icon];
                return (
                  <button
                    key={item.id}
                    className={`nav-item ${isActive(item.path) ? "active" : ""}`}
                    onClick={() => navigate(item.path)}
                  >
                    {Icon && <Icon size={18} />}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="avatar">{initials}</div>
          <div className="who">
            <div className="nm">{shortName}</div>
            <div className="rl">{role}</div>
          </div>
          <button className="logout" onClick={logout} title="Déconnexion">
            <Icons.Logout size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
