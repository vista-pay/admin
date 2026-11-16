"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

/**
 * Growth analytics, every figure from live records.
 *
 * The page mirrors the backend's definitions exactly — activated means first
 * deposit within 7 days, D30 retention is measured on the 30–60 day cohort —
 * and the users table at the bottom is the same population the figures count,
 * so a number can always be opened up into the people behind it.
 */

type Kpis = {
  signups: { value: number; previous: number; deltaPct: number | null };
  activated: { rate: number; previousRate: number; count: number };
  d30Retention: { rate: number; previousRate: number; cohortSize: number };
  ajoAdoption: { rate: number; mau: number; count: number };
  blendedCac: { amountNgn: number; rewardsPaidNgn: number; note: string };
};

type Growth = {
  periodDays: number;
  totals: { signups: number; activeUsers: number; approvedKyc: number; referralSignups: number };
  series: Array<{ date: string; signups: number; activeUsers: number; volumeNgn: number }>;
  kpis: Kpis;
  funnel: Array<{ stage: string; count: number; pctOfPrevious: number }>;
  biggestDrop: { from: string; to: string; dropPct: number } | null;
  cohorts: Array<{ cohort: string; size: number; retention: number[] }>;
  channelTable: Array<{
    channel: string;
    label: string;
    signups: number;
    activationRate: number;
    cacNgn: number;
    d30RetentionRate: number;
    ajoAdoptionRate: number;
    trend: number[];
  }>;
};

type GrowthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  state: string | null;
  status: string;
  signedUpAt: string;
  channel: "REFERRAL" | "COMMUNITY" | "ORGANIC";
  kycTier: string;
  kycStatus: string;
  phoneVerified: boolean;
  firstMoneyInAt: string | null;
  activated: boolean;
  inAjo: boolean;
  lastActiveAt: string | null;
};

type GrowthUsers = { total: number; page: number; limit: number; users: GrowthUser[] };

const CHANNEL_LABEL: Record<string, string> = {
  REFERRAL: "Referral",
  COMMUNITY: "Community",
  ORGANIC: "Organic",
};

function DeltaChip({ delta, suffix = "%" }: { delta: number | null; suffix?: string }) {
  if (delta === null) return <span className="text-xs text-slate-400">no previous period</span>;
  const up = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
        up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(delta)}
      {suffix}
    </span>
  );
}

