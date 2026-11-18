"use client";

/**
 * Where the platform's money is — and the one screen that can pay Rendi its
 * own earnings.
 *
 * Fee revenue has always been recognised in the ledger, but the cash it
 * represents sits in the provider settlement account alongside custodied
 * customer funds, indistinguishable at the bank. This page states that
 * distinction plainly (earned / swept / available, against customer float)
 * and makes the sweep an explicit, approved act rather than a manual bank
 * transfer nobody reconciled.
 *
 * The sweep deliberately answers 428 the first time: maker-checker is on by
 * default for it, so the button raises a request and tells the operator who
 * has to agree.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { AreaTrend } from "@/components/admin/area-trend";

type Flow = {
  currency: string;
  periodDays: number;
  totals: {
    earnedAllTime: string;
    sweptAllTime: string;
    available: string;
    pendingSweeps: string;
    earnedInPeriod: string;
  };
  custody: {
    providerBalances: Array<{ accountNumber: string; name: string; balance: string }>;
    operatingBalance: string;
    customerFloat: string;
    heldFloat: string;
  };
  destination: {
    configured: boolean;
    accountNumber: string | null;
    bankCode: string | null;
    bankName: string | null;
    accountName: string | null;
  };
  series: Array<{ date: string; amount: string }>;
  bySource: Array<{ source: string; amount: string; count: number }>;
};

type Sweep = {
  id: string;
  reference: string;
  currencyCode: string;
  amount: string;
  destinationBankName: string;
  destinationAccount: string;
  destinationName: string;
  status: string;
  approvalReference: string | null;
  failureReason: string | null;
  settledAt: string | null;
  createdAt: string;
};

/** Transaction types read as labels, not enum shouting. */
const SOURCE_LABELS: Record<string, string> = {
  DEPOSIT: "Wallet funding",
  WITHDRAWAL: "Withdrawals",
  TRANSFER: "Internal transfers",
  PAYMENT_LINK: "Payment links",
  FX_CONVERSION: "Currency conversion",
  INTERNATIONAL_TRANSFER: "Cross-border transfers",
  AJO_CONTRIBUTION: "Ajo contributions",
  AJO_PAYOUT: "Ajo payouts",
  SUBSCRIPTION: "Community subscriptions",
  MERCHANT_SETTLEMENT: "Merchant settlements",
  BILL_PAYMENT: "Bill payments",
  UNATTRIBUTED: "Unattributed",
};

const SOURCE_COLOURS = ["#059669", "#1F3770", "#B45309", "#7C3AED", "#0891B2", "#DB2777", "#64748B"];

