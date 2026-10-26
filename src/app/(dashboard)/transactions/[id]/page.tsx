"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAdminSession } from "@/components/providers/session-provider";

type Entry = { id: string; entryType: string; amount: string; description?: string; createdAt: string; ledgerAccount?: { accountName?: string; accountNumber?: string } };
type AdminSummary = { id: string; firstName: string; lastName: string; email: string };
type ReversalRequest = { id: string; status: "PENDING" | "APPROVED" | "REJECTED"; reason: string; decisionReason?: string | null; requestedById: string; requestedBy: AdminSummary; decidedBy?: AdminSummary | null; createdAt: string };
type Txn = {
  id: string;
  transactionReference: string;
  type: string;
  amount: string;
  currencyCode: string;
  status: string;
  feeAmount: string;
  providerReference?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  user?: { id: string; phone: string; profile?: { firstName?: string; lastName?: string } } | null;
  paymentProvider?: { name: string; code: string } | null;
  billPayment?: { billerName: string; providerReference?: string | null; customer: string } | null;
  withdrawal?: Record<string, unknown> | null;
  deposit?: Record<string, unknown> | null;
  transfer?: Record<string, unknown> | null;
  ledgerEntries?: Entry[];
  fraudAlerts?: unknown[];
  disputes?: unknown[];
  reversalRequests?: ReversalRequest[];
  actions?: { canRequery: boolean; canRequestReversal: boolean; canDecideReversal: boolean; pendingReversalRequestId: string | null };
};

