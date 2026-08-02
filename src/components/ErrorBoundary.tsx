import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./primitives";

/**
 * Filet de sécurité : sans lui, la moindre exception au rendu démonte tout l'arbre React
 * et l'utilisateur se retrouve sur une page blanche, sans indice de ce qui a cassé.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="content">
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <h3 style={{ margin: "0 0 8px" }}>{t("common.unexpectedError")}</h3>
        <p style={{ margin: "0 0 16px", color: "var(--ink-500)" }}>{t("common.unexpectedErrorHint")}</p>
        <pre style={{
          margin: "0 0 16px", padding: 12, borderRadius: 8, textAlign: "left", fontSize: 12.5,
          background: "var(--parchment,#faf7f0)", color: "var(--ink-600)", overflowX: "auto",
        }}>
          {error.message}
        </pre>
        <Button variant="primary" onClick={onRetry}>{t("common.retry")}</Button>
      </div>
    </div>
  );
}
