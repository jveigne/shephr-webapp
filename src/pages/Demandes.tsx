import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Field, Modal, Table, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
import {
  approveJoinRequest, fetchPendingJoinRequests, rejectJoinRequest,
  type JoinRequestResponse,
} from "@/services/joinRequestService";
import {
  approveRequest, listPendingRequests, rejectRequest,
  type StructureRequestResponse, type StructureRequestType,
} from "@/services/structureRequestService";

// Lot D2 (RDG 22/07) : file des demandes de création de structure — le back-office approuve
// (l'entité est créée côté backend : legacy + org_node) ou refuse avec motif obligatoire.

const TYPE_TONE: Record<StructureRequestType, "earth" | "green" | "gray"> = {
  REGION: "green",
  CITY: "earth",
  ASSEMBLY: "gray",
};

function fmtDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function DemandesPage() {
  const { t, i18n } = useTranslation();
  const { push } = useToasts();
  const qc = useQueryClient();
  const dateLocale = (i18n.resolvedLanguage || i18n.language) === "en" ? "en-GB" : "fr-FR";

  const [rejecting, setRejecting] = useState<StructureRequestResponse | null>(null);
  const [reason, setReason] = useState("");
  const [rejectingJoin, setRejectingJoin] = useState<JoinRequestResponse | null>(null);
  const [joinReason, setJoinReason] = useState("");

  const pendingQ = useQuery({ queryKey: ["structure-requests", "pending"], queryFn: listPendingRequests });
  const joinPendingQ = useQuery({ queryKey: ["join-requests", "pending"], queryFn: fetchPendingJoinRequests });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["structure-requests"] });
  const invalidateJoin = () => qc.invalidateQueries({ queryKey: ["join-requests"] });

  const approveM = useMutation({
    mutationFn: approveRequest,
    onSuccess: (r) => {
      invalidate();
      // La structure a changé : rafraîchit aussi l'arbre du back-office.
      qc.invalidateQueries({ queryKey: ["ministry-structure"] });
      push({ kind: "ok", title: t("requests.approvedToast", { name: r.name }), msg: "" });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const rejectM = useMutation({
    mutationFn: ({ id, reason: r }: { id: string; reason: string }) => rejectRequest(id, r),
    onSuccess: (r) => {
      invalidate();
      setRejecting(null);
      setReason("");
      push({ kind: "ok", title: t("requests.rejectedToast", { name: r.name }), msg: "" });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const approveJoinM = useMutation({
    mutationFn: approveJoinRequest,
    onSuccess: (r) => {
      invalidateJoin();
      // L'approbation peut créer l'assemblée « à créer » : rafraîchit aussi les demandes
      // de structure et l'arbre du back-office.
      invalidate();
      qc.invalidateQueries({ queryKey: ["ministry-structure"] });
      push({ kind: "ok", title: t("joinRequests.approvedToast", { name: r.userName ?? "—" }), msg: "" });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const rejectJoinM = useMutation({
    mutationFn: ({ id, reason: r }: { id: string; reason: string }) => rejectJoinRequest(id, r),
    onSuccess: (r) => {
      invalidateJoin();
      setRejectingJoin(null);
      setJoinReason("");
      push({ kind: "ok", title: t("joinRequests.rejectedToast", { name: r.userName ?? "—" }), msg: "" });
    },
    onError: (e: unknown) => push({ kind: "error", title: t("common.failure"), msg: e instanceof Error ? e.message : t("common.error") }),
  });

  const cols = [
    {
      label: t("requests.colDate"),
      render: (r: StructureRequestResponse) => (
        <span style={{ color: "var(--ink-500)" }}>{fmtDateTime(r.createdAt, dateLocale)}</span>
      ),
    },
    {
      label: t("requests.colType"),
      render: (r: StructureRequestResponse) => (
        <Badge tone={TYPE_TONE[r.type]}>{t(`requests.types.${r.type}`)}</Badge>
      ),
    },
    {
      label: t("requests.colName"),
      render: (r: StructureRequestResponse) => <strong>{r.name}</strong>,
    },
    {
      label: t("requests.colParent"),
      render: (r: StructureRequestResponse) => (
        <span style={{ color: "var(--ink-600)" }}>
          {r.parentName ?? "—"}
          {r.parentPending && (
            <span style={{ marginLeft: 6 }}>
              <Badge tone="gray">{t("requests.parentPendingBadge")}</Badge>
            </span>
          )}
        </span>
      ),
    },
    {
      label: t("requests.colRequester"),
      render: (r: StructureRequestResponse) => <span>{r.requestedByName ?? "—"}</span>,
    },
    {
      label: "",
      render: (r: StructureRequestResponse) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button
            variant="primary"
            size="sm"
            iconL={<Icons.Check size={14} />}
            disabled={approveM.isPending}
            title={r.parentPending ? t("requests.approveChainHint") : undefined}
            onClick={() => approveM.mutate(r.id)}
          >
            {t("requests.approve")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconL={<Icons.X size={14} />}
            disabled={rejectM.isPending}
            onClick={() => { setRejecting(r); setReason(""); }}
          >
            {t("requests.reject")}
          </Button>
        </div>
      ),
    },
  ];

  const joinCols = [
    {
      label: t("joinRequests.colDate"),
      render: (r: JoinRequestResponse) => (
        <span style={{ color: "var(--ink-500)" }}>{fmtDateTime(r.createdAt, dateLocale)}</span>
      ),
    },
    {
      label: t("joinRequests.requester"),
      render: (r: JoinRequestResponse) => <strong>{r.userName ?? "—"}</strong>,
    },
    {
      label: t("joinRequests.targetAssembly"),
      render: (r: JoinRequestResponse) => (
        <span style={{ color: "var(--ink-600)" }}>
          {r.structureRequestId ? (
            <>
              {t("joinRequests.toCreate", { name: r.newAssemblyName ?? "—" })}
              <span style={{ marginLeft: 6 }}>
                <Badge tone="gray">{t("requests.parentPendingBadge")}</Badge>
              </span>
            </>
          ) : (
            <>
              {r.assemblyName ?? "—"}
              {r.cityName && <span style={{ color: "var(--ink-500)" }}> — {r.cityName}</span>}
            </>
          )}
        </span>
      ),
    },
    {
      label: t("joinRequests.colRole"),
      render: (r: JoinRequestResponse) => (
        <span>
          <Badge tone={r.requestedRole === "LEADER" ? "earth" : "gray"}>
            {r.requestedRole === "LEADER" ? t("joinRequests.roleLeader") : t("joinRequests.roleMember")}
          </Badge>
          {r.assemblyHasLeader && r.requestedRole === "LEADER" && (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 8, color: "var(--ink-600)", fontSize: 12 }}
              title={t("joinRequests.leaderConflict")}
            >
              <Icons.Warning size={14} />
              {t("joinRequests.leaderConflictShort")}
            </span>
          )}
        </span>
      ),
    },
    {
      label: "",
      render: (r: JoinRequestResponse) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button
            variant="primary"
            size="sm"
            iconL={<Icons.Check size={14} />}
            disabled={approveJoinM.isPending}
            title={
              r.assemblyHasLeader && r.requestedRole === "LEADER"
                ? t("joinRequests.leaderConflict")
                : r.structureRequestId
                  ? t("joinRequests.approveCreateHint")
                  : undefined
            }
            onClick={() => approveJoinM.mutate(r.id)}
          >
            {t("joinRequests.approve")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconL={<Icons.X size={14} />}
            disabled={rejectJoinM.isPending}
            onClick={() => { setRejectingJoin(r); setJoinReason(""); }}
          >
            {t("joinRequests.reject")}
          </Button>
        </div>
      ),
    },
  ];

  const rows = pendingQ.data ?? [];
  const joinRows = joinPendingQ.data ?? [];

  return (
    <>
      <TopBar title={t("requests.title")} crumbs={[t("common.jexcellence"), t("nav.requests")]} />
      <div className="content">
        <p className="section-sub">{t("requests.intro")}</p>

        <div className="card" style={{ padding: 0 }}>
          {pendingQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : rows.length === 0 ? (
            <div className="empty" style={{ padding: 32 }}>
              <div className="icon-wrap"><Icons.Inbox size={26} /></div>
              <h4>{t("requests.empty")}</h4>
              <p>{t("requests.emptyHint")}</p>
            </div>
          ) : (
            <Table columns={cols} rows={rows.map((r) => ({ ...r, _key: r.id }))} zebra />
          )}
        </div>

        <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--green-800)", margin: "28px 0 6px" }}>
          {t("joinRequests.title")}
        </h3>
        <p className="section-sub">{t("joinRequests.intro")}</p>

        <div className="card" style={{ padding: 0 }}>
          {joinPendingQ.isLoading ? (
            <div style={{ padding: 24, color: "var(--ink-500)" }}>{t("common.loading")}</div>
          ) : joinRows.length === 0 ? (
            <div className="empty" style={{ padding: 32 }}>
              <div className="icon-wrap"><Icons.Inbox size={26} /></div>
              <h4>{t("joinRequests.empty")}</h4>
              <p>{t("joinRequests.emptyHint")}</p>
            </div>
          ) : (
            <Table columns={joinCols} rows={joinRows.map((r) => ({ ...r, _key: r.id }))} zebra />
          )}
        </div>
      </div>

      <Modal
        open={rejecting != null}
        onClose={() => setRejecting(null)}
        title={rejecting ? t("requests.rejectTitle", { name: rejecting.name }) : ""}
        sub={t("requests.rejectSub")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>{t("common.cancel")}</Button>
            <Button
              variant="primary"
              disabled={reason.trim().length === 0 || rejectM.isPending}
              onClick={() => rejecting && rejectM.mutate({ id: rejecting.id, reason: reason.trim() })}
            >
              {t("requests.rejectConfirm")}
            </Button>
          </>
        }
      >
        <Field label={t("requests.rejectReasonLabel")}>
          <textarea
            className="input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("requests.rejectReasonPlaceholder")}
          />
        </Field>
      </Modal>

      <Modal
        open={rejectingJoin != null}
        onClose={() => setRejectingJoin(null)}
        title={rejectingJoin ? t("joinRequests.rejectTitle", { name: rejectingJoin.userName ?? "—" }) : ""}
        sub={t("joinRequests.rejectSub")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectingJoin(null)}>{t("common.cancel")}</Button>
            <Button
              variant="primary"
              disabled={joinReason.trim().length === 0 || rejectJoinM.isPending}
              onClick={() => rejectingJoin && rejectJoinM.mutate({ id: rejectingJoin.id, reason: joinReason.trim() })}
            >
              {t("joinRequests.rejectConfirm")}
            </Button>
          </>
        }
      >
        <Field label={t("joinRequests.rejectReason")}>
          <textarea
            className="input"
            rows={3}
            value={joinReason}
            onChange={(e) => setJoinReason(e.target.value)}
            placeholder={t("joinRequests.rejectReasonPlaceholder")}
          />
        </Field>
      </Modal>
    </>
  );
}