type DialogAction = "request" | "approve" | "reject";

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAdminSession();
  const [txn, setTxn] = useState<Txn | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogAction | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const response = await adminApi.getTransaction(id);
    setTxn(response.data as Txn);
  }, [id]);

  useEffect(() => {
    load().catch((cause: Error) => setError(cause.message));
  }, [load]);

  async function requery() {
    setBusy(true);
    setNotice("");
    try {
      const response = await adminApi.requeryTransaction(id);
      const result = response.data as { providerStatus?: string };
      setNotice(`Provider requery completed: ${pretty(result.providerStatus || "unknown")}.`);
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Provider requery failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitDecision() {
    if (!dialog || !txn) return;
    setBusy(true);
    setNotice("");
    try {
      if (dialog === "request") {
        await adminApi.requestTransactionReversal(id, reason);
        setNotice("Reversal requested. A different administrator must approve it.");
      } else {
        const requestId = txn.actions?.pendingReversalRequestId;
        if (!requestId) throw new Error("No pending reversal request was found");
        await adminApi.decideTransactionReversal(id, requestId, dialog === "approve", reason);
        setNotice(dialog === "approve" ? "Reversal approved and customer funds restored." : "Reversal request rejected.");
      }
      setDialog(null);
      setReason("");
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState error={error} onClose={() => router.back()} />;
  if (!txn) return <div className="fixed inset-0 z-[70] bg-slate-950/35"><div className="ml-auto h-full w-full max-w-[560px] animate-pulse bg-white" /></div>;

  const pending = ["INITIATED", "PENDING", "PROCESSING"].includes(txn.status);
  const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(txn.createdAt).getTime()) / 60000));
  const name = txn.user ? `${txn.user.profile?.firstName ?? ""} ${txn.user.profile?.lastName ?? ""}`.trim() || "Customer" : "Platform account";
  const entries = txn.ledgerEntries ?? [];
  const pendingRequest = txn.reversalRequests?.find((request) => request.status === "PENDING");
  const providerName = txn.billPayment ? "Flutterwave" : txn.paymentProvider?.name ?? "Internal";
  const canReverse = can("adjustments");

  return <div className="fixed inset-0 z-[70] bg-slate-950/45" onMouseDown={(event) => { if (event.target === event.currentTarget) router.back(); }}>
    <aside className="ml-auto h-full w-full max-w-[560px] overflow-y-auto bg-white p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-label="Transaction details">
      <div className="flex items-start justify-between"><div><h1 className="text-xl font-extrabold">{txn.transactionReference}</h1><p className="mt-1 text-xs text-slate-600">{pretty(txn.type)} · {providerName}</p></div><button onClick={() => router.back()} aria-label="Close transaction" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-xl">×</button></div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><p className="text-[28px] font-extrabold tracking-tight">{formatCurrency(txn.amount, txn.currencyCode)}</p><Status value={txn.status} suffix={pending ? `${ageMinutes} min` : undefined} /></div>

      {notice && <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-900">{notice}</div>}
      {pending && ageMinutes > 30 ? <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-xs font-semibold leading-5 text-amber-950">⚠ &nbsp;No final provider response after {ageMinutes} minutes. Requery before any reversal—never reverse a transaction that may have succeeded.</div> : txn.failureReason ? <div className="mt-5 rounded-2xl bg-red-50 p-4 text-xs font-semibold leading-5 text-red-800">{txn.failureReason}</div> : null}

      <Section title="Parties"><Row label="Customer" value={name} /><Row label="Phone" value={mask(txn.user?.phone)} /><Row label="User ID" value={txn.user?.id ?? "Not linked"} /></Section>
      <Section title="Timeline"><Step done title="Initiated" detail={formatDate(txn.createdAt)} /><Step done={entries.length > 0} title="Ledger entries posted" detail={entries.length ? `${entries.length} balanced entr${entries.length === 1 ? "y" : "ies"}` : "Awaiting ledger posting"} /><Step done={Boolean(txn.providerReference || txn.billPayment?.providerReference)} title={`Sent to ${providerName}`} detail={txn.providerReference ?? txn.billPayment?.providerReference ?? "No provider reference yet"} /><Step done={!pending} current={pending} title={pending ? "Awaiting provider confirmation" : pretty(txn.status)} detail={`Last update ${formatDate(txn.updatedAt)}`} /></Section>
      <Section title="Ledger entries (double-entry)">{entries.length ? entries.map((entry) => <div key={entry.id} className="flex items-center gap-3 py-2 text-xs"><span className={`rounded px-1.5 py-1 text-[9px] font-bold ${entry.entryType === "DEBIT" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>{entry.entryType === "DEBIT" ? "DR" : "CR"}</span><span className="min-w-0 flex-1 truncate">{entry.ledgerAccount?.accountName ?? entry.description ?? entry.ledgerAccount?.accountNumber ?? "Ledger account"}</span><b>{formatCurrency(entry.amount, txn.currencyCode)}</b></div>) : <p className="text-xs text-slate-500">No ledger entries are linked yet.</p>}</Section>
      <Section title="Provider"><Row label="Provider" value={providerName} /><Row label="Provider ref" value={txn.providerReference ?? txn.billPayment?.providerReference ?? "Not received"} /><Row label="Last response" value={`${txn.status} · ${formatDate(txn.updatedAt)}`} /></Section>

      {pendingRequest && <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950"><p className="font-extrabold">Reversal awaiting second-admin decision</p><p className="mt-1 leading-5">Requested by {adminName(pendingRequest.requestedBy)}: {pendingRequest.reason}</p></div>}

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button onClick={requery} disabled={busy || !txn.actions?.canRequery} title={txn.actions?.canRequery ? "Poll Flutterwave for the latest independently verified status" : "Only pending bill payments can be requeried"} className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Working…" : "↻  Requery provider"}</button>
        {!pendingRequest && <button onClick={() => { setReason(""); setDialog("request"); }} disabled={busy || !canReverse || !txn.actions?.canRequestReversal} title={!canReverse ? "Your role does not grant financial-adjustment permission" : txn.actions?.canRequestReversal ? "Create a maker-checker reversal request" : "This transaction is not eligible for reversal"} className="h-11 rounded-xl border border-slate-400 px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">↙  Request reversal</button>}
        {pendingRequest && !txn.actions?.canDecideReversal && <button disabled className="h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-500 opacity-60">Awaiting another admin</button>}
        {pendingRequest && txn.actions?.canDecideReversal && <div className="grid grid-cols-2 gap-2"><button onClick={() => { setReason(""); setDialog("reject"); }} disabled={busy || !canReverse} className="h-11 rounded-xl border border-red-300 px-3 text-sm font-bold text-red-700 disabled:opacity-50">Reject</button><button onClick={() => { setReason(""); setDialog("approve"); }} disabled={busy || !canReverse} className="h-11 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50">Approve</button></div>}
      </div>
      <p className="mt-3 text-[10px] leading-4 text-slate-500">Approval requires a different administrator and a provider-confirmed failed or reversed status from the last 30 minutes.</p>
    </aside>

    {dialog && <ActionDialog action={dialog} reason={reason} busy={busy} onReason={setReason} onCancel={() => { if (!busy) setDialog(null); }} onSubmit={submitDecision} />}
  </div>;
}

function ActionDialog({ action, reason, busy, onReason, onCancel, onSubmit }: { action: DialogAction; reason: string; busy: boolean; onReason: (value: string) => void; onCancel: () => void; onSubmit: () => void }) {
  const requesting = action === "request";
  const approving = action === "approve";
  const minimum = requesting ? 10 : 5;
  const title = requesting ? "Request transaction reversal" : approving ? "Approve transaction reversal" : "Reject transaction reversal";
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-extrabold">{title}</h2><p className="mt-2 text-xs leading-5 text-slate-600">{approving ? "Approval will post an immutable compensating journal and restore the customer’s funds." : requesting ? "Describe the operational evidence and why this transaction should be reversed." : "Explain why this request should not proceed."}</p><textarea autoFocus value={reason} onChange={(event) => onReason(event.target.value)} rows={4} placeholder="Reason for this decision" className="mt-4 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-blue-600" /><div className="mt-4 flex justify-end gap-2"><button onClick={onCancel} disabled={busy} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button><button onClick={onSubmit} disabled={busy || reason.trim().length < minimum} className={`rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${action === "reject" ? "bg-red-600" : approving ? "bg-emerald-600" : "bg-blue-600"}`}>{busy ? "Working…" : requesting ? "Submit request" : approving ? "Approve reversal" : "Reject request"}</button></div></div></div>;
}

function ErrorState({ error, onClose }: { error: string; onClose: () => void }) { return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4"><div className="max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-xl text-amber-700">!</div><h1 className="mt-4 text-lg font-bold">Transaction details unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">{error}</p><div className="mt-5 flex justify-center gap-2"><button onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-bold">Close</button><button onClick={() => location.reload()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Try again</button></div></div></div>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-6"><h2 className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">{title}</h2>{children}</section>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-5 py-2 text-xs"><span className="text-slate-500">{label}</span><b className="break-all text-right">{value}</b></div>; }
function Step({ done, current, title, detail }: { done: boolean; current?: boolean; title: string; detail: string }) { return <div className="flex gap-3 pb-3"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${done ? "bg-emerald-600 text-white" : current ? "border-2 border-amber-600 text-amber-700" : "bg-slate-100"}`}>{done ? "✓" : ""}</span><div><p className="text-xs font-bold">{title}</p><p className="text-[10px] text-slate-500">{detail}</p></div></div>; }
function Status({ value, suffix }: { value: string; suffix?: string }) { const good = value === "SUCCESS"; const bad = value === "FAILED" || value === "REVERSED"; return <span className={`rounded-full px-3 py-1 text-xs font-bold ${good ? "bg-emerald-50 text-emerald-700" : bad ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>● &nbsp;{pretty(value)}{suffix ? ` · ${suffix}` : ""}</span>; }
function pretty(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase()); }
function mask(value?: string) { return value ? `${value.slice(0, 4)} ••• ${value.slice(-4)}` : "Not recorded"; }
function adminName(admin: AdminSummary) { return `${admin.firstName} ${admin.lastName}`.trim() || admin.email; }
