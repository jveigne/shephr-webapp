import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Icons } from "@/components/icons";
import { Badge, Button, Field, Modal, Table, TopBar } from "@/components/primitives";
import { useToasts } from "@/context/ToastContext";
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

  const pendingQ = useQuery({ queryKey: ["structure-requests", "pending"], queryFn: listPendingRequests });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["structure-requests"] });

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

  const rows = pendingQ.data ?? [];

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
    </>
  );
}
