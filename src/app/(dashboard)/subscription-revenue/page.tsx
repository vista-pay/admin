"use client";

/**
 * What community subscriptions actually bring in: MRR off the live
 * subscriptions, what was collected and what is still open per month and per
 * community. Sourced from subscription invoices — the same rows the ledger's
 * revenue postings hang off.
 */

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import { AdminSelect } from "@/components/ui/admin-select";

type Revenue = {
  since: string;
  currencyCode: string;
  totals: {
    collected: string;
    outstanding: string;
    invoices: number;
    activeSubscriptions: number;
    mrr: string;
  };
  months: Array<{ month: string; collected: string; invoiced: string }>;
  communities: Array<{
    communityId: string;
    name: string;
    slug: string;
    planCode: string;
    planName: string;
    paidTotal: string;
    openTotal: string;
    invoiceCount: number;
    lastPaidAt: string | null;
    currencyCode: string;
  }>;
};

const money = (value: string, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—");
const monthLabel = (ym: string) => {
  const [year, month] = ym.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1)).toLocaleDateString("en-NG", { month: "short", year: "2-digit" });
};

export default function SubscriptionRevenuePage() {
  const [data, setData] = useState<Revenue | null>(null);
  const [months, setMonths] = useState(12);
  const [error, setError] = useState("");
  const [monthView, setMonthView] = useState<"chart" | "table">("chart");

  const load = useCallback(async () => {
    try {
      const response = await adminApi.subscriptionRevenue(months);
      setData(response.data as Revenue);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load revenue");
    }
  }, [months]);

  useEffect(() => {
    // Every setState here runs after the fetch settles, not during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const currency = data?.currencyCode ?? "NGN";

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Subscription revenue</h1>
          <p className="mt-1 text-sm text-slate-600">
            Collected and outstanding subscription invoices, per community and per month.
          </p>
        </div>
        <AdminSelect value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </AdminSelect>
      </header>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {data && (
        <>
          <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ["MRR", money(data.totals.mrr, currency), "Live subscriptions, normalised to a month"],
              ["Collected", money(data.totals.collected, currency), `Paid invoices since ${day(data.since)}`],
              ["Outstanding", money(data.totals.outstanding, currency), "Open invoices awaiting wallet balance"],
              ["Active subscriptions", String(data.totals.activeSubscriptions), "Trialing, active, past-due or in grace"],
              ["Invoices", String(data.totals.invoices), "Issued in the period"],
            ].map(([label, value, hint]) => (
              <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-black">{value}</p>
                <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
              </article>
            ))}
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">Invoiced vs collected, by month</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  The gap between the pair is that month&rsquo;s unpaid amount.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#38BDF8]" /> Invoiced
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#1D4ED8]" /> Collected
                </span>
                <div className="ml-1 flex overflow-hidden rounded-lg border border-slate-200 text-[11px] font-bold">
                  <button
                    onClick={() => setMonthView("chart")}
                    className={`px-2.5 py-1 ${monthView === "chart" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    Chart
                  </button>
                  <button
                    onClick={() => setMonthView("table")}
                    className={`px-2.5 py-1 ${monthView === "table" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    Table
                  </button>
                </div>
              </div>
            </div>
            {data.months.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No subscription invoices in this period yet.</p>
            ) : monthView === "chart" ? (
              <MonthlyRevenueChart months={data.months} currency={currency} />
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Month</th>
                      <th className="px-3 py-2 text-right">Invoiced</th>
                      <th className="px-3 py-2 text-right">Collected</th>
                      <th className="px-3 py-2 text-right">Unpaid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((m) => {
                      const unpaid = Number(m.invoiced) - Number(m.collected);
                      return (
                        <tr key={m.month} className="border-b border-slate-50">
                          <td className="px-3 py-2 font-semibold">{monthLabel(m.month)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(m.invoiced, currency)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(m.collected, currency)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${unpaid > 0 ? "font-semibold text-amber-700" : "text-slate-400"}`}>
                            {unpaid > 0 ? money(String(unpaid), currency) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Community</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Collected</th>
                  <th className="px-4 py-3">Outstanding</th>
                  <th className="px-4 py-3">Invoices</th>
                  <th className="px-4 py-3">Last paid</th>
                </tr>
              </thead>
              <tbody>
                {data.communities.map((row) => (
                  <tr key={row.communityId} className="border-b border-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.slug}</p>
                    </td>
                    <td className="px-4 py-3">{row.planName}</td>
                    <td className="px-4 py-3 font-semibold">{money(row.paidTotal, row.currencyCode)}</td>
                    <td className="px-4 py-3">{Number(row.openTotal) > 0 ? <span className="font-semibold text-amber-700">{money(row.openTotal, row.currencyCode)}</span> : "—"}</td>
                    <td className="px-4 py-3">{row.invoiceCount}</td>
                    <td className="px-4 py-3">{day(row.lastPaidAt)}</td>
                  </tr>
                ))}
                {data.communities.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">No invoices yet — revenue appears after the first billed period.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}

/**
 * Grouped monthly bars: invoiced (sky) beside collected (blue), one pair per
 * month, so the gap inside a pair is exactly that month's unpaid amount.
 *
 * The pair #1D4ED8/#38BDF8 is validated against the light surface for CVD
 * separation and chroma; the sky step's low surface contrast is relieved by
 * the table view behind the Chart/Table toggle, per the dataviz checks.
 */
function MonthlyRevenueChart({
  months,
  currency,
}: {
  months: Array<{ month: string; collected: string; invoiced: string }>;
  currency: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const COLLECTED = "#1D4ED8";
  const INVOICED = "#38BDF8";
  const PAD_L = 56;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 28;
  const SLOT = Math.max(44, Math.min(72, Math.floor(960 / Math.max(1, months.length))));
  const BAR = Math.min(16, Math.floor((SLOT - 14) / 2));
  const H = 240;
  const plotH = H - PAD_T - PAD_B;
  const W = PAD_L + months.length * SLOT + PAD_R;

  const peak = Math.max(1, ...months.map((m) => Math.max(Number(m.invoiced), Number(m.collected))));
  // A rounded ceiling so the top gridline is a readable number, not the peak.
  // The ladder is fine-grained so the tallest bar fills most of the plot
  // instead of stranding the data in the bottom half.
  const ceiling = (() => {
    const pow = 10 ** Math.floor(Math.log10(peak));
    const unit = peak / pow;
    const step = [1, 1.2, 1.5, 2, 2.4, 3, 4, 5, 6, 8, 10].find((s) => unit <= s) ?? 10;
    return step * pow;
  })();
  const y = (value: number) => PAD_T + plotH * (1 - value / ceiling);

  const compact = (value: number) =>
    value >= 1_000_000
      ? `₦${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`
      : value >= 1_000
        ? `₦${(value / 1_000).toFixed(value % 1_000 ? 1 : 0)}k`
        : `₦${value}`;
  const ticks = [0.25, 0.5, 0.75, 1].map((f) => f * ceiling);
  const hovered = hover !== null ? months[hover] : null;

  return (
    <div className="relative mt-3 overflow-x-auto">
      <svg width={W} height={H} role="img" aria-label="Monthly subscription revenue, invoiced beside collected">
        {/* Baseline-anchored rounding: bars extend 4px below the clip so only
            their top corners read as rounded. */}
        <defs>
          <clipPath id="rev-plot">
            <rect x={0} y={0} width={W} height={H - PAD_B} />
          </clipPath>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(tick)} y2={y(tick)} stroke="#EEF2F7" strokeWidth={1} />
            <text x={PAD_L - 8} y={y(tick) + 3.5} textAnchor="end" className="fill-slate-400 text-[10px] font-medium">
              {compact(tick)}
            </text>
          </g>
        ))}
        <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke="#CBD5E1" strokeWidth={1} />

        {months.map((m, index) => {
          const cx = PAD_L + index * SLOT + SLOT / 2;
          const invoiced = Number(m.invoiced);
          const collected = Number(m.collected);
          const dim = hover !== null && hover !== index;
          // Label every slot while they are wide enough; every other after.
          const showLabel = SLOT >= 48 || index % 2 === 0;
          return (
            <g key={m.month} opacity={dim ? 0.45 : 1}>
              {hover === index && (
                <rect x={cx - SLOT / 2 + 2} y={PAD_T} width={SLOT - 4} height={plotH} rx={6} fill="#F1F5F9" />
              )}
              <g clipPath="url(#rev-plot)">
                {/* 2px surface gap between the pair, 4px rounded data-ends. */}
                <rect x={cx - BAR - 1} y={y(invoiced)} width={BAR} height={plotH - (y(invoiced) - PAD_T) + 4} rx={4} fill={INVOICED} />
                <rect x={cx + 1} y={y(collected)} width={BAR} height={plotH - (y(collected) - PAD_T) + 4} rx={4} fill={COLLECTED} />
              </g>
              {showLabel && (
                <text x={cx} y={H - PAD_B + 16} textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold">
                  {monthLabel(m.month)}
                </text>
              )}
              {/* The hit target is the whole month column, not the thin bars. */}
              <rect
                x={cx - SLOT / 2}
                y={PAD_T}
                width={SLOT}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-[190px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
          style={{
            left: Math.min(Math.max(PAD_L + hover * SLOT + SLOT / 2 - 95, 4), W - 194),
          }}
        >
          <p className="text-[11px] font-bold text-slate-900">{monthLabel(hovered.month)}</p>
          <div className="mt-1.5 space-y-1 text-[11px]">
            <p className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 rounded-sm" style={{ background: INVOICED }} /> Invoiced
              </span>
              <span className="font-bold tabular-nums text-slate-900">{money(hovered.invoiced, currency)}</span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 rounded-sm" style={{ background: COLLECTED }} /> Collected
              </span>
              <span className="font-bold tabular-nums text-slate-900">{money(hovered.collected, currency)}</span>
            </p>
            <p className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1">
              <span className="text-slate-500">Unpaid</span>
              <span className={`font-bold tabular-nums ${Number(hovered.invoiced) - Number(hovered.collected) > 0 ? "text-amber-700" : "text-slate-400"}`}>
                {Number(hovered.invoiced) - Number(hovered.collected) > 0
                  ? money(String(Number(hovered.invoiced) - Number(hovered.collected)), currency)
                  : "—"}
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
