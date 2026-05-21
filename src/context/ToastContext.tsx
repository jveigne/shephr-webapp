import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import type { Toast } from "@/components/primitives";

type PushArgs = { kind?: "ok" | "error"; title: string; msg?: string };

type ToastCtx = {
  toasts: Toast[];
  push: (t: PushArgs) => void;
  dismiss: (id: string) => void;
};

const Ctx = createContext<ToastCtx | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: PushArgs) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const next: Toast = { id, ...t };
    setToasts((ts) => [...ts, next]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((ts) => ts.filter((x) => x.id !== id));
  }, []);

  return <Ctx.Provider value={{ toasts, push, dismiss }}>{children}</Ctx.Provider>;
}

export function useToasts() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToasts must be used within ToastProvider");
  return ctx;
}
