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
  destinations: {
    items: Destination[];
    /** Only present while nothing is registered — the env-var fallback. */
    fromConfiguration: {
      label: string;
      accountNumber: string;
      bankCode: string;
      bankName: string | null;
      accountName: string | null;
    } | null;
  };
  series: Array<{ date: string; amount: string }>;
  bySource: Array<{ source: string; amount: string; count: number }>;
};

type Bank = { bankName: string; bankCode: string; initials?: string };

type Destination = {
  id: string;
  label: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  currencyCode: string;
  isDefault: boolean;
  isActive: boolean;
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
  const [showDestination, setShowDestination] = useState(false);
  /** Bumped after a change, to refetch without threading a callback through. */
  const [reloadKey, setReloadKey] = useState(0);

  const reload = () => setReloadKey((key) => key + 1);

  async function retire(id: string) {
    try {
      await adminApi.retirePayoutDestination(id);
      reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not retire that account.");
    }
  }

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
  const active = f.destinations.items.filter((item) => item.isActive);
  const canSweep = active.length > 0 || Boolean(f.destinations.fromConfiguration);
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
              disabled={!(available > 0) || !canSweep}
              className="h-10 rounded-lg bg-[#1F3770] px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              title={
                !canSweep
                  ? "No payout destination is registered"
                  : available > 0
                    ? "Withdraw earnings to a registered account"
                    : "Nothing available to withdraw"
              }
            >
              Withdraw earnings
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

        {!canSweep && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            <b>No payout destination is registered.</b> Add the bank account Rendi&rsquo;s earnings
            should be paid into — below. Until then the figures above are reporting only.
          </div>
        )}

        {f.destinations.fromConfiguration && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-[#475569]">
            Using the account from environment configuration —{" "}
            <b>
              {f.destinations.fromConfiguration.bankName ?? f.destinations.fromConfiguration.bankCode}{" "}
              {f.destinations.fromConfiguration.accountNumber}
            </b>
            . Register it properly below so the destination carries an approval trail instead of
            depending on a redeploy to change.
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
                <h2 className="text-sm font-bold">Withdrawals</h2>
                <p className="mt-0.5 text-[11px] text-[#64748B]">
                  {active.length > 0
                    ? `${active.length} registered account${active.length === 1 ? "" : "s"}`
                    : "No registered account"}
                </p>
              </div>
              <Link href="/approvals" className="text-[11px] font-semibold text-[#2563EB] hover:underline">
                Approvals →
              </Link>
            </div>
            {/* The accounts money may go to. Listed here rather than on a
                settings page because "where can this money go" is the same
                question as "where did it go". */}
            <div className="mt-4 space-y-2">
              {f.destinations.items.map((destination) => (
                <div
                  key={destination.id}
                  className={`rounded-lg border p-2.5 ${destination.isActive ? "border-slate-200" : "border-slate-100 bg-slate-50 opacity-60"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
                        {destination.label}
                        {destination.isDefault && destination.isActive && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
                            DEFAULT
                          </span>
                        )}
                        {!destination.isActive && (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                            RETIRED
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[10px] text-[#64748B]">
                        {destination.bankName} · {destination.accountNumber} ·{" "}
                        {destination.accountName}
                      </p>
                    </div>
                    {destination.isActive && (
                      <button
                        onClick={() => void retire(destination.id)}
                        className="shrink-0 text-[10px] font-semibold text-slate-400 hover:text-red-600"
                        title="Retire this account — past withdrawals keep naming it"
                      >
                        Retire
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                onClick={() => setShowDestination(true)}
                className="h-9 w-full rounded-lg border border-dashed border-slate-300 text-[11px] font-semibold text-[#475569] hover:border-slate-400 hover:bg-slate-50"
              >
                + Register a bank account
              </button>
            </div>

            <h3 className="mt-5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              History
            </h3>
            {sweeps.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                No withdrawals yet. Earnings stay at the provider until one is approved.
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
          destinations={active}
          fallback={f.destinations.fromConfiguration}
          onClose={() => setShowSweep(false)}
          onDone={() => {
            setShowSweep(false);
            reload();
          }}
        />
      )}

      {showDestination && (
        <DestinationDialog
          currency={f.currency}
          onClose={() => setShowDestination(false)}
          onDone={() => {
            setShowDestination(false);
            reload();
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
  destinations,
  fallback,
  onClose,
  onDone,
}: {
  available: string;
  currency: string;
  destinations: Destination[];
  fallback: Flow["destinations"]["fromConfiguration"];
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(available);
  const [reason, setReason] = useState("");
  const [destinationId, setDestinationId] = useState(
    destinations.find((item) => item.isDefault)?.id ?? destinations[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [raised, setRaised] = useState<string | null>(null);

  const numeric = Number(amount);
  const chosen = destinations.find((item) => item.id === destinationId);
  const valid = numeric > 0 && numeric <= Number(available) && reason.trim().length >= 10;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await adminApi.requestRevenueSweep({
        amount: String(numeric),
        currencyCode: currency,
        reason: reason.trim(),
        // Omitted when falling back to configuration — the API resolves it.
        ...(destinationId ? { destinationId } : {}),
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
            <h2 className="text-base font-bold text-[#0F172A]">Withdraw earnings</h2>
            <p className="mt-1 text-[11px] text-[#64748B]">
              Paid by bank transfer out of the provider settlement account
            </p>

            {destinations.length > 0 ? (
              <label className="mt-4 block text-[11px] font-semibold text-[#475569]">
                To account
                <select
                  value={destinationId}
                  onChange={(event) => setDestinationId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#E3E8F0] px-3 text-xs text-[#0F172A]"
                >
                  {destinations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} — {item.bankName} {item.accountNumber}
                    </option>
                  ))}
                </select>
                {chosen && (
                  <span className="mt-1 block text-[10px] font-normal text-[#64748B]">
                    {chosen.accountName}
                  </span>
                )}
              </label>
            ) : (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-[#475569]">
                To {fallback?.bankName ?? fallback?.bankCode} {fallback?.accountNumber} — from
                environment configuration.
              </p>
            )}

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
                {busy ? "Requesting…" : "Request withdrawal"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Registering an account earnings may be paid to.
 *
 * No account-name field on purpose: the name comes from the bank when the
 * API resolves the number, so a convincing label cannot sit over the wrong
 * account. Like the withdrawal itself, the first submit is expected to 428 —
 * a destination authorises every future withdrawal, not just one.
 */
function DestinationDialog({
  currency,
  onClose,
  onDone,
}: {
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [label, setLabel] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [reason, setReason] = useState("");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [resolved, setResolved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [raised, setRaised] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    adminApi
      .payoutBanks()
      .then((result) => {
        if (active) setBanks(((result as { data: Bank[] }).data ?? []));
      })
      .catch(() => {
        if (active) setError("Could not load the bank list. Try again shortly.");
      });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Resolve as soon as there is something to resolve.
   *
   * The name is the actual check on this form — a label and a number prove
   * nothing, and seeing "RENDI TECHNOLOGIES LTD" before pressing register is
   * what catches a transposed digit.
   */
  // Cleared by the inputs themselves rather than here, so the effect only
  // ever fetches — editing either field invalidates a resolved name.
  useEffect(() => {
    if (!/^\d{10}$/.test(accountNumber) || !bankCode) return;
    let active = true;
    adminApi
      .resolvePayoutAccount({ accountNumber, bankCode })
      .then((result) => {
        if (!active) return;
        setResolved((result as { data: { accountName: string } }).data?.accountName ?? null);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message || "That account could not be verified.");
      });
    return () => {
      active = false;
    };
  }, [accountNumber, bankCode]);

  /** Derived rather than held: the inputs already say whether a lookup is owed. */
  const complete = /^\d{10}$/.test(accountNumber) && Boolean(bankCode);
  const checking = complete && !resolved && !error;

  // No resolved name means no registration: the whole point is that the bank
  // confirms the account before it can ever receive money.
  const valid = label.trim().length >= 3 && Boolean(resolved) && reason.trim().length >= 10;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await adminApi.addPayoutDestination({
        label: label.trim(),
        accountNumber,
        bankCode,
        currencyCode: currency,
        reason: reason.trim(),
      });
      onDone();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "ADMIN_APPROVAL_REQUIRED") {
        setRaised(cause.message);
      } else {
        setError(cause instanceof Error ? cause.message : "That account could not be registered.");
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
              The account is not registered yet, and nothing can be paid to it until another
              administrator approves it in{" "}
              <Link href="/approvals" className="font-semibold text-[#2563EB] hover:underline">
                Approvals
              </Link>
              .
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
            <h2 className="text-base font-bold text-[#0F172A]">Register a bank account</h2>
            <p className="mt-1 text-[11px] text-[#64748B]">
              Pick the bank and enter the number — the name comes from the bank itself
            </p>

            <label className="mt-4 block text-[11px] font-semibold text-[#475569]">
              Label
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Operations account"
                className="mt-1 h-10 w-full rounded-lg border border-[#E3E8F0] px-3 text-sm text-[#0F172A]"
              />
            </label>

            <label className="mt-3 block text-[11px] font-semibold text-[#475569]">
              Bank
              <select
                value={bankCode}
                onChange={(event) => {
                  setBankCode(event.target.value);
                  setResolved(null);
                  setError("");
                }}
                disabled={banks.length === 0}
                className="mt-1 h-10 w-full rounded-lg border border-[#E3E8F0] px-3 text-sm text-[#0F172A] disabled:bg-slate-50"
              >
                <option value="">
                  {banks.length === 0 ? "Loading banks…" : "Choose a bank"}
                </option>
                {banks.map((bank) => (
                  <option key={`${bank.bankCode}-${bank.bankName}`} value={bank.bankCode}>
                    {bank.bankName}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-[11px] font-semibold text-[#475569]">
              Account number
              <input
                value={accountNumber}
                onChange={(event) => {
                  setAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 10));
                  setResolved(null);
                  setError("");
                }}
                inputMode="numeric"
                placeholder="0045434120"
                className="mt-1 h-10 w-full rounded-lg border border-[#E3E8F0] px-3 text-sm text-[#0F172A]"
              />
            </label>

            {/* The verification, shown before the operator can commit. */}
            <div className="mt-2 min-h-[32px]">
              {checking && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-[#64748B]">
                  Checking with the bank…
                </p>
              )}
              {resolved && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800">
                  ✓ {resolved}
                </p>
              )}
            </div>

            <label className="mt-3 block text-[11px] font-semibold text-[#475569]">
              Reason for the approver
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="Whose account this is and why earnings should go there."
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
                {busy ? "Registering…" : "Register account"}
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
