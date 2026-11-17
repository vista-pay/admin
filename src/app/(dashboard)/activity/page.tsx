"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, type ActivityRow, type ActivitySummary } from "@/lib/api";
import { AdminSelect } from "@/components/ui/admin-select";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { useDebounce } from "@/hooks/use-debounce";

/**
 * The central activity feed.
 *
 * What happened across the mobile app, the community portal, the business and
 * pay surfaces and this console — and, uniquely, **which of them it came
 * from**. None of the three older audit tables records that, which is the
 * first thing an investigation asks.
 *
 * Live by socket, but the socket only carries an id, a category and a
 * severity: every console session sits in one room regardless of which
 * permissions its operator holds, so a payload describing the event would
 * hand community data to an admin with no community permission. A push here
 * means "refetch", and the refetch goes through the permission guards.
 */

const SURFACES: Array<[string, string]> = [
  ["", "Every app"],
  ["MOBILE_APP", "Mobile app"],
  ["COMMUNITY_PORTAL", "Community portal"],
  ["BUSINESS_PORTAL", "Business portal"],
  ["PAY", "Pay page"],
  ["ADMIN_CONSOLE", "This console"],
  ["SYSTEM", "Schedulers"],
  ["WEBHOOK", "Provider webhooks"],
  ["UNKNOWN", "Unidentified"],
];

const CATEGORIES: Array<[string, string]> = [
  ["", "Everything"],
  ["MONEY", "Money"],
  ["COMMUNITY", "Communities"],
  ["MEMBER", "Members"],
  ["ADMIN", "Admin actions"],
  ["SECURITY", "Security"],
  ["SUPPORT", "Support"],
  ["SYSTEM", "System"],
];

const SEVERITY_TONE: Record<string, string> = {
  INFO: "bg-slate-100 text-slate-600",
  NOTICE: "bg-blue-50 text-blue-700",
  WARNING: "bg-amber-50 text-amber-700",
  CRITICAL: "bg-red-50 text-red-600",
};

/** Each app gets its own mark, so the column is scannable rather than read. */
const SURFACE_MARK: Record<string, string> = {
  MOBILE_APP: "▯",
  COMMUNITY_PORTAL: "♜",
  BUSINESS_PORTAL: "▣",
  PAY: "₦",
  ADMIN_CONSOLE: "⌂",
  SYSTEM: "⚙",
  WEBHOOK: "⇄",
  UNKNOWN: "?",
};

const money = (value: string | null, currency: string | null) =>
  value === null ? null : new Intl.NumberFormat("en-NG", { style: "currency", currency: currency ?? "NGN", maximumFractionDigits: 2 }).format(Number(value));
const pretty = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const clock = (iso: string) => new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
const day = (iso: string) => new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(iso));

const SUMMARY_CARDS = [
  { key: "total", label: "Last 24 hours", icon: "◉", tone: "bg-blue-50 text-blue-700" },
  { key: "failures", label: "Failed attempts", icon: "!", tone: "bg-red-50 text-red-700" },
  { key: "attention", label: "Needs attention", icon: "△", tone: "bg-amber-50 text-amber-700" },
  { key: "mobile", label: "From mobile", icon: "▯", tone: "bg-violet-50 text-violet-700" },
] as const;