export default function MoneyFlowPage() {
  const [days, setDays] = useState(30);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [sweeps, setSweeps] = useState<Sweep[]>([]);
  const [error, setError] = useState("");
  const [showSweep, setShowSweep] = useState(false);
  /** Bumped after a sweep, to refetch without threading a callback through. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([adminApi.revenueFlow(days), adminApi.revenueSweeps(1, 10)])
      .then(([flowResult, sweepResult]) => {
        if (!active) return;
        setFlow((flowResult as { data: Flow }).data);
        setSweeps((sweepResult as { data: { items: Sweep[] } }).data?.items ?? []);
        setError("");
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message || "Could not load the money flow.");
      });
    return () => {
      active = false;
    };
  }, [days, reloadKey]);

  if (!flow && !error) return <Skeleton />;
  if (error && !flow) {
    return (
      <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:m-8">
        Could not load the money flow: {error}
      </div>
    );
  }

  const f = flow!;
  const available = Number(f.totals.available);
  const series = f.series.map((point) => ({ date: point.date, amount: Number(point.amount) }));
  const sourceTotal = f.bySource.reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <div className="min-w-0 flex-1 bg-[#F8FAFC]">
      <main className="mx-auto max-w-[1240px] space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-[26px] font-bold tracking-[-0.035em] text-[#0F172A]">Money flow</h1>
            <p className="mt-1 text-xs text-[#64748B]">
              What the platform earned, where it is held, and what is payable to Rendi&rsquo;s own account
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="h-10 rounded-lg border border-[#E3E8F0] bg-white px-3 text-xs"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={() => setShowSweep(true)}
              disabled={!(available > 0) || !f.destination.configured}
              className="h-10 rounded-lg bg-[#1F3770] px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              title={
                !f.destination.configured
                  ? "No operating account is configured"
                  : available > 0
                    ? "Sweep earnings to the operating account"
                    : "Nothing available to sweep"
              }
            >
              Sweep earnings
            </button>
          </div>
        </section>

        {/* The four numbers that answer "how much of this is ours". Earned is
            cumulative because revenue is an income account; available is what
            is left after everything already swept and in flight. */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Available to sweep"
            value={formatCurrency(f.totals.available, f.currency)}
            hint="Earned, still sitting at the provider"
            accent
          />
          <Stat
            label={`Earned in ${f.periodDays} days`}
            value={formatCurrency(f.totals.earnedInPeriod, f.currency)}
            hint="Matches the chart below"
          />
          <Stat
            label="Earned all time"
            value={formatCurrency(f.totals.earnedAllTime, f.currency)}
            hint="Every fee ever recognised"
          />
          <Stat
            label="Swept all time"
            value={formatCurrency(f.totals.sweptAllTime, f.currency)}
            hint={
              Number(f.totals.pendingSweeps) > 0
                ? `${formatCurrency(f.totals.pendingSweeps, f.currency)} in flight`
                : "Moved to the operating account"
            }
          />
        </section>

        {!f.destination.configured && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            <b>No operating account is configured.</b> Set{" "}
            <code className="rounded bg-amber-100 px-1">PLATFORM_OPERATING_ACCOUNT</code> and{" "}
            <code className="rounded bg-amber-100 px-1">PLATFORM_OPERATING_BANK_CODE</code> on the
            API before earnings can be swept. Until then the figures above are reporting only.
          </div>
        )}

        <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <article className="rounded-xl border border-[#E3E8F0] bg-white">
            <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
              <h2 className="text-sm font-bold">Fee revenue, per day</h2>
              <p className="mt-0.5 text-[11px] text-[#64748B]">
                Posted credits to the platform revenue account — read from the ledger, so it agrees with the books
              </p>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <AreaTrend
                data={series}
                x="date"
                height={260}
                series={[{ key: "amount", name: "Fee revenue", color: "#059669" }]}
              />
            </div>
          </article>

          {/* Custody: the honest statement of whose money is in the provider
              account. A regulator asks this question in exactly this shape. */}
          <article className="rounded-xl border border-[#E3E8F0] bg-white p-4 sm:p-5">
            <h2 className="text-sm font-bold">Where the money sits</h2>
            <p className="mt-0.5 text-[11px] text-[#64748B]">
              The provider account holds both platform earnings and customer funds
            </p>
            <div className="mt-4 space-y-3">
              {f.custody.providerBalances.map((account) => (
                <Row key={account.accountNumber} label={account.name} value={formatCurrency(account.balance, f.currency)} />
              ))}
              <Row label="Rendi operating account" value={formatCurrency(f.custody.operatingBalance, f.currency)} />
              <div className="border-t border-slate-100 pt-3">
                <Row label="Customer wallet float" value={formatCurrency(f.custody.customerFloat, f.currency)} muted />
                <Row label="Held for pending payouts" value={formatCurrency(f.custody.heldFloat, f.currency)} muted />
              </div>
            </div>
            <p className="mt-4 text-[10px] leading-4 text-slate-500">
              Customer float is money Rendi is custodian of, never revenue. A sweep moves only the
              platform&rsquo;s own earned balance.
            </p>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <article className="rounded-xl border border-[#E3E8F0] bg-white p-4 sm:p-5">
            <h2 className="text-sm font-bold">What earned it</h2>
            <p className="mt-0.5 text-[11px] text-[#64748B]">
              Fee revenue by source over {f.periodDays} days
            </p>
            {f.bySource.length === 0 ? (
              <p className="mt-6 text-xs text-slate-500">No fee revenue posted in this period.</p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {f.bySource.map((row, index) => {
                  const amount = Number(row.amount);
                  const share = sourceTotal > 0 ? Math.round((amount / sourceTotal) * 100) : 0;
                  return (
                    <div key={row.source}>
                      <div className="flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-[#0F172A]">
                          {SOURCE_LABELS[row.source] ?? row.source}
                        </span>
                        <span className="tnum text-slate-600">
                          {formatCurrency(row.amount, f.currency)} · {share}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(1, share)}%`,
                            backgroundColor: SOURCE_COLOURS[index % SOURCE_COLOURS.length],
                          }}
                        />
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {row.count.toLocaleString()} posting{row.count === 1 ? "" : "s"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </article>

          <article className="rounded-xl border border-[#E3E8F0] bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold">Sweeps</h2>
                <p className="mt-0.5 text-[11px] text-[#64748B]">
                  {f.destination.configured
                    ? `To ${f.destination.bankName ?? f.destination.bankCode} ${f.destination.accountNumber}`
                    : "No destination configured"}
                </p>
              </div>
              <Link href="/approvals" className="text-[11px] font-semibold text-[#2563EB] hover:underline">
                Approvals →
              </Link>
            </div>
            {sweeps.length === 0 ? (
              <p className="mt-6 text-xs text-slate-500">
                No sweeps yet. Earnings stay at the provider until one is approved.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {sweeps.map((sweep) => (
                  <div key={sweep.id} className="flex items-center gap-3 border-b border-slate-100 pb-2 last:border-0">
                    <span className="min-w-0 flex-1">
                      <b className="block text-xs text-[#0F172A]">
                        {formatCurrency(sweep.amount, sweep.currencyCode)}
                      </b>
                      <small className="block truncate text-[10px] text-[#64748B]">
                        {new Date(sweep.createdAt).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}{" "}
                        · {sweep.destinationName}
                        {sweep.failureReason ? ` · ${sweep.failureReason}` : ""}
                      </small>
                    </span>
                    <StatusPill status={sweep.status} />
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </main>

      {showSweep && (
        <SweepDialog
          available={f.totals.available}
          currency={f.currency}
          destination={f.destination}
          onClose={() => setShowSweep(false)}
          onDone={() => {
            setShowSweep(false);
            setReloadKey((key) => key + 1);
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <article
      className={`rounded-xl border bg-white p-4 ${accent ? "border-emerald-300 ring-1 ring-emerald-100" : "border-[#E3E8F0]"}`}
    >
      <p className="text-[11px] text-[#475569]">{label}</p>
      <strong
        className={`mt-2 block text-[23px] leading-none tracking-[-0.03em] ${accent ? "text-emerald-700" : "text-[#0F172A]"}`}
      >
        {value}
      </strong>
      <p className="mt-3 text-[10px] text-[#64748B]">{hint}</p>
    </article>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className={muted ? "text-slate-500" : "font-semibold text-[#0F172A]"}>{label}</span>
      <span className={`tnum ${muted ? "text-slate-500" : "font-bold text-[#0F172A]"}`}>{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "SUCCESS"
      ? "bg-emerald-50 text-emerald-700"
      : status === "FAILED"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-800";
  return <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${tone}`}>{status}</span>;
}

/**
 * Requesting a sweep.
 *
 * The first submit is *expected* to fail with 428: maker-checker is on for
 * this action, so the dialog treats that as the success case it is — a
 * request was raised and a second administrator must now agree — rather than
 * showing it as an error.
 */
function SweepDialog({
  available,
  currency,
  destination,
  onClose,
  onDone,
}: {
  available: string;
  currency: string;
  destination: Flow["destination"];
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(available);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [raised, setRaised] = useState<string | null>(null);

  const numeric = Number(amount);
  const valid = numeric > 0 && numeric <= Number(available) && reason.trim().length >= 10;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await adminApi.requestRevenueSweep({
        amount: String(numeric),
        currencyCode: currency,
        reason: reason.trim(),
      });
      onDone();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "ADMIN_APPROVAL_REQUIRED") {
        setRaised(cause.message);
      } else {
        setError(cause instanceof Error ? cause.message : "The sweep could not be requested.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-[440px] rounded-2xl bg-white p-5 shadow-xl">
        {raised ? (
          <>
            <h2 className="text-base font-bold text-[#0F172A]">Waiting on a second approval</h2>
            <p className="mt-2 text-xs leading-5 text-[#475569]">{raised}</p>
            <p className="mt-3 text-xs leading-5 text-[#475569]">
              No money has moved. Another administrator approves it in{" "}
              <Link href="/approvals" className="font-semibold text-[#2563EB] hover:underline">
                Approvals
              </Link>
              , and the sweep runs then.
            </p>
            <button
              onClick={onDone}
              className="mt-5 h-10 w-full rounded-lg bg-[#1F3770] text-xs font-bold text-white"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <h2 className="text-base font-bold text-[#0F172A]">Sweep earnings</h2>
            <p className="mt-1 text-[11px] text-[#64748B]">
              To {destination.accountName ?? "the operating account"} ·{" "}
              {destination.bankName ?? destination.bankCode} {destination.accountNumber}
            </p>

            <label className="mt-4 block text-[11px] font-semibold text-[#475569]">
              Amount ({currency})
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="mt-1 h-10 w-full rounded-lg border border-[#E3E8F0] px-3 text-sm font-semibold text-[#0F172A]"
              />
            </label>
            <p className="mt-1 text-[10px] text-[#64748B]">
              {formatCurrency(available, currency)} available
              {numeric > Number(available) ? " — more than that cannot be swept" : ""}
            </p>

            <label className="mt-4 block text-[11px] font-semibold text-[#475569]">
              Reason for the approver
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="What this money is for — the approver judges this, not the amount alone."
                className="mt-1 w-full rounded-lg border border-[#E3E8F0] p-3 text-xs text-[#0F172A]"
              />
            </label>

            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={onClose}
                className="h-10 flex-1 rounded-lg border border-[#E3E8F0] text-xs font-bold text-[#475569]"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!valid || busy}
                className="h-10 flex-1 rounded-lg bg-[#1F3770] text-xs font-bold text-white disabled:bg-slate-300"
              >
                {busy ? "Requesting…" : "Request sweep"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="p-4 sm:p-8">
      <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl bg-slate-200" />
        ))}
      </div>
      <div className="mt-4 h-72 animate-pulse rounded-xl bg-slate-200" />
    </div>
  );
}
