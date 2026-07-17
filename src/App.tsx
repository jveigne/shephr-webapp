import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { Placeholder } from "@/components/Placeholder";

import LoginPage from "@/pages/Login";
import MinisteresPage from "@/pages/Ministeres";
import StructurePage from "@/pages/Structure";
import UtilisateursPage from "@/pages/Utilisateurs";
import AbonnementsPage from "@/pages/Abonnements";
import AuditPage from "@/pages/Audit";
import SettingsPage from "@/pages/Settings";

const queryClient = new QueryClient();

function Shielded({ children }: { children: JSX.Element }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

function GlobalGoalsPlaceholder() {
  const { t } = useTranslation();
  return (
    <Placeholder
      title={t("nav.globalGoals")}
      crumbs={[t("common.jexcellence"), t("nav.globalGoals")]}
      description={t("placeholder.globalGoalsDescription")}
      endpointHint={t("placeholder.globalGoalsHint")}
    />
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/ministeres" replace />} />
              <Route path="/login" element={<LoginPage />} />

              {/* Back-office JExcellence — cross-tenant, SUPER_ADMIN only */}
              <Route path="/ministeres" element={<Shielded><MinisteresPage /></Shielded>} />
              <Route path="/structure" element={<Shielded><StructurePage /></Shielded>} />
              <Route path="/utilisateurs" element={<Shielded><UtilisateursPage /></Shielded>} />
              <Route path="/abonnements" element={<Shielded><AbonnementsPage /></Shielded>} />
              <Route
                path="/goals"
                element={
                  <Shielded>
                    <GlobalGoalsPlaceholder />
                  </Shielded>
                }
              />
              <Route path="/audit" element={<Shielded><AuditPage /></Shielded>} />
              <Route path="/settings" element={<Shielded><SettingsPage /></Shielded>} />

              <Route path="*" element={<Navigate to="/ministeres" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
