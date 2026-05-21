import React, { useEffect } from "react";
import { Icons } from "./icons";

// ---------- Button ----------
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm";
  iconL?: React.ReactNode;
  iconR?: React.ReactNode;
};
export function Button({
  children, variant = "secondary", size, iconL, iconR, onClick, disabled, type = "button", className = "", ...rest
}: ButtonProps) {
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className={`btn ${variant} ${size === "sm" ? "sm" : ""} ${className}`} {...rest}>
      {iconL && <span className="ico">{iconL}</span>}
      {children}
      {iconR && <span className="ico">{iconR}</span>}
    </button>
  );
}

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ReactNode;
  danger?: boolean;
};
export function IconButton({ icon, onClick, title, danger, className = "", ...rest }: IconButtonProps) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`icon-btn ${danger ? "danger" : ""} ${className}`} {...rest}>
      {icon}
    </button>
  );
}

// ---------- Field / Inputs ----------
export function Field({
  label, hint, children, style,
}: { label?: string; hint?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="field" style={style}>
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode };
export function Input({ icon, ...props }: InputProps) {
  if (icon) {
    return (
      <div className="input-wrap">
        <span className="ico-left">{icon}</span>
        <input className="input with-icon" {...props} />
      </div>
    );
  }
  return <input className="input" {...props} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="select" {...props}>{props.children}</select>;
}

export function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      <span className="track" />
      {label && <span className="lbl">{label}</span>}
    </button>
  );
}

export function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className={`checkbox ${checked ? "checked" : ""}`} onClick={() => onChange(!checked)}>
      {checked && <Icons.Check size={11} />}
    </span>
  );
}

// ---------- Badge ----------
export function Badge({
  children, tone = "gray", dot,
}: { children: React.ReactNode; tone?: "green" | "earth" | "gray" | "ok" | "warn" | "err"; dot?: boolean }) {
  return <span className={`badge ${tone}`}>{dot && <span className="dot" />}{children}</span>;
}

export function UnitTypeBadge({ type }: { type: string }) {
  if (type === "Centre") return <Badge tone="green" dot>Centre</Badge>;
  return <Badge tone="earth" dot>Assemblée</Badge>;
}

export function RoleBadge({ role }: { role: string }) {
  if (role === "ADMIN")  return <Badge tone="green">Administrateur</Badge>;
  if (role === "LEADER") return <Badge tone="earth">Dirigeant</Badge>;
  return <Badge tone="gray">Membre</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "Actif") return <Badge tone="ok" dot>Actif</Badge>;
  return <Badge tone="gray" dot>Inactif</Badge>;
}

// ---------- Modal ----------
export function Modal({
  open, onClose, title, sub, children, footer, size,
}: {
  open: boolean; onClose?: () => void; title?: React.ReactNode; sub?: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode; size?: "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${size === "lg" ? "lg" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="ttl">{title}</div>
          {sub && <div className="sub">{sub}</div>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Drawer ----------
export function Drawer({
  open, onClose, title, sub, children, footer,
}: {
  open: boolean; onClose?: () => void; title?: React.ReactNode; sub?: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div style={{ flex: 1 }}>
            <div className="ttl">{title}</div>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <IconButton icon={<Icons.X size={18} />} onClick={onClose} title="Fermer" />
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </>
  );
}

// ---------- Toasts ----------
export type Toast = { id: string; kind?: "ok" | "error"; title: string; msg?: string };
export function ToastHost({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === "error" ? "error" : "ok"}`}>
          <span className="ico">
            {t.kind === "error" ? <Icons.Warning size={18} /> : <Icons.Check size={18} />}
          </span>
          <div style={{ flex: 1 }}>
            <div className="ttl">{t.title}</div>
            {t.msg && <div className="msg">{t.msg}</div>}
          </div>
          <IconButton icon={<Icons.X size={14} />} onClick={() => onDismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}

// ---------- Table ----------
type Column<R = any> = {
  label: string;
  sortable?: boolean;
  cellClass?: string;
  cellStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  render: (r: R) => React.ReactNode;
};
export function Table<R = any>({
  columns, rows, onRowClick, zebra, empty,
}: {
  columns: Column<R>[]; rows: (R & { _key?: any })[]; onRowClick?: (r: R) => void;
  zebra?: boolean; empty?: React.ReactNode;
}) {
  if (!rows || rows.length === 0) {
    return (empty as any) || (
      <div className="empty">
        <div className="icon-wrap"><Icons.Inbox size={26} /></div>
        <h4>Aucun résultat</h4>
        <p>Essayez d'ajuster vos filtres.</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={c.style}>
                {c.label}
                {c.sortable && <Icons.Sort size={12} className="sort-ico" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r._key || i} className={`${zebra ? "zebra" : ""} ${onRowClick ? "clickable" : ""}`}
              onClick={() => onRowClick && onRowClick(r)}>
              {columns.map((c, j) => (
                <td key={j} className={c.cellClass} style={c.cellStyle}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Pagination ----------
export function Pagination({
  page, pageCount, total, perPage, onPage,
}: { page: number; pageCount: number; total: number; perPage: number; onPage: (p: number) => void }) {
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const windowSize = 5;
  let start = Math.max(1, page - 2);
  let end = Math.min(pageCount, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="pagination">
      <div>Affichage <strong>{from}</strong>–<strong>{to}</strong> sur <strong>{total}</strong></div>
      <div className="pages">
        <button className="pg-btn" disabled={page === 1} onClick={() => onPage(page - 1)}><Icons.ChevLeft size={12} /></button>
        {start > 1 && <button className="pg-btn" onClick={() => onPage(1)}>1</button>}
        {start > 2 && <span style={{ padding: "0 4px", color: "var(--ink-400)" }}>…</span>}
        {pages.map((p) => (
          <button key={p} className={`pg-btn ${p === page ? "active" : ""}`} onClick={() => onPage(p)}>{p}</button>
        ))}
        {end < pageCount - 1 && <span style={{ padding: "0 4px", color: "var(--ink-400)" }}>…</span>}
        {end < pageCount && <button className="pg-btn" onClick={() => onPage(pageCount)}>{pageCount}</button>}
        <button className="pg-btn" disabled={page === pageCount} onClick={() => onPage(page + 1)}><Icons.ChevRight size={12} /></button>
      </div>
    </div>
  );
}

// ---------- Crumbs ----------
export function Crumbs({ items }: { items: React.ReactNode[] }) {
  return (
    <div className="crumbs">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="sep"><Icons.ChevRight size={11} /></span>}
          <span className={i === items.length - 1 ? "here" : ""}>{it}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------- TopBar ----------
export function TopBar({
  title, crumbs, actions,
}: { title: React.ReactNode; crumbs?: React.ReactNode[]; actions?: React.ReactNode }) {
  return (
    <div className="topbar">
      <div>
        {crumbs && <Crumbs items={crumbs} />}
        <h1 className="page-title">{title}</h1>
      </div>
      <div className="spacer" />
      <div className="actions">{actions}</div>
    </div>
  );
}