export default function ActivityPage() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [total, setTotal] = useState(0);
  const [surface, setSurface] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [outcome, setOutcome] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ActivityRow | null>(null);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [arrived, setArrived] = useState(0);
  const debouncedSearch = useDebounce(search, 300);

  const load = useCallback(
    () =>
      // No `setLoading(true)` here: this runs from an effect, and a
      // synchronous setState on that path cascades a render. `loading`
      // starts true and clears once the first fetch lands — a filter change
      // keeps the current rows on screen rather than flashing a spinner,
      // which is also what the other console lists do.
      Promise.all([
        adminApi.activity({
          limit: 100,
          surface: surface || undefined,
          category: category || undefined,
          severity: severity || undefined,
          outcome: outcome || undefined,
          search: debouncedSearch || undefined,
        }),
        adminApi.activitySummary(24),
      ])
        .then(([feed, counts]) => {
          setRows(feed.data.items);
          setTotal(feed.data.total);
          setSummary(counts.data);
          setArrived(0);
          setError("");
        })
        .catch((e: Error) => setError(e.message || "Could not load the activity feed"))
        .finally(() => setLoading(false)),
    [surface, category, severity, outcome, debouncedSearch],
  );

  useEffect(() => { void load(); }, [load]);

  /**
   * A row landed. Paused mode counts them instead of reloading, because a
   * feed that reorders under the cursor while an operator is reading one line
   * is worse than a feed that is five seconds old.
   *
   * `useCallback` rather than an inline function: the hook keeps the handler
   * in a ref synced by an effect, so a fresh closure every render would
   * re-run that effect on every render for nothing.
   */
  const onActivity = useCallback(() => {
    if (live) void load();
    else setArrived((n) => n + 1);
  }, [live, load]);

  useRealtimeEvent("activity.created", onActivity);

  const activeFilterCount = [surface, category, severity, outcome].filter(Boolean).length + (search.trim() ? 1 : 0);
  const clearFilters = () => {
    setSearch("");
    setSurface("");
    setCategory("");
    setSeverity("");
    setOutcome("");
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Operations</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Activity</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            A live, searchable record of actions across every Rendi application. {total.toLocaleString()} records match the current view.
          </p>
        </div>
        <button onClick={() => { if (!live) void load(); setLive(!live); }} className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold shadow-sm transition ${live ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
          <span aria-hidden>{live ? "Ⅱ" : "▶"}</span>
          <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} />
          {live ? "Live updates on" : arrived > 0 ? `Resume · ${arrived} new` : "Resume updates"}
        </button>
      </header>

      {summary && (
        <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {SUMMARY_CARDS.map(({ key, label, icon, tone }) => {
            const value = key === "total" ? summary.total : key === "failures" ? summary.failures : key === "attention" ? (summary.bySeverity.WARNING ?? 0) + (summary.bySeverity.CRITICAL ?? 0) : (summary.bySurface.MOBILE_APP ?? 0);
            return (
            <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1.5 text-2xl font-black text-slate-950">{value.toLocaleString()}</p>
                </div>
                <span aria-hidden className={`flex h-9 w-9 items-center justify-center rounded-xl text-base font-black ${tone}`}>{icon}</span>
              </div>
            </div>
          )})}
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-2 xl:flex-row">
          <label className="relative min-w-[260px] flex-1">
            <span aria-hidden className="pointer-events-none absolute left-3.5 top-2.5 text-base text-slate-400">⌕</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search activity, reasons or transaction references" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
            <AdminSelect aria-label="Filter by application" value={surface} onChange={(e) => setSurface(e.target.value)} containerClassName="w-full xl:w-[175px]">{SURFACES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</AdminSelect>
            <AdminSelect aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} containerClassName="w-full xl:w-[155px]">{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</AdminSelect>
            <AdminSelect aria-label="Filter by severity" value={severity} onChange={(e) => setSeverity(e.target.value)} containerClassName="w-full xl:w-[145px]"><option value="">Any severity</option><option value="CRITICAL">Critical</option><option value="WARNING">Warning</option><option value="NOTICE">Notice</option><option value="INFO">Info</option></AdminSelect>
            <AdminSelect aria-label="Filter by outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} containerClassName="w-full xl:w-[140px]"><option value="">Any outcome</option><option value="SUCCESS">Succeeded</option><option value="FAILED">Failed</option></AdminSelect>
          </div>
          {activeFilterCount > 0 && <button onClick={clearFilters} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-100"><span aria-hidden>×</span>Clear {activeFilterCount}</button>}
        </div>
      </div>

      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div><h2 className="text-sm font-extrabold text-slate-900">Event stream</h2><p className="mt-0.5 text-xs text-slate-500">Newest activity appears first</p></div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-600">{total.toLocaleString()}</span>
          </div>
          <div className="max-h-[680px] overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 shadow-[0_1px_0_0_#e2e8f0]"><tr>{["Time", "Application", "What happened", "Who", "Amount"].map((h) => <th key={h} className="px-4 py-3 font-extrabold">{h}</th>)}</tr></thead>
              <tbody>
                {loading && rows.length === 0 && Array.from({ length: 7 }).map((_, index) => <tr key={index} className="border-t border-slate-100"><td colSpan={5} className="px-4 py-3"><div className="h-9 animate-pulse rounded-lg bg-slate-100" /></td></tr>)}
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => setSelected(row)} className={`cursor-pointer border-t border-slate-100 transition-colors ${selected?.id === row.id ? "bg-blue-50/80" : "hover:bg-slate-50/80"}`}>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs"><b className="block font-bold text-slate-800">{clock(row.createdAt)}</b><span className="mt-0.5 block text-[11px] text-slate-400">{day(row.createdAt)}</span></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs"><span className="inline-flex items-center gap-2"><span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">{SURFACE_MARK[row.surface]}</span><span className="font-semibold text-slate-700">{pretty(row.surface)}</span></span></td>
                    <td className="max-w-[420px] px-4 py-3.5">
                      <b className="block truncate font-bold text-slate-900" title={row.summary}>{row.summary}</b>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY_TONE[row.severity]}`}>{row.severity}</span>
                        {row.outcome === "FAILED" && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">FAILED</span>}
                        <span className="truncate">{row.event}</span>
                        {row.community && <span>· {row.community.name}</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-700">{row.actorLabel ?? pretty(row.actorType)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-bold tabular-nums text-slate-800">{money(row.amount, row.currencyCode) ?? <span className="font-normal text-slate-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !rows.length && <div className="p-12 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-400">⌕</span><p className="mt-3 text-sm font-bold text-slate-700">No activity found</p><p className="mt-1 text-xs text-slate-500">Try changing or clearing the current filters.</p></div>}
          <p className="border-t bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">
            <span aria-hidden className="mr-1.5 text-emerald-600">✓</span>Append-only audit record — activity cannot be edited or deleted by the application.
          </p>
        </section>

        {selected ? (
          <aside className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40 xl:sticky xl:top-20">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Event details</p><p className="mt-0.5 text-xs text-slate-500">Complete audit context</p></div><button onClick={() => setSelected(null)} aria-label="Close event details" className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">×</button></div>
            <div className="p-5">
            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${SEVERITY_TONE[selected.severity]}`}>● {selected.severity}</span>
            <h2 className="mt-3 text-lg font-black leading-6 text-slate-950">{selected.summary}</h2>
            <p className="mt-1 text-xs text-slate-500">{selected.event}</p>

            <dl className="mt-5 grid grid-cols-[108px_1fr] gap-y-3 border-y border-slate-100 py-4 text-sm">
              <dt className="text-slate-500">When</dt><dd className="text-right font-bold">{day(selected.createdAt)} {clock(selected.createdAt)}</dd>
              <dt className="text-slate-500">From</dt><dd className="text-right font-bold">{pretty(selected.surface)}</dd>
              <dt className="text-slate-500">Who</dt><dd className="text-right font-bold">{selected.actorLabel ?? pretty(selected.actorType)}</dd>
              <dt className="text-slate-500">Outcome</dt><dd className={`text-right font-bold ${selected.outcome === "FAILED" ? "text-red-600" : ""}`}>{pretty(selected.outcome)}</dd>
              <dt className="text-slate-500">Acted on</dt><dd className="truncate text-right font-bold" title={selected.targetId ?? ""}>{pretty(selected.targetType)}</dd>
              {selected.community && <><dt className="text-slate-500">Community</dt><dd className="text-right font-bold">{selected.community.name}{selected.community.publicId ? ` · ${selected.community.publicId}` : ""}</dd></>}
              {selected.amount && <><dt className="text-slate-500">Amount</dt><dd className="text-right font-bold">{money(selected.amount, selected.currencyCode)}</dd></>}
              {selected.transactionReference && <><dt className="text-slate-500">Transaction</dt><dd className="truncate text-right font-bold" title={selected.transactionReference}>{selected.transactionReference}</dd></>}
              {/* The sign-off that authorised it, where one was required —
                  so an auditor walks from the effect back to who allowed it. */}
              {selected.approvalRequestId && <><dt className="text-slate-500">Approved as</dt><dd className="text-right font-bold">{selected.approvalRequestId}</dd></>}
            </dl>

            {selected.reason && (
              <>
                <h3 className="mt-5 text-[11px] font-extrabold uppercase text-slate-600">Reason given</h3>
                <p className="mt-1 rounded-xl bg-slate-50 p-3 text-sm leading-5">{selected.reason}</p>
              </>
            )}

            <h3 className="mt-5 text-[11px] font-extrabold uppercase text-slate-600">Where from</h3>
            <dl className="mt-2 grid grid-cols-[108px_1fr] gap-y-1.5 text-xs">
              <dt className="text-slate-500">IP address</dt><dd className="text-right font-medium">{selected.ipAddress ?? "—"}</dd>
              <dt className="text-slate-500">Device</dt><dd className="truncate text-right font-medium" title={selected.deviceId ?? ""}>{selected.deviceId ?? "—"}</dd>
              <dt className="text-slate-500">Request</dt><dd className="truncate text-right font-medium" title={selected.requestId ?? ""}>{selected.requestId ?? "—"}</dd>
              <dt className="text-slate-500">Client</dt><dd className="truncate text-right font-medium" title={selected.userAgent ?? ""}>{selected.userAgent ?? "—"}</dd>
            </dl>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              The app is reported by the client and narrowed against the credential it presented — an admin session always resolves to this console, a scheduler to Schedulers. Nothing is authorised from this field.
            </p>
            </div>
          </aside>
        ) : (
          <aside className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-10 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-lg text-blue-600">◉</span><p className="mt-3 text-sm font-bold text-slate-700">Select an event</p><p className="mt-1 text-xs leading-5 text-slate-500">Choose a row to see who performed it, where it came from, and why.</p></aside>
        )}
      </div>
    </main>
  );
}
