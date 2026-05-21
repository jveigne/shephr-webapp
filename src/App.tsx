import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";

import LoginPage from "@/pages/Login";
import DashboardPage from "@/pages/Dashboard";
import DonationsPage from "@/pages/Donations";
import MinisteresPage from "@/pages/Ministeres";
import LocalitesPage from "@/pages/Localites";
import UnitesPage from "@/pages/Unites";
import UsersPage from "@/pages/Users";
import HierarchyPage from "@/pages/Hierarchy";
import ExportsPage from "@/pages/Exports";
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
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<LoginPage />} />

              <Route path="/dashboard"  element={<Shielded><DashboardPage  /></Shielded>} />
              <Route path="/donations"  element={<Shielded><DonationsPage  /></Shielded>} />
              <Route path="/ministeres" element={<Shielded><MinisteresPage /></Shielded>} />
              <Route path="/localites"  element={<Shielded><LocalitesPage  /></Shielded>} />
              <Route path="/unites"     element={<Shielded><UnitesPage     /></Shielded>} />
              <Route path="/users"      element={<Shielded><UsersPage      /></Shielded>} />
              <Route path="/hierarchy"  element={<Shielded><HierarchyPage  /></Shielded>} />
              <Route path="/exports"    element={<Shielded><ExportsPage    /></Shielded>} />
              <Route path="/settings"   element={<Shielded><SettingsPage   /></Shielded>} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
