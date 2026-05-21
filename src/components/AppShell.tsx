import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { ToastHost } from "./primitives";
import { useToasts } from "@/context/ToastContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">{children}</main>
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
