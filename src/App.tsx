import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { Placeholder } from "@/components/Placeholder";

import LoginPage from "@/pages/Login";
import MinisteresPage from "@/pages/Ministeres";
import SettingsPage from "@/pages/Settings";

const queryClient = new QueryClient();

function Shielded({ children }: { children: JSX.Element }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
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
              <Route
                path="/abonnements"
                element={
                  <Shielded>
                    <Placeholder
                      title="Abonnements"
                      crumbs={["JExcellence", "Abonnements"]}
                      description="Activer/désactiver les modules payants (Donations, Member Care) par ministère, et le prix dégressif sur cumul."
                      endpointHint="GET/POST /admin/subscriptions · GET/PATCH /admin/modules"
                    />
                  </Shielded>
                }
              />
              <Route
                path="/goals"
                element={
                  <Shielded>
                    <Placeholder
                      title="Goals globaux"
                      crumbs={["JExcellence", "Goals globaux"]}
                      description="Créer le But Quinquennal et ses catégories, l'affecter aux ministères."
                      endpointHint="UC-SUP-09 · création Goal global"
                    />
                  </Shielded>
                }
              />
              <Route
                path="/audit"
                element={
                  <Shielded>
                    <Placeholder
                      title="Journal d'audit"
                      crumbs={["JExcellence", "Audit"]}
                      description="Traçabilité des actions sensibles (créations de ministères, abonnements, promotions)."
                      endpointHint="🆕 GET /admin/audit-logs (Lot 6.3)"
                    />
                  </Shielded>
                }
              />
              <Route path="/settings" element={<Shielded><SettingsPage /></Shielded>} />

              <Route path="*" element={<Navigate to="/ministeres" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
