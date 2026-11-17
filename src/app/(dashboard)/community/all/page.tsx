"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminApi, type CommunityFilterOptions, type CommunityRow } from "@/lib/api";
import { AdminSelect } from "@/components/ui/admin-select";
import {
  CATEGORY_LABELS,
  CommunityFilterRail,
  STATUS_LABELS,
  VERIFICATION_LABELS,
  useCommunityFilters,
} from "@/components/community/filter-rail";

/**
 * Every community on the platform, filtered the same five ways the dashboard
 * is — so a tile there links straight into the rows behind it.
 *
 * The row carries the operational counts an oversight list needs (members,
 * Ajo groups, plan, health) so the page does not fire a request per row to
 * fill its columns.
 */

const STATUS_TONE: Record<string, string> = {
  VERIFIED: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  SUSPENDED: "bg-red-50 text-red-600",
  INACTIVE: "bg-slate-100 text-slate-600",
  REJECTED: "bg-slate-100 text-slate-600",
};
const VERIFICATION_TONE: Record<string, string> = {
  FULL: "bg-emerald-50 text-emerald-700",
  BASIC: "bg-blue-50 text-blue-700",
  PENDING: "bg-slate-100 text-slate-600",
};
const day = (iso: string) => new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(iso));

export default function AllCommunitiesPage() {
  const router = useRouter();
  const { filters, setFilters, options, setOptions } = useCommunityFilters();
  const [rows, setRows] = useState<CommunityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sort, setSort] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      Promise.all([
        adminApi.communityDirectory({ ...filters, sort, page, limit: 25 }),
        adminApi.communityFilterOptions(),
      ])
        .then(([list, opts]: [{ data: { items: CommunityRow[]; total: number; totalPages: number } }, { data: CommunityFilterOptions }]) => {
          setRows(list.data.items);
          setTotal(list.data.total);
          setTotalPages(list.data.totalPages);
          setOptions(opts.data);
          setError("");
        })
        .catch((e: Error) => setError(e.message || "Could not load communities"))
        .finally(() => setLoading(false)),
    [filters, sort, page, setOptions],
  );

  useEffect(() => { void load(); }, [load]);

  /** Filtering changes what the list is, so it starts again at page one. */
  const changeFilters = (next: typeof filters) => { setPage(1); setFilters(next); };

  function exportCsv() {
    const header = "rendi_id,name,type,status,verification,state,lga,members,ajo_groups,plan,health,registered";
    const lines = rows.map((row) =>
      [
        row.publicId ?? "",
        `"${row.name.replaceAll('"', '""')}"`,
        row.categoryType ?? "",
        row.status,
        row.verificationLevel,
        row.state ?? "",
        row.lga ?? "",
        row._count.members,
        row._count.ajoGroups,
        row.subscription?.plan.name ?? "",
        row.healthScore ?? "",
        row.createdAt.slice(0, 10),
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `communities-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">All communities</h1>
          <p className="mt-1 text-sm text-slate-600">
            {loading ? "Loading…" : `${total.toLocaleString()} match these filters`} · cooperatives, Ajo and thrift groups, staff cooperatives and trade associations
          </p>
        </div>
        <div className="flex gap-2">
          <AdminSelect aria-label="Sort communities" value={sort} onChange={(e) => { setPage(1); setSort(e.target.value); }} containerClassName="w-[165px]">
            <option value="recent">Newest first</option>
            <option value="members">Most members</option>
            <option value="health">Health score</option>
            <option value="name">Name A–Z</option>
          </AdminSelect>
          {/* This page's rows, not the whole result set — labelled as such in
              the filename so nobody mistakes 25 rows for a full export. */}
          <button onClick={exportCsv} disabled={!rows.length} className="h-11 shrink-0 rounded-xl border bg-white px-4 text-sm font-bold disabled:opacity-40">⇩ Export page</button>
        </div>
      </header>

      <CommunityFilterRail filters={filters} onChange={changeFilters} options={options} className="mt-5" />

      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="mt-5 overflow-hidden rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>{["Community", "Type", "Location", "Members", "Plan", "Verification", "Status"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                /* The whole row opens the community — anywhere on it. The name
                   stays a real link so middle-click and "open in new tab"
                   still work, which a click handler alone would take away. */
                <tr
                  key={row.id}
                  onClick={() => router.push(`/community/${row.id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter") router.push(`/community/${row.id}`); }}
                  tabIndex={0}
                  className="cursor-pointer border-t transition-colors hover:bg-blue-50/60 focus:bg-blue-50 focus:outline-none"
                >
                  <td className="px-3 py-3">
                    <Link
                      href={`/community/${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-bold text-slate-950 hover:text-blue-600"
                    >
                      {row.name}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {row.publicId ?? row.registrationNumber ?? row.id.slice(0, 8)} · registered {day(row.createdAt)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {row.categoryType ? CATEGORY_LABELS[row.categoryType] : <span className="text-amber-700">Not categorised</span>}
                  </td>
                  <td className="px-3 py-3 text-xs">{[row.lga, row.state, row.city].filter(Boolean).join(", ") || row.country}</td>
                  <td className="px-3 py-3">
                    <b>{row._count.members.toLocaleString()}</b>
                    <span className="block text-xs text-slate-500">{row._count.ajoGroups} Ajo</span>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {row.subscription ? <>{row.subscription.plan.name}<span className="block text-slate-500">{row.subscription.status.toLowerCase()}</span></> : <span className="text-slate-400">None</span>}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${VERIFICATION_TONE[row.verificationLevel]}`}>
                      {VERIFICATION_LABELS[row.verificationLevel]}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[row.status]}`}>● {STATUS_LABELS[row.status]}</span>
                    {/* The reason, inline: a SUSPENDED chip with no reason
                        sends the operator into the detail pane to find out
                        what they are looking at. */}
                    {row.suspensionReason && <span className="mt-0.5 block max-w-[220px] truncate text-[11px] text-red-600" title={row.suspensionReason}>{row.suspensionReason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !rows.length && <p className="p-10 text-center text-sm text-slate-500">No community matches these filters.</p>}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-3 text-sm">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border bg-white px-3 py-1.5 font-bold disabled:opacity-40">← Previous</button>
            <span className="text-xs text-slate-600">Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border bg-white px-3 py-1.5 font-bold disabled:opacity-40">Next →</button>
          </div>
        )}
      </section>
    </main>
  );
}
