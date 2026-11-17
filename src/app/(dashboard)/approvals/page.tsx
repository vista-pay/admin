"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, type ApprovalAction, type ApprovalRequest } from "@/lib/api";
import { AdminSelect } from "@/components/ui/admin-select";
import { useAdminSession } from "@/components/providers/session-provider";

/**
 * Console actions waiting for a second administrator.
 *
 * The surface that makes maker-checker usable: without it, a gated action
 * answers 428 with a reference and the operator has nowhere to go. The queue
 * and the controls that decide what lands in it are on one page on purpose —
 * "why did this need approving?" and "who decided it should?" are the same
 * question.
 */

type Tab = "PENDING" | "DECIDED" | "MINE" | "SETTINGS";

const money = (value: string | null, currency: string | null) =>
  value === null
    ? null
    : new Intl.NumberFormat("en-NG", { style: "currency", currency: currency ?? "NGN", maximumFractionDigits: 2 }).format(Number(value));
const pretty = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const when = (iso: string) => new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const person = (p: { firstName: string; lastName: string; email: string }) => `${p.firstName} ${p.lastName}`.trim() || p.email;

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-blue-50 text-blue-700",
  EXECUTED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-600",
  CANCELLED: "bg-slate-100 text-slate-600",
  EXPIRED: "bg-slate-100 text-slate-600",
};

