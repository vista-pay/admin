"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  adminApi,
  type CommunityDashboard,
  type CommunityFilterOptions,
  type CommunityTrends,
} from "@/lib/api";
import { AreaTrend } from "@/components/admin/area-trend";
import { AdminSelect } from "@/components/ui/admin-select";
import { CommunityFilterRail, useCommunityFilters } from "@/components/community/filter-rail";

/**
 * The Community Dashboard.
 *
 * Every figure comes from live records, and every one of them respects the
 * filter rail: narrowing to Lagos cooperatives gives the member count,
 * contributions and overdue list *for Lagos cooperatives*, because the API
 * narrows the community set before it aggregates anything. A dashboard that
 * filtered the heading but not the numbers would be worse than no filter.
 */

const money = (value: string, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
const count = (value: number) => value.toLocaleString("en-NG");

/**
 * Collection rate over the chart's window.
 *
 * Dashes rather than 0% when nothing fell due: a rate needs a denominator,
 * and "0% collected" on a quiet week reads as a crisis that is not there.
 */
function windowRate(trends: CommunityTrends | null) {
  if (!trends) return "—";
  const expected = Number(trends.totals.expected);
  if (expected <= 0) return "—";
  return `${Math.round((Number(trends.totals.collected) / expected) * 100)}%`;
}

export default function CommunityDashboardPage() {
  const { filters, setFilters, options, setOptions } = useCommunityFilters();
  const [data, setData] = useState<CommunityDashboard | null>(null);
  const [trends, setTrends] = useState<CommunityTrends | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      Promise.all([
        adminApi.communityDashboard(filters),
        adminApi.communityFilterOptions(),
        // Same filters as the figures above it, so the curve is the curve
        // *for the set being looked at* rather than a platform-wide one with
        // a filtered heading.
        adminApi.communityTrends(filters, days),
      ])
        .then(([dashboard, opts, trend]: [{ data: CommunityDashboard }, { data: CommunityFilterOptions }, { data: CommunityTrends }]) => {
          setData(dashboard.data);
          setOptions(opts.data);
          setTrends(trend.data);
          setError("");
        })
        .catch((e: Error) => setError(e.message || "Could not load the community dashboard"))
        .finally(() => setLoading(false)),
    [filters, days, setOptions],
  );

  useEffect(() => { void load(); }, [load]);

  const c = data?.communities;
  const contributions = data?.contributions;
  const filtered = Object.values(filters).some(Boolean);

  return (
    <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-black tracking-tight">Community dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          {loading ? "Loading…" : `${count(c?.total ?? 0)} communities · ${count(data?.members.total ?? 0)} members`}
          {filtered && " · every figure below is for the filtered set"}
        </p>
      </header>

      <CommunityFilterRail filters={filters} onChange={setFilters} options={options} className="mt-5" />

      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Status split. Each tile links into the All Communities list already
          filtered to it, so a count is a way in rather than a dead end. */}
      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Active", value: c?.active, status: "VERIFIED", tone: "text-emerald-700" },
          { label: "Pending approval", value: c?.pendingApproval, status: "PENDING", tone: "text-amber-700" },
          { label: "Suspended", value: c?.suspended, status: "SUSPENDED", tone: "text-red-600" },
          { label: "Inactive", value: c?.inactive, status: "INACTIVE", tone: "text-slate-600" },
          { label: "Rejected", value: c?.rejected, status: "REJECTED", tone: "text-slate-600" },
        ].map((tile) => (
          <Link
            key={tile.label}
            href={`/community/all?status=${tile.status}`}
            className="rounded-2xl border bg-white p-4 transition hover:border-blue-400"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{tile.label}</p>
            <p className={`mt-1 text-2xl font-black ${tile.tone}`}>{count(tile.value ?? 0)}</p>
          </Link>
        ))}
      </section>

      {/* The same grammar as "How money moves" on the command center, and the
          same hand-rolled AreaTrend — two curves whose *gap* is the answer.
          Collected rising tells you nothing on its own; collected rising
          while expected rises faster is a cooperative falling behind. */}
      <section className="mt-5 rounded-2xl border bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold">How contributions are collected</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              What fell due against what was actually paid, per day — the gap between them is the shortfall
            </p>
          </div>
          <AdminSelect aria-label="Trend period" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} containerClassName="w-full sm:w-[150px]">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </AdminSelect>
        </div>
        <div className="grid gap-4 border-b border-slate-100 px-5 py-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Fell due</p>
            <p className="mt-1 text-xl font-bold text-[#1F3770]">{money(trends?.totals.expected ?? "0")}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Collected</p>
            <p className="mt-1 text-xl font-bold text-emerald-600">{money(trends?.totals.collected ?? "0")}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Collected on time</p>
            {/* Over this window, not all time — the headline rate above is
                lifetime, and the two must not be mistaken for each other. */}
            <p className="mt-1 text-xl font-bold text-slate-900">{windowRate(trends)}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {trends ? `${trends.totals.registrations} new ${trends.totals.registrations === 1 ? "community" : "communities"} in ${trends.periodDays} days` : ""}
            </p>
          </div>
        </div>
        <div className="px-5 py-4">
          <AreaTrend
            data={trends?.series ?? []}
            x="date"
            height={250}
            series={[
              { key: "expectedNgn", name: "Fell due", color: "#1F3770" },
              { key: "collectedNgn", name: "Collected", color: "#059669" },
            ]}
          />
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {/* Contributions. Expected and actual sit beside each other because
              neither means anything alone — a collected total cannot answer
              "is this cooperative healthy", which is what the section is for. */}
          <section className="rounded-2xl border bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Contributions & savings</h2>
              {contributions?.collectionRate !== null && contributions !== undefined && (
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${contributions.collectionRate! >= 90 ? "bg-emerald-50 text-emerald-700" : contributions.collectionRate! >= 70 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"}`}>
                  {contributions.collectionRate}% collected
                </span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Expected", money(contributions?.expected ?? "0")],
                ["Actual", money(contributions?.actual ?? "0")],
                ["Shortfall", money(contributions?.shortfall ?? "0")],
                ["Savings held", money(data?.savings.balance ?? "0")],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-black">{value}</p>
                </div>
              ))}
            </div>
            {contributions?.collectionRate === null && (
              <p className="mt-3 text-xs leading-5 text-slate-500">
                No contribution obligations have fallen due in this set, so there is no collection rate to report — not 0%.
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              {count(contributions?.payments ?? 0)} payments · {count(data?.savings.accounts ?? 0)} savings accounts
            </p>
          </section>

          <section className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border bg-white p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Ajo</h2>
              <p className="mt-3 text-3xl font-black">{count(data?.ajo.activeGroups ?? 0)}</p>
              <p className="text-xs text-slate-500">active groups</p>
              <p className="mt-3 text-sm font-bold">{count(data?.ajo.ongoingCycles ?? 0)} ongoing cycles</p>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Loans</h2>
              <p className="mt-3 text-3xl font-black">{money(data?.loans.outstanding ?? "0")}</p>
              <p className="text-xs text-slate-500">outstanding across {count(data?.loans.running ?? 0)} running loans</p>
              {(data?.loans.overdue ?? 0) > 0 && (
                <p className="mt-3 text-sm font-bold text-red-600">{count(data!.loans.overdue)} overdue</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">New registrations</h2>
            <div className="mt-4 grid grid-cols-3 gap-4">
              {[
                ["Today", data?.registrations.today],
                ["Last 7 days", data?.registrations.last7Days],
                ["Last 30 days", data?.registrations.last30Days],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-black">{count((value as number) ?? 0)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Needs attention</h2>
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ["Communities awaiting approval", c?.pendingApproval ?? 0, "/communities"],
                ["Open complaints", data?.support.openComplaints ?? 0, "/disputes"],
                ["Contribution & payout disputes", data?.support.openDisputes ?? 0, "/disputes"],
                ["Overdue loans", data?.loans.overdue ?? 0, null],
              ].map(([label, value, href]) => (
                <div key={String(label)} className="flex items-center justify-between gap-3">
                  <dt className="min-w-0 text-slate-600">{label}</dt>
                  <dd className="shrink-0 font-black">
                    {href && (value as number) > 0 ? (
                      <Link href={href as string} className="text-blue-600 underline">{count(value as number)}</Link>
                    ) : (
                      count(value as number)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* The brief's "communities with overdue contributions" list.
              Named, sorted by what they owe, and linked — a count of
              defaulting communities nobody can click is not actionable. */}
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Overdue contributions</h2>
            {data?.attention.overdueContributions.length ? (
              <>
                <div className="mt-3 space-y-3">
                  {data.attention.overdueContributions.map((row) => (
                    <Link key={row.id} href={`/community/${row.id}?tab=contributions`} className="block">
                      <p className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate font-bold">{row.name}</span>
                        <span className="shrink-0 font-black text-red-600">{money(row.shortfall)}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.publicId} · {row.overdueCount} overdue {row.overdueCount === 1 ? "obligation" : "obligations"}
                        {[row.lga, row.state].filter(Boolean).length ? ` · ${[row.lga, row.state].filter(Boolean).join(", ")}` : ""}
                      </p>
                    </Link>
                  ))}
                </div>
                {data.attention.overdueContributions[0]?.capped && (
                  <p className="mt-3 text-xs leading-5 text-amber-700">
                    Capped at the first 5,000 overdue obligations, so these figures are a floor rather than a total.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                {loading ? "Loading…" : "No community in this set is behind on contributions."}
              </p>
            )}
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Subscription revenue</h2>
            <p className="mt-3 text-2xl font-black">{money(data?.revenue.subscriptionsPaid ?? "0")}</p>
            <p className="text-xs text-slate-500">paid invoices from this set</p>
            <Link href="/subscription-revenue" className="mt-3 inline-block text-xs font-bold text-blue-600">
              Revenue breakdown →
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