function Sparkline({ points, className = "" }: { points: number[]; className?: string }) {
  if (points.length < 2) return <span className="text-xs text-slate-400">—</span>;
  const max = Math.max(1, ...points);
  const min = Math.min(...points);
  const range = Math.max(1, max - min);
  const path = points
    .map((value, index) => `${(index / (points.length - 1)) * 100},${28 - ((value - min) / range) * 24}`)
    .join(" ");
  const falling = points[points.length - 1] < points[0];
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={`h-7 w-24 ${className}`}>
      <polyline
        points={path}
        fill="none"
        stroke={falling ? "#EF4444" : "#2563EB"}
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Page() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Growth | null>(null);
  const [error, setError] = useState("");

  // Users drill-down state. The filters mirror the analytics definitions.
  const [channel, setChannel] = useState("ALL");
  const [stage, setStage] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [userRows, setUserRows] = useState<GrowthUsers | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    setData(null);
    adminApi
      .growth(days)
      .then((r) => setData(r.data as Growth))
      .catch((e: Error) => setError(e.message));
  }, [days]);

  useEffect(() => {
    setUsersLoading(true);
    const handle = setTimeout(() => {
      adminApi
        .growthUsers({ days, channel, stage, search: search || undefined, page, limit: 25 })
        .then((r) => setUserRows(r.data as GrowthUsers))
        .catch((e: Error) => setError(e.message))
        .finally(() => setUsersLoading(false));
    }, search ? 400 : 0);
    return () => clearTimeout(handle);
  }, [days, channel, stage, search, page]);

  const kpiCards = useMemo(() => {
    if (!data?.kpis) return [];
    const k = data.kpis;
    return [
      {
        label: "New sign-ups",
        value: k.signups.value.toLocaleString(),
        delta: k.signups.deltaPct,
        suffix: "%",
        hint: `vs previous ${data.periodDays} days`,
      },
      {
        label: "Activated (money in ≤ 7d)",
        value: `${k.activated.rate}%`,
        delta: k.activated.previousRate ? Number((k.activated.rate - k.activated.previousRate).toFixed(1)) : null,
        suffix: " pts",
        hint: `${k.activated.count.toLocaleString()} users`,
      },
      {
        label: "D30 retention",
        value: `${k.d30Retention.rate}%`,
        delta: k.d30Retention.previousRate ? Number((k.d30Retention.rate - k.d30Retention.previousRate).toFixed(1)) : null,
        suffix: " pts",
        hint: `cohort of ${k.d30Retention.cohortSize.toLocaleString()} (signed up 30–60d ago)`,
      },
      {
        label: "Ajo adoption (of MAU)",
        value: `${k.ajoAdoption.rate}%`,
        delta: null,
        suffix: "",
        hint: `${k.ajoAdoption.count.toLocaleString()} of ${k.ajoAdoption.mau.toLocaleString()} active users`,
      },
      {
        label: "Blended CAC",
        value: `₦${k.blendedCac.amountNgn.toLocaleString()}`,
        delta: null,
        suffix: "",
        hint: k.blendedCac.note,
      },
    ];
  }, [data]);

  const maxFunnel = Math.max(1, ...(data?.funnel.map((f) => f.count) ?? [1]));
  const monthLabel = (cohort: string) =>
    new Date(`${cohort}-01T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" });
  const maxCohortMonths = Math.max(0, ...(data?.cohorts.map((c) => c.retention.length) ?? [0]));

  return (
    <div className="min-w-0 flex-1 bg-[#F8FAFC]">
      <header className="border-b border-[#E3E8F0] bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Growth analytics</h1>
            <p className="mt-1 text-xs text-slate-500">
              Acquisition, activation, retention and Ajo adoption — every figure computed from live platform records.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Period:
            <select
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value));
                setPage(1);
              }}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
            </select>
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] space-y-4 p-4 sm:p-8">
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {!data ? (
          <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
        ) : (
          <>
            {/* ── KPI cards ── */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {kpiCards.map((card) => (
                <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">{card.label}</p>
                  <strong className="mt-2 block text-2xl tracking-tight">{card.value}</strong>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                    {card.delta !== null && <DeltaChip delta={card.delta} suffix={card.suffix} />}
                    <span className="truncate" title={card.hint}>
                      {card.hint}
                    </span>
                  </div>
                </article>
              ))}
            </section>

            <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
              {/* ── Activation funnel ── */}
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-bold">Activation funnel</h2>
                  {data.biggestDrop && data.biggestDrop.dropPct > 0 && (
                    <p className="text-xs font-semibold text-amber-600">
                      Biggest drop: {data.biggestDrop.from} → {data.biggestDrop.to} ({data.biggestDrop.dropPct}%)
                    </p>
                  )}
                </div>
                <div className="mt-4 space-y-4">
                  {data.funnel.map((step, index) => (
                    <div key={step.stage}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-medium text-slate-700">{step.stage}</span>
                        <span className="tabular-nums text-slate-500">
                          <b className="text-slate-900">{step.count.toLocaleString()}</b>
                          {index > 0 && <> · {step.pctOfPrevious}%</>}
                        </span>
                      </div>
                      <div className="mt-1.5 h-5 rounded bg-slate-100">
                        <div
                          className={`h-5 rounded ${index === 0 ? "bg-[#012A9D]" : index < 3 ? "bg-blue-500" : index === 3 ? "bg-amber-400" : "bg-blue-300"}`}
                          style={{ width: `${Math.max(2, (step.count / maxFunnel) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] leading-4 text-slate-400">
                  Over this period&rsquo;s sign-ups. &ldquo;Active in month 2&rdquo; is measured on sign-ups old enough to
                  have reached it.
                </p>
              </article>

              {/* ── Cohort retention matrix ── */}
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-bold">Cohort retention (monthly)</h2>
                  <span className="text-xs text-slate-400">% with a successful transaction</span>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="pb-2 pr-3 font-medium">Cohort</th>
                        {Array.from({ length: maxCohortMonths }, (_, index) => (
                          <th key={index} className="pb-2 pr-1 text-center font-medium">
                            M{index}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.cohorts.map((cohort) => (
                        <tr key={cohort.cohort}>
                          <td className="py-1 pr-3 font-semibold text-slate-700">
                            {monthLabel(cohort.cohort)}
                            <span className="ml-1 font-normal text-slate-400">({cohort.size.toLocaleString()})</span>
                          </td>
                          {Array.from({ length: maxCohortMonths }, (_, index) => {
                            const value = cohort.retention[index];
                            if (value === undefined)
                              return <td key={index} className="p-0.5"><div className="h-8 rounded-md bg-slate-50" /></td>;
                            const strong = value >= 60 || index === 0;
                            return (
                              <td key={index} className="p-0.5">
                                <div
                                  className={`flex h-8 min-w-[52px] items-center justify-center rounded-md text-[11px] font-bold tabular-nums ${
                                    index === 0
                                      ? "bg-[#012A9D] text-white"
                                      : strong
                                        ? "bg-blue-400 text-white"
                                        : value >= 40
                                          ? "bg-blue-100 text-blue-900"
                                          : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {value}%
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            {/* ── Acquisition channels ── */}
            <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-baseline justify-between border-b border-slate-100 p-4">
                <h2 className="text-sm font-bold">Acquisition channels</h2>
                <span className="text-xs text-slate-400">
                  Attribution the data supports: referral records, community onboarding, organic
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="p-3 font-semibold">Channel</th>
                      <th className="p-3 font-semibold">Sign-ups</th>
                      <th className="p-3 font-semibold">Activation</th>
                      <th className="p-3 font-semibold">CAC</th>
                      <th className="p-3 font-semibold">D30 retention</th>
                      <th className="p-3 font-semibold">Ajo adoption</th>
                      <th className="p-3 font-semibold">Trend</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.channelTable.map((row) => (
                      <tr key={row.channel} className="border-t border-slate-100">
                        <td className="p-3 font-semibold text-slate-900">{row.label}</td>
                        <td className="p-3 tabular-nums">{row.signups.toLocaleString()}</td>
                        <td className="p-3 tabular-nums">{row.activationRate}%</td>
                        <td className="p-3 tabular-nums">₦{row.cacNgn.toLocaleString()}</td>
                        <td className="p-3 tabular-nums">{row.d30RetentionRate}%</td>
                        <td className="p-3 tabular-nums">{row.ajoAdoptionRate}%</td>
                        <td className="p-3">
                          <Sparkline points={row.trend} />
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setChannel(row.channel);
                              setPage(1);
                              document.getElementById("growth-users")?.scrollIntoView({ behavior: "smooth" });
                            }}
                            className="text-xs font-bold text-[#012A9D] hover:underline"
                          >
                            View users →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            {/* ── The users behind the figures ── */}
            <article id="growth-users" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                <div>
                  <h2 className="text-sm font-bold">Users in this period</h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    The same population the figures above count. Click a row for the full profile.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search name, email, phone"
                    className="h-9 w-56 rounded-lg border border-slate-200 px-3 text-xs"
                  />
                  <select
                    value={channel}
                    onChange={(e) => {
                      setChannel(e.target.value);
                      setPage(1);
                    }}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold"
                  >
                    <option value="ALL">All channels</option>
                    <option value="REFERRAL">Referral</option>
                    <option value="COMMUNITY">Community</option>
                    <option value="ORGANIC">Organic</option>
                  </select>
                  <select
                    value={stage}
                    onChange={(e) => {
                      setStage(e.target.value);
                      setPage(1);
                    }}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold"
                  >
                    <option value="ALL">All stages</option>
                    <option value="ACTIVATED">Activated (money in ≤ 7d)</option>
                    <option value="NOT_ACTIVATED">Not activated</option>
                    <option value="IN_AJO">In an Ajo</option>
                    <option value="DORMANT">No activity yet</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="p-3 font-semibold">User</th>
                      <th className="p-3 font-semibold">Signed up</th>
                      <th className="p-3 font-semibold">Channel</th>
                      <th className="p-3 font-semibold">KYC</th>
                      <th className="p-3 font-semibold">First money in</th>
                      <th className="p-3 font-semibold">Ajo</th>
                      <th className="p-3 font-semibold">Last active</th>
                      <th className="p-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className={usersLoading ? "opacity-50" : ""}>
                    {(userRows?.users ?? []).map((user) => (
                      <tr key={user.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="p-3">
                          <Link href={`/users/${user.id}`} className="block">
                            <p className="font-semibold text-[#012A9D] hover:underline">{user.name}</p>
                            <p className="text-slate-400">
                              {user.email}
                              {user.state ? ` · ${user.state}` : ""}
                            </p>
                          </Link>
                        </td>
                        <td className="p-3 tabular-nums text-slate-600">{formatDate(user.signedUpAt)}</td>
                        <td className="p-3">
                          <Badge variant={user.channel === "REFERRAL" ? "info" : user.channel === "COMMUNITY" ? "default" : "neutral"}>
                            {CHANNEL_LABEL[user.channel]}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-600">
                          {user.kycTier.replace("TIER_", "Tier ")}
                          <span className="ml-1 text-slate-400">{user.kycStatus === "APPROVED" ? "✓" : ""}</span>
                        </td>
                        <td className="p-3">
                          {user.firstMoneyInAt ? (
                            <span className={user.activated ? "font-semibold text-emerald-700" : "text-slate-600"}>
                              {formatDate(user.firstMoneyInAt)}
                              {user.activated ? " · ≤7d" : ""}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3">{user.inAjo ? <Badge variant="success">In Ajo</Badge> : <span className="text-slate-400">—</span>}</td>
                        <td className="p-3 tabular-nums text-slate-600">{user.lastActiveAt ? formatDate(user.lastActiveAt) : "—"}</td>
                        <td className="p-3">
                          <Badge variant={user.status === "ACTIVE" ? "success" : user.status === "PENDING_VERIFICATION" ? "warning" : "error"}>
                            {user.status.toLowerCase().replace(/_/g, " ")}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {userRows && userRows.users.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-sm text-slate-400">
                          No users match these filters in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {userRows && userRows.total > userRows.limit && (
                <div className="flex items-center justify-between border-t border-slate-100 p-3 text-xs text-slate-500">
                  <span>
                    {((userRows.page - 1) * userRows.limit + 1).toLocaleString()}–
                    {Math.min(userRows.page * userRows.limit, userRows.total).toLocaleString()} of{" "}
                    {userRows.total.toLocaleString()}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      disabled={userRows.page * userRows.limit >= userRows.total}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </article>
          </>
        )}
      </main>
    </div>
  );
}
