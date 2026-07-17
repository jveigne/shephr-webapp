import { apiFetch } from "./api";

// Mirrors com.excellence.back.audit.dto.DashboardResponse
export interface DashboardResponse {
  ministries: number;
  users: number;
  modules: number;
  activeSubscriptions: number;
  suspendedSubscriptions: number;
}

export function getDashboard(): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>("/admin/dashboard");
}

// Mirrors com.excellence.back.audit.dto.AuditLogResponse
export interface AuditLogResponse {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ministryId: string | null;
  summary: string | null;
  createdAt: string;
}

export function listAuditLogs(params?: { action?: string; actorEmail?: string; limit?: number }): Promise<AuditLogResponse[]> {
  const qs = new URLSearchParams();
  if (params?.action) qs.set("action", params.action);
  if (params?.actorEmail) qs.set("actorEmail", params.actorEmail);
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return apiFetch<AuditLogResponse[]>(`/admin/audit-logs${q ? `?${q}` : ""}`);
}
