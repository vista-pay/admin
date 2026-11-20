"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, type SettlementAccountRow } from "@/lib/api";

/**
 * Where a community's money is allowed to leave Rendi for a bank.
 *
 * A settlement account is the single point at which money stops being
 * Rendi's problem and becomes a bank transfer, and until this queue existed
 * anyone who could reach a community's merchant settings could add one and
 * settle to it the same hour. That is the shape of every payout-redirection
 * fraud there is: compromise an officer, change the destination, wait for
 * the next run.
 *
 * The screen is built around the one question an approver is actually being
 * asked — *does this account belong to the people asking for it?* — so the
 * name the bank returned sits next to the name of the cooperative, and a
 * disagreement is called out rather than left to be noticed.
 *
 * Approving opens the destination for every future run. Rejecting moves no
 * money and freezes nothing: a refused account is a reason to ask for a
 * different one, not a reason to keep a community from its own funds.
 */

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-800",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
};

const day = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(iso)) : "—";

/** How long it has been waiting. Measured from page load so rows agree. */
const loadedAt = Date.now();
const waited = (iso: string) => {
  const hours = Math.max(0, Math.floor((loadedAt - new Date(iso).getTime()) / 3_600_000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d` : `${hours}h`;
};

export default function SettlementApprovalsPage() {
  const [tab, setTab] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [rows, setRows] = useState<SettlementAccountRow[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [deciding, setDeciding] = useState<{ row: SettlementAccountRow; approve: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      adminApi
        .settlementAccounts({ ...(tab === "ALL" ? {} : { status: tab }), limit: 100 })
        .then((res) => {
          setRows(res.data.items);
          setPending(res.data.pending);
          setError("");
        })
        .catch((cause: Error) => setError(cause.message || "Could not load settlement accounts"))
        .finally(() => setLoading(false)),
    [tab],
  );

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4500); return () => clearTimeout(t); }, [toast]);

  async function decide() {
    if (!deciding) return;
    setBusy(true);
    try {
      if (deciding.approve) {
        await adminApi.approveSettlementAccount(deciding.row.id, reason.trim() || undefined);
        setToast(`Settlements to ${deciding.row.bankName} approved. The next run will go through.`);
      } else {
        await adminApi.rejectSettlementAccount(deciding.row.id, reason.trim());
        setToast(`Refused. ${deciding.row.owner?.name ?? "They"} will see the reason you gave.`);
      }
      setDeciding(null);
      setReason("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Money &amp; risk</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Settlement approvals</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
          Where a community&rsquo;s money is allowed to leave Rendi. Nothing settles to an account
          until it is approved here, and a decision takes effect on the next run — approving opens
          the destination, refusing leaves the money exactly where it is.
        </p>
      </header>

      {pending > 0 && (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <b>{pending} account{pending === 1 ? "" : "s"} waiting.</b> A community with an unapproved
          destination cannot be paid, so this queue is somebody&rsquo;s money sitting still.
        </p>
      )}

      <nav className="mt-6 flex gap-5 overflow-x-auto border-b border-slate-200 text-sm">
        {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((value) => (
          <button
            key={value}
            onClick={() => { setLoading(true); setTab(value); }}
            className={`whitespace-nowrap border-b-2 py-3 transition-colors ${tab === value ? "border-blue-600 font-bold text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {value === "ALL" ? "All" : value.charAt(0) + value.slice(1).toLowerCase()}
            {value === "PENDING" && pending > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{pending}</span>
            )}
          </button>
        ))}
      </nav>

      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                {["Who is asking", "Bank account", "Name on the account", "Waiting", "Status", ""].map((head) => (
                  <th key={head} className="px-4 py-3 font-extrabold">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length && (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-500">Loading…</td></tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3.5">
                    {row.owner?.kind === "COMMUNITY" ? (
                      <Link href={`/community/${row.owner.id}`} className="font-bold text-slate-900 hover:text-blue-600">
                        {row.owner.name}
                      </Link>
                    ) : (
                      <b className="text-slate-900">{row.owner?.name ?? "Unknown"}</b>
                    )}
                    <span className="block text-xs text-slate-500">
                      {row.owner?.kind === "COMMUNITY" ? row.community?.publicId ?? "Community" : "Business"}
                      {row.isDefault && " · default destination"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <b className="block text-slate-900">{row.bankName}</b>
                    <span className="tabular-nums text-xs text-slate-500">{row.accountNumber}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="block text-slate-900">{row.accountName}</span>
                    {/* The question the approver is actually being asked. */}
                    {!row.nameMatchesOwner && (
                      <span className="mt-1 inline-block rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                        Does not match {row.owner?.name ?? "the owner"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs tabular-nums text-slate-600">
                    {row.status === "PENDING" ? waited(row.createdAt) : day(row.reviewedAt)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[row.status]}`}>
                      {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
                    </span>
                    {row.reviewReason && (
                      <span className="mt-1 block max-w-[220px] text-[11px] leading-4 text-slate-500">{row.reviewReason}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {row.status !== "APPROVED" ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setReason(""); setError(""); setDeciding({ row, approve: true }); }}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                        {row.status === "PENDING" && (
                          <button
                            onClick={() => { setReason(""); setError(""); setDeciding({ row, approve: false }); }}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                          >
                            Refuse
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => { setReason(""); setError(""); setDeciding({ row, approve: false }); }}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        Withdraw approval
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !rows.length && (
          <p className="p-12 text-center text-sm text-slate-500">
            {tab === "PENDING" ? "Nothing waiting — every destination has been decided." : "Nothing here."}
          </p>
        )}
      </section>

      {deciding && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black leading-tight text-slate-950">
              {deciding.approve
                ? `Allow settlements to ${deciding.row.bankName}?`
                : `Refuse ${deciding.row.bankName} ••${deciding.row.accountNumber.slice(-4)}?`}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {deciding.approve ? (
                <>
                  Every future settlement run for <b>{deciding.row.owner?.name}</b> will go to{" "}
                  <b>{deciding.row.accountName}</b> at {deciding.row.bankName}, account{" "}
                  {deciding.row.accountNumber}. It takes effect on the next run.
                </>
              ) : (
                <>
                  Nothing is frozen and no money moves — <b>{deciding.row.owner?.name}</b> keeps
                  everything it has. What stops is settlement to this account, and they are shown
                  your reason word for word.
                </>
              )}
            </p>

            {deciding.approve && !deciding.row.nameMatchesOwner && (
              <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">
                The bank returned <b>{deciding.row.accountName}</b>, which does not look like{" "}
                <b>{deciding.row.owner?.name}</b>. Check this is the cooperative&rsquo;s own account
                and not an officer&rsquo;s before approving.
              </p>
            )}

            <textarea
              autoFocus
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={deciding.approve ? "Note (optional)" : "Why (at least 5 characters)"}
              className="mt-4 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-blue-500"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDeciding(null)} className="h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold">
                Cancel
              </button>
              <button
                disabled={busy || (!deciding.approve && reason.trim().length < 5)}
                onClick={() => void decide()}
                className={`h-11 rounded-xl px-5 text-sm font-bold text-white transition disabled:opacity-40 ${deciding.approve ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
              >
                {busy ? "Saving…" : deciding.approve ? "Approve" : "Refuse"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[90] max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-5 text-emerald-800 shadow-xl">
          ✓ &nbsp;{toast}
        </div>
      )}
    </main>
  );
}
