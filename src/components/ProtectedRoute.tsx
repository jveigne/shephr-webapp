import { Navigate } from "react-router-dom";
import { ReactElement } from "react";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Web app is admin-only — block non-admin roles
  if (user && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") return <Navigate to="/login" replace />;
  return children;
}
