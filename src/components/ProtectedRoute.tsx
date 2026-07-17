import { Navigate } from "react-router-dom";
import { ReactElement } from "react";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Back-office JExcellence — strictly reserved to platform SUPER_ADMIN.
  if (!user?.superAdmin) return <Navigate to="/login" replace />;
  return children;
}
