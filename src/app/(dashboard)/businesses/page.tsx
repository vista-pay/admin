"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Biz = { id: string; name: string; registrationNumber?: string; email: string; phone?: string; status: string; industry?: string; createdAt: string; updatedAt?: string; wallet?: unknown; _count?: unknown };

export default function BusinessesPage() {
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Biz[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch<{ items: Biz[] }>("/admin/businesses", { params: { page: 1, limit: 20, search: search || undefined } as never }).then((r) => {
      const raw = r.data as unknown as { items: Biz[] };
      setData(raw.items ?? []);
    }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, [search]);

  const filtered = data;

  return (
    <div className="flex flex-1 flex-col bg-[#F8FAFC]">
      <div className="flex h-[68px] items-center justify-between border-b border-slate-200 bg-white px-6">
        <h1 className="text-[18px] font-semibold text-[#0F172A]">Business Management</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 16 16" fill="none"><circle cx={7} cy={7} r={4.5} stroke="currentColor" strokeWidth={1.3}/><path d="M11 11L13 13" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round"/></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search businesses..." className="h-9 w-[220px] rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-[#012A9D] focus:outline-none" />
          </div>
          <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F172A] hover:bg-slate-50">
            <svg width={14} height={14} viewBox="0 0 16 16" fill="none"><path d="M8 3V11M8 11L5 8M8 11L11 8" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13H13" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round"/></svg>
            Export
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-6 py-3">
        {["KYB Status","Account Status","Industry","Risk Level","Date Range"].map((f) => (
          <button key={f} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">{f} <svg width={12} height={12} viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="#64748B" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"/></svg></button>
        ))}
        <button className="rounded-lg bg-[#012A9D] px-4 py-1.5 text-sm font-medium text-white">Apply</button>
        <button onClick={() => setSearch("")} className="text-sm text-slate-600">Reset</button>
      </div>

      <div className="flex-1 p-6">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Business Name</th>
                  <th className="px-4 py-3">Reg. Number</th>
                  <th className="px-4 py-3">Industry</th>
                  <th className="px-4 py-3">KYB</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Wallets</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading from <code>GET /businesses</code>…</td></tr>
                ) : error ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-amber-700 bg-amber-50">{error} — admin token cannot list businesses (requires user JWT). Seed via backend or check <code>GET /businesses</code> perms.</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No businesses found. Create via <code>POST /businesses</code>.</td></tr>
                ) : (
                  filtered.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-semibold text-[#0F172A]"><Link href={`/businesses/${b.id}`} className="hover:text-[#012A9D] hover:underline">{b.name}</Link></td>
                      <td className="px-4 py-3 text-slate-600">{b.registrationNumber ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{b.industry ?? "—"}</td>
                      <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs ${b.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : b.status === "PENDING" ? "bg-blue-100 text-blue-700" : b.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{b.status}</span></td>
                      <td className="px-4 py-3"><span className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Active</span></td>
                      <td className="px-4 py-3 text-slate-600">—</td>
                      <td className="px-4 py-3"><span className="rounded bg-slate-100 px-2 py-1 text-xs">Low</span></td>
                      <td className="px-4 py-3 text-slate-500">{new Date(b.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-slate-500">{b.updatedAt ? new Date(b.updatedAt).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-500">Showing {filtered.length} of {data.length} entries</p>
            <div className="flex gap-2">
              <button className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm">Previous</button>
              <span className="rounded-lg bg-[#012A9D] px-3 py-1 text-sm text-white">1</span>
              <button className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
