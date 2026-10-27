import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Placeholder } from "@/components/Placeholder";

import LoginPage from "@/pages/Login";
import MinisteresPage from "@/pages/Ministeres";
import StructurePage from "@/pages/Structure";
import DemandesPage from "@/pages/Demandes";
import UtilisateursPage from "@/pages/Utilisateurs";
import AbonnementsPage from "@/pages/Abonnements";
import FacturationPage from "@/pages/Facturation";
import ModulesEnseignementPage from "@/pages/ModulesEnseignement";
import TypesEvenementPage from "@/pages/TypesEvenement";
import DocumentsPage from "@/pages/Documents";
import AuditPage from "@/pages/Audit";
import SupervisionPage from "@/pages/Supervision";
import SettingsPage from "@/pages/Settings";

const queryClient = new QueryClient();

function Shielded({ children }: { children: JSX.Element }) {
  // key sur le pathname : une page qui a planté se remonte proprement dès qu'on navigue ailleurs.
  const { pathname } = useLocation();
  return (
    <ProtectedRoute>
      <AppShell>
        <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
      </AppShell>
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
              <Route path="/demandes" element={<Shielded><DemandesPage /></Shielded>} />
              <Route path="/utilisateurs" element={<Shielded><UtilisateursPage /></Shielded>} />
              {/* D-HIE-08 (JP 28/10) — historique des demandes de supervision, lecture seule (§7.3 du plan Hiérarchie) */}
              <Route path="/supervision" element={<Shielded><SupervisionPage /></Shielded>} />
              <Route path="/abonnements" element={<Shielded><AbonnementsPage /></Shielded>} />
              {/* D-ABO-15 (JP 23/10) — facturation des abonnements payants (§6.3 du plan Abonnements payants) */}
              <Route path="/facturation" element={<Shielded><FacturationPage /></Shielded>} />
              {/* D-ASM-10 (JP 23/09) — modules d'enseignement par ministère */}
              <Route path="/modules-enseignement" element={<Shielded><ModulesEnseignementPage /></Shielded>} />
              {/* RG-EVT-01 (JP 14/10) — types d'évènement par ministère (§6.1 du plan Évènements) */}
              <Route path="/types-evenement" element={<Shielded><TypesEvenementPage /></Shielded>} />
              {/* D-DOC-07 (JP 18/10) — documents partagés par lien + catégories (§6.1 du plan Liseuse & partage) */}
              <Route path="/documents" element={<Shielded><DocumentsPage /></Shielded>} />
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