export default function ApprovalsPage() {
  const { profile } = useAdminSession();
  const [tab, setTab] = useState<Tab>("PENDING");
  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  const [actions, setActions] = useState<ApprovalAction[]>([]);
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState<ApprovalAction | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        adminApi.approvalRequests(
          tab === "PENDING"
            ? { status: "PENDING", limit: 100 }
            : tab === "MINE"
              ? { mine: true, limit: 100 }
              : { limit: 100 },
        ),
        adminApi.approvalCatalogue(),
      ])
        .then(([queue, catalogue]) => {
          const items = tab === "DECIDED" ? queue.data.items.filter((r) => r.status !== "PENDING") : queue.data.items;
          setRows(items);
          setActions(catalogue.data);
          setSelected((current) => items.find((r) => r.id === current?.id) ?? items[0] ?? null);
          setError("");
        })
        .catch((e: Error) => setError(e.message || "Could not load the approvals queue"))
        .finally(() => setLoading(false)),
    [tab],
  );

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4000); return () => clearTimeout(t); }, [toast]);

  const pendingCount = rows.filter((r) => r.status === "PENDING").length;
  const enforcedCount = actions.filter((a) => a.enforced).length;
  // What the operator cannot do, shown rather than discovered on click: the
  // requester is never their own checker, so their own request is read-only
  // to them (bar the withdrawal).
  const isMine = selected?.requestedBy.id === profile?.id;
  const canDecide = Boolean(selected && selected.status === "PENDING" && !isMine);

  async function submit() {
    if (!selected || !decision || reason.trim().length < 10) return;
    setBusy(true);
    try {
      if (decision === "cancel") {
        await adminApi.cancelApproval(selected.id, reason.trim());
        setToast(`${selected.reference} withdrawn.`);
      } else {
        const result = await adminApi.decideApproval(selected.id, { approve: decision === "approve", reason: reason.trim() });
        setToast(
          decision === "reject"
            ? `${selected.reference} rejected.`
            : result.data.status === "EXECUTED"
              ? `${selected.reference} approved and carried out.`
              : `${selected.reference} approved — ${result.data.approvals.required - result.data.approvals.given} more needed.`,
        );
      }
      setDecision(null);
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The decision could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Approvals</h1>
          <p className="mt-1 text-sm text-slate-600">
            {pendingCount} waiting · {enforcedCount} of {actions.length} console actions currently need a second administrator
          </p>
        </div>
      </header>

      <nav className="mt-4 flex gap-5 overflow-x-auto border-b text-sm">
        {([["PENDING", `Waiting (${pendingCount})`], ["DECIDED", "Decided"], ["MINE", "Submitted by me"], ["SETTINGS", `What needs approval (${enforcedCount})`]] as Array<[Tab, string]>).map(([value, label]) => (
          <button key={value} onClick={() => { setTab(value); setLoading(true); }} className={`whitespace-nowrap border-b-2 py-3 ${tab === value ? "border-blue-600 font-bold text-slate-950" : "border-transparent text-slate-500"}`}>{label}</button>
        ))}
      </nav>

      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {tab === "SETTINGS" ? (
        <section className="mt-5 overflow-hidden rounded-2xl border bg-white">
          <p className="border-b bg-slate-50 px-5 py-3 text-xs leading-5 text-slate-600">
            Maker-checker is off by default on all but financial adjustments. Turning it on for an action means nobody — including you — can carry that action out alone: it is submitted, and a different administrator who also holds the action&rsquo;s own permission has to approve it.
          </p>
          <div className="divide-y">
            {actions.map((action) => (
              <div key={action.key} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm">{action.name}</b>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${action.enforced ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>● {action.enforced ? "Needs approval" : "One click"}</span>
                    {action.policy?.amountThreshold && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">above {money(action.policy.amountThreshold, action.policy.currencyCode)}</span>}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{action.description}</p>
                  {action.policy && action.enforced && (
                    <p className="mt-1 text-xs text-slate-500">
                      {action.policy.minimumApprovers} approval{action.policy.minimumApprovers === 1 ? "" : "s"} from{" "}
                      {action.policy.approverRoles.length ? action.policy.approverRoles.map(pretty).join(" or ") : `anyone holding “${action.permission}”`}
                    </p>
                  )}
                </div>
                <button onClick={() => setEditing(action)} className="shrink-0 rounded-xl border px-4 py-2 text-sm font-bold">Configure</button>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <section className="self-start overflow-hidden rounded-2xl border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr>{["Reference", "Action", "Submitted by", "Amount", "Approvals", "Status"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} onClick={() => setSelected(row)} className={`cursor-pointer border-t ${selected?.id === row.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                      <td className="px-3 py-3 font-medium">{row.reference}</td>
                      <td className="px-3 py-3"><b className="block">{row.actionName}</b><span className="text-xs text-slate-500">{when(row.createdAt)}</span></td>
                      <td className="px-3 py-3">{person(row.requestedBy)}</td>
                      <td className="whitespace-nowrap px-3 py-3">{money(row.amount, row.currencyCode) ?? "—"}</td>
                      <td className="px-3 py-3">{row.approvals.given} of {row.approvals.required}</td>
                      <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[row.status]}`}>● {pretty(row.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && !rows.length && <p className="p-10 text-center text-sm text-slate-500">{tab === "PENDING" ? "Nothing is waiting for approval." : "Nothing here yet."}</p>}
          </section>

          {selected ? (
            <aside className="self-start rounded-2xl border bg-white p-5 xl:sticky xl:top-20">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-black">{selected.reference}</h2>
                  <p className="text-xs text-slate-500">{selected.actionName}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${STATUS_TONE[selected.status]}`}>● {pretty(selected.status)}</span>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-800">{selected.summary}</p>
              {selected.amount && <p className="mt-2 text-3xl font-black">{money(selected.amount, selected.currencyCode)}</p>}

              <h3 className="mt-5 text-[11px] font-extrabold uppercase text-slate-600">Why</h3>
              <p className="mt-1 rounded-xl bg-slate-50 p-3 text-sm leading-5">{selected.reason}</p>

              <dl className="mt-5 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
                <dt className="text-slate-500">Submitted by</dt><dd className="text-right font-bold">{person(selected.requestedBy)}</dd>
                <dt className="text-slate-500">Submitted</dt><dd className="text-right font-bold">{when(selected.createdAt)}</dd>
                <dt className="text-slate-500">Approvals</dt><dd className="text-right font-bold">{selected.approvals.given} of {selected.approvals.required}</dd>
                <dt className="text-slate-500">Who may decide</dt><dd className="text-right font-bold">{selected.approverRoles.length ? selected.approverRoles.map(pretty).join(" or ") : "Any administrator who may perform it"}</dd>
                {selected.expiresAt && <><dt className="text-slate-500">Expires</dt><dd className="text-right font-bold">{when(selected.expiresAt)}</dd></>}
                {selected.executionReference && <><dt className="text-slate-500">Carried out as</dt><dd className="truncate text-right font-bold" title={selected.executionReference}>{selected.executionReference}</dd></>}
              </dl>

              {/* Approved but the action would not run. Its own state, because
                  it must never be mistaken for one that was never approved. */}
              {selected.executionError && (
                <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">
                  <b>Approved, but it did not go through:</b> {selected.executionError}
                </p>
              )}

              {selected.decisions.length > 0 && (
                <>
                  <h3 className="mt-5 text-[11px] font-extrabold uppercase text-slate-600">Decisions</h3>
                  <div className="mt-2 space-y-2">
                    {selected.decisions.map((d) => (
                      <p key={d.id} className="text-xs leading-5 text-slate-600">
                        <b className={d.approve ? "text-emerald-700" : "text-red-600"}>{d.approve ? "Approved" : "Rejected"}</b>
                        {" "}by {person(d.admin)} ({pretty(d.roleKey)})
                        {d.selfApproved && <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">SELF-APPROVED</span>}
                        <br />{d.reason}
                        <br /><span className="text-slate-400">{when(d.createdAt)}</span>
                      </p>
                    ))}
                  </div>
                </>
              )}

              <details className="mt-5">
                <summary className="cursor-pointer text-[11px] font-extrabold uppercase text-slate-600">Exactly what was submitted</summary>
                {/* Shown in full because this is what the approval authorises:
                    the API hashes it, and a payload that differs by a digit
                    needs its own approval. */}
                <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">{JSON.stringify(selected.payload, null, 2)}</pre>
              </details>

              {selected.status === "PENDING" && (
                <div className="mt-5 space-y-2">
                  {isMine ? (
                    <>
                      <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">You submitted this, so you cannot approve it. That is what the control is for — another administrator has to look at it.</p>
                      <button onClick={() => { setReason(""); setDecision("cancel"); }} className="h-11 w-full rounded-xl border font-bold">Withdraw this request</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setReason(""); setDecision("reject"); }} className="h-11 w-full rounded-xl border font-bold">Reject</button>
                      <button disabled={!canDecide} onClick={() => { setReason(""); setDecision("approve"); }} className="h-11 w-full rounded-xl bg-blue-600 font-bold text-white disabled:opacity-40">✓ &nbsp;Approve</button>
                    </>
                  )}
                </div>
              )}
              <p className="mt-3 text-xs leading-5 text-slate-500">Every decision is attributed to your admin account and written to the central activity stream.</p>
            </aside>
          ) : (
            <aside className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">Select a request to review.</aside>
          )}
        </div>
      )}

      {decision && selected && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="text-lg font-black">{decision === "approve" ? `Approve ${selected.reference}` : decision === "reject" ? `Reject ${selected.reference}` : `Withdraw ${selected.reference}`}</h2>
            <p className="mt-2 text-sm text-slate-600">{selected.summary}</p>
            {decision === "approve" && selected.approvals.given + 1 >= selected.approvals.required && (
              <p className="mt-3 rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-900">This is the last approval needed, so the action is carried out as soon as you confirm.</p>
            )}
            <textarea autoFocus rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why you are allowing or refusing this (at least 10 characters)" className="mt-4 w-full rounded-xl border p-3 text-sm outline-none focus:border-blue-500" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDecision(null)} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
              <button disabled={busy || reason.trim().length < 10} onClick={submit} className={`rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-40 ${decision === "approve" ? "bg-blue-600" : "bg-red-600"}`}>{busy ? "Saving…" : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}

      {editing && <PolicyDialog action={editing} onClose={() => setEditing(null)} onSaved={(message) => { setEditing(null); setToast(message); void load(); }} onError={setError} />}

      {toast && <div className="fixed bottom-5 right-5 z-[90] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl">✓ &nbsp;{toast}</div>}
    </main>
  );
}

