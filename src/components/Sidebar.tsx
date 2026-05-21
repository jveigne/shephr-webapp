import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icons, IconName } from "./icons";
import { useAuth } from "@/context/AuthContext";

type NavChild = { id: string; label: string; path: string };
type NavItem = { id: string; label: string; icon: IconName; path?: string; children?: NavChild[] };

const NAV: NavItem[] = [
  { id: "dashboard",  label: "Tableau de bord",            icon: "Dashboard", path: "/dashboard" },
  { id: "donations",  label: "Dons",                       icon: "Donation",  path: "/donations" },
  { id: "structure",  label: "Structure",                  icon: "Building", children: [
    { id: "ministeres", label: "Ministères", path: "/ministeres" },
    { id: "localites",  label: "Localités",  path: "/localites" },
    { id: "unites",     label: "Unités",     path: "/unites" },
  ]},
  { id: "users",      label: "Utilisateurs",               icon: "Users",     path: "/users" },
  { id: "hierarchy",  label: "Hiérarchie des dirigeants",  icon: "Hierarchy", path: "/hierarchy" },
  { id: "exports",    label: "Exports",                    icon: "Export",    path: "/exports" },
  { id: "settings",   label: "Paramètres",                 icon: "Settings",  path: "/settings" },
];

const STRUCTURE_PATHS = ["/ministeres", "/localites", "/unites"];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const [expanded, setExpanded] = useState({ structure: STRUCTURE_PATHS.includes(location.pathname) });
  useEffect(() => {
    if (STRUCTURE_PATHS.includes(location.pathname)) {
      setExpanded((e) => ({ ...e, structure: true }));
    }
  }, [location.pathname]);

  const initials = user?.fullName
    ? user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")
    : "DB";
  const shortName = user?.fullName || "Daniel Bouanga";
  const role = user?.role === "ADMIN" ? "Administrateur" : (user?.role || "Administrateur");

  const isActive = (p?: string) => !!p && location.pathname === p;

  const NavRow = ({ item }: { item: NavItem }) => {
    if (!item.path) return null;
    const Icon = Icons[item.icon];
    return (
      <button className={`nav-item ${isActive(item.path) ? "active" : ""}`} onClick={() => navigate(item.path!)}>
        {Icon && <Icon size={18} />}
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <span className="grain-overlay" />
      <div className="sidebar-inner">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div className="brand-text">
            <span className="word">Shephr</span>
            <span className="sub">Administration</span>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-section-label">Pilotage</div>
          {NAV.slice(0, 2).map((n) => <NavRow key={n.id} item={n} />)}

          <div className="nav-section-label" style={{ marginTop: 12 }}>Organisation</div>
          {NAV.slice(2, 5).map((n) => {
            if (!n.children) return <NavRow key={n.id} item={n} />;
            const isExp = expanded[n.id as "structure"];
            const childActive = n.children.some((c) => location.pathname === c.path);
            return (
              <div key={n.id}>
                <button
                  className={`nav-item ${isExp ? "expanded" : ""} ${childActive ? "active" : ""}`}
                  onClick={() => setExpanded((e) => ({ ...e, [n.id]: !e[n.id as "structure"] }))}
                >
                  {Icons[n.icon]({ size: 18 })}
                  <span>{n.label}</span>
                  <Icons.ChevRight size={13} className="chev" />
                </button>
                {isExp && (
                  <div className="nav-sub">
                    {n.children.map((c) => (
                      <button key={c.id} className={`nav-item ${location.pathname === c.path ? "active" : ""}`}
                        onClick={() => navigate(c.path)}>
                        <span style={{ width: 4 }} />
                        <span>{c.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="nav-section-label" style={{ marginTop: 12 }}>Système</div>
          {NAV.slice(5).map((n) => <NavRow key={n.id} item={n} />)}
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
