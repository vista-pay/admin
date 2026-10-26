"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { type Admin, type KybInfo, KYB_STATUS_META, KybBadge, RiskCell, fmtShort } from "./kyb-shared";

type BizRow = {
  id: string;
  name: string;
  registrationNumber?: string | null;
  email: string;
  industry?: string | null;
  accountStatus: string;
  createdAt: string;
  kyb: KybInfo | null;
};

type ListResponse = {
  items: BizRow[];
  total: number;
  page: number;
  totalPages: number;
  summary: { submitted: number; inReview: number; awaitingInformation: number; readyForApproval: number; approved: number; rejected: number };
  tabs: { directory: number; queue: number; mine: number };
  next: {
    businessId: string;
    businessName: string;
    reference: string;
    submittedAt: string;
    issues: string[];
    assignee: { id: string; name: string } | null;
  } | null;
};

const TABS = [
  { key: "directory", label: "Business directory" },
  { key: "queue", label: "KYB review queue" },
  { key: "mine", label: "Assigned to my team" },
] as const;

export default function BusinessesPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("directory");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [assignee, setAssignee] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<ListResponse>("/admin/businesses", {
        params: {
          page,
          limit: 20,
          search: search || undefined,
          status: status || undefined,
          risk: risk || undefined,
          assignee: assignee || undefined,
          view: tab === "directory" ? undefined : tab,
        },
      });
      setData(r.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load businesses");
    } finally {
      setLoading(false);
    }
  }, [page, search, status, risk, assignee, tab]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    // The assignee filter is nice-to-have: not every operator may list admins.
    apiFetch<{ items?: Admin[] } | Admin[]>("/admin/admins")
      .then((r) => {
        const raw = r.data as { items?: Admin[] } | Admin[];
        setAdmins(Array.isArray(raw) ? raw : (raw.items ?? []));
      })
      .catch(() => setAdmins([]));
  }, []);

  const rows = data?.items ?? [];

  const exportCsv = () => {
    const head = ["Name", "KYB reference", "RC number", "Email", "KYB status", "Risk", "EDD", "Assignee", "Submitted"];
    const lines = rows.map((b) => [
      b.name,
      b.kyb?.reference ?? "",
      b.registrationNumber ?? "",
      b.email,
      b.kyb?.status ?? "",
      b.kyb?.riskLevel ?? "",
      b.kyb?.eddRequired ? "Yes" : "No",
      b.kyb?.assignee?.name ?? "Unassigned",
      b.kyb?.submittedAt ?? b.createdAt,
    ]);
    const csv = [head, ...lines].map((cells) => cells.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "businesses.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  const tiles = useMemo(
    () => [
      { label: "Submitted", value: data?.summary.submitted ?? 0 },
      { label: "In review", value: data?.summary.inReview ?? 0 },
      { label: "Awaiting information", value: data?.summary.awaitingInformation ?? 0 },
      { label: "Ready for approval", value: data?.summary.readyForApproval ?? 0 },
      { label: "Approved", value: data?.summary.approved ?? 0 },
      { label: "Rejected", value: data?.summary.rejected ?? 0 },
    ],
    [data],
  );

  return (
    <div className="min-w-0 flex-1 bg-[#F8FAFC]">
      <main className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-[25px] font-extrabold tracking-tight text-[#0F172A]">Businesses</h1>
            <p className="mt-1 text-sm text-slate-600">Review legal entities, verify ownership and authorize business access.</p>
          </div>
          <button onClick={exportCsv} className="h-10 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0F172A] hover:bg-slate-50">
            Export list
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-500">{t.label}</p>
              <p className="mt-1 text-2xl font-extrabold text-[#0F172A]">{t.value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-6 border-b border-slate-200">
          {TABS.map((t) => {
            const count = t.key === "directory" ? data?.tabs.directory : t.key === "queue" ? data?.tabs.queue : data?.tabs.mine;
            return (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setPage(1);
                }}
                className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold ${tab === t.key ? "border-[#012A9D] text-[#012A9D]" : "border-transparent text-slate-500 hover:text-slate-700"}`}
              >
                {t.label}
                {count !== undefined && ` (${count})`}
              </button>
            );
          })}
        </div>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search legal name, RC number or business ID..."
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm placeholder:text-slate-400 focus:border-[#012A9D] focus:outline-none"
              />
              <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
                <option value="">Status: All statuses</option>
                {Object.entries(KYB_STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select value={risk} onChange={(e) => { setRisk(e.target.value); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
                <option value="">Risk: All levels</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
              <select value={assignee} onChange={(e) => { setAssignee(e.target.value); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
                <option value="">Assignee: Anyone</option>
                <option value="me">Assigned to me</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                ))}
              </select>
            </div>

            {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">Business / Registration</th>
                      <th className="px-4 py-3">KYB status</th>
                      <th className="px-4 py-3">Risk</th>
                      <th className="px-4 py-3">Assignee</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Loading businesses…</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No businesses match these filters.</td></tr>
                    ) : (
                      rows.map((b) => (
                        <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <Link href={`/businesses/${b.id}`} className="font-semibold text-[#0F172A] hover:text-[#012A9D]">{b.name}</Link>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {b.kyb?.reference ?? "No application"}
                              {b.registrationNumber ? ` · RC ${b.registrationNumber}` : ""}
                            </p>
                            <p className="text-xs text-slate-400">{fmtShort(b.kyb?.submittedAt ?? b.createdAt)}</p>
                          </td>
                          <td className="px-4 py-3">{b.kyb ? <KybBadge status={b.kyb.status} /> : <span className="text-xs text-slate-400">—</span>}</td>
                          <td className="px-4 py-3">{b.kyb ? <RiskCell risk={b.kyb.riskLevel} edd={b.kyb.eddRequired} /> : "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{b.kyb?.assignee?.name ?? "Unassigned"}</td>
                          <td className="px-4 py-3">
                            <Link href={`/businesses/${b.id}`} className="text-sm font-semibold text-[#012A9D] hover:underline">
                              {b.kyb?.status === "APPROVED" ? "View profile" : "Review →"}
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
                <p className="text-slate-500">
                  {data ? `Showing ${rows.length ? (data.page - 1) * 20 + 1 : 0}–${(data.page - 1) * 20 + rows.length} of ${data.total}` : "—"}
                </p>
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Previous</button>
                  <span className="rounded-lg bg-[#012A9D] px-3 py-1 text-white">{page}</span>
                  <button disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">Next →</button>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#0F172A]">Next in KYB review</h2>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{data?.tabs.queue ?? 0} open</span>
              </div>
              {data?.next ? (
                <>
                  <p className="mt-3 text-lg font-extrabold text-[#0F172A]">{data.next.businessName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {data.next.reference} · Submitted {new Date(data.next.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                  <div className="mt-4 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#0F172A]">Assigned reviewer</p>
                      <p className="mt-0.5 text-xs text-slate-500">{data.next.assignee?.name ?? "Nobody yet"}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${data.next.assignee ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-700"}`}>
                      {data.next.assignee ? "Assigned" : "Unassigned"}
                    </span>
                  </div>
                  {data.next.issues.length > 0 && (
                    <div className="mt-4 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[#0F172A]">Evidence needs attention</p>
                        <p className="mt-0.5 text-xs text-slate-500">{data.next.issues.join("; ")}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {data.next.issues.length} issue{data.next.issues.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  )}
                  <Link href={`/businesses/${data.next.businessId}`} className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#012A9D] px-5 text-sm font-semibold text-white hover:bg-[#01238a]">
                    Open application
                  </Link>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Nothing waiting — every application has been decided.</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-bold text-[#0F172A]">Separate verification tracks</h2>
              <p className="mt-2 text-sm text-slate-600">Business KYB verifies the legal entity, its directors and beneficial owners.</p>
              <p className="mt-3 text-sm text-slate-700">
                Personal KYC → <Link href="/kyc" className="font-semibold text-[#012A9D] hover:underline">Users / KYC reviews</Link>
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Community verification → <Link href="/communities" className="font-semibold text-[#012A9D] hover:underline">Communities</Link>
              </p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