/**
 * Turn maker-checker on or off for one action.
 *
 * The API refuses a policy nobody could satisfy — two approvers on a platform
 * with two administrators needs three people — so the error it returns is
 * shown verbatim rather than guessed at here.
 */
function PolicyDialog({ action, onClose, onSaved, onError }: {
  action: ApprovalAction;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [required, setRequired] = useState(action.policy?.makerCheckerRequired ?? action.defaultMakerChecker);
  const [approvers, setApprovers] = useState(String(action.policy?.minimumApprovers ?? 1));
  const [threshold, setThreshold] = useState(action.policy?.amountThreshold ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (reason.trim().length < 5) return;
    setBusy(true);
    try {
      await adminApi.upsertApprovalPolicy({
        actionKey: action.key,
        name: action.name,
        description: action.description,
        makerCheckerRequired: required,
        minimumApprovers: Math.max(1, Number(approvers) || 1),
        // Left empty — "anyone who may perform the action" — rather than
        // guessing at this platform's org chart. A wrong guess here is a
        // control nobody can satisfy.
        approverRoles: action.policy?.approverRoles ?? [],
        ...(threshold.trim() ? { amountThreshold: threshold.trim(), currencyCode: "NGN" } : {}),
        isActive: true,
        reason: reason.trim(),
      });
      onSaved(`${action.name} now ${required ? "needs a second administrator" : "goes through on one click"}.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "The policy could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <h2 className="text-lg font-black">{action.name}</h2>
        <p className="mt-2 text-sm leading-5 text-slate-600">{action.description}</p>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border p-3">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="mt-0.5" />
          <span className="text-sm"><b className="block">Require a second administrator</b><span className="text-xs leading-5 text-slate-500">Whoever submits it cannot approve it, and the approver must also hold &ldquo;{action.permission}&rdquo;.</span></span>
        </label>

        {required && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase text-slate-600">Approvals needed
              <AdminSelect value={approvers} onChange={(e) => setApprovers(e.target.value)} containerClassName="mt-1 w-full"><option value="1">1</option><option value="2">2</option><option value="3">3</option></AdminSelect>
            </label>
            <label className="text-xs font-bold uppercase text-slate-600">Only above (₦, optional)
              <input value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 500000" className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-normal outline-none focus:border-blue-500" />
            </label>
          </div>
        )}

        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why you are changing this control (at least 5 characters)" className="mt-3 w-full rounded-xl border p-3 text-sm outline-none focus:border-blue-500" />

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
          <button disabled={busy || reason.trim().length < 5} onClick={save} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{busy ? "Saving…" : "Save control"}</button>
        </div>
      </div>
    </div>
  );
}
