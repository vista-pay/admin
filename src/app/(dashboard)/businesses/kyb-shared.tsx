/** Types and badges shared by the business directory and the review page. */

export type KybStatus = "SUBMITTED" | "IN_REVIEW" | "AWAITING_INFORMATION" | "READY_FOR_APPROVAL" | "APPROVED" | "REJECTED";
export type KybRisk = "LOW" | "MEDIUM" | "HIGH";

export type KybInfo = {
  reference: string;
  status: KybStatus;
  riskLevel: KybRisk;
  eddRequired: boolean;
  issues: string[];
  decisionReason?: string | null;
  submittedAt: string;
  decidedAt?: string | null;
  assignee: { id: string; name: string; email?: string } | null;
};

export type Admin = { id: string; firstName: string; lastName: string };

export const KYB_STATUS_META: Record<KybStatus, { label: string; cls: string }> = {
  SUBMITTED: { label: "Submitted", cls: "bg-slate-100 text-slate-700" },
  IN_REVIEW: { label: "In review", cls: "bg-blue-50 text-blue-700" },
  AWAITING_INFORMATION: { label: "Awaiting information", cls: "bg-amber-50 text-amber-700" },
  READY_FOR_APPROVAL: { label: "Ready for approval", cls: "bg-sky-50 text-sky-700" },
  APPROVED: { label: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Rejected", cls: "bg-red-50 text-red-600" },
};

export function KybBadge({ status }: { status: KybStatus }) {
  const meta = KYB_STATUS_META[status];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.cls}`}>● {meta.label}</span>;
}

export function RiskCell({ risk, edd }: { risk: KybRisk; edd: boolean }) {
  const label = risk === "HIGH" ? "High" : risk === "MEDIUM" ? "Medium" : "Low";
  return (
    <span className={risk === "HIGH" ? "font-semibold text-red-600" : "text-slate-600"}>
      {label}
      {edd && <span className="text-red-600"> · EDD</span>}
    </span>
  );
}

export function fmtShort(date: string) {
  const d = new Date(date);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}
