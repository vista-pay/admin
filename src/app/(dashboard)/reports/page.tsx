"use client";
import { useState } from "react";
import { adminApi } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";

type Txn = { id: string; type: string; amount: string; currencyCode: string; status: string; createdAt: string };

export default function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Txn[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchReport() {
    setLoading(true); setError(null);
    try {
      // For admin, use /admin/transactions with date filter (client-side)
      const r = await adminApi.transactions({ page: 1, limit: 100 } as never);
      const arr = (Array.isArray(r.data) ? r.data : (r.data as { items?: Txn[] })?.items ?? []) as Txn[];
      // filter by date range if provided
      const filtered = arr.filter((t) => {
        if (!from && !to) return true;
        const d = new Date(t.createdAt);
        if (from && d < new Date(from)) return false;
        if (to && d > new Date(to + "T23:59:59")) return false;
        return true;
      });
      setData(filtered);
      setTotal(filtered.length);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  const totalVolume = data.reduce((sum, t) => t.status === "SUCCESS" ? sum + Number(t.amount) : sum, 0);

  return (
    <div className="flex flex-1 flex-col bg-[#F8FAFC]">
      <div className="flex h-[68px] items-center justify-between border-b border-slate-200 bg-white px-6">
        <div>
          <h1 className="text-[18px] font-semibold text-[#0F172A]">Reports</h1>
          <p className="text-sm text-slate-500">Transaction statements and exports — filtered by date.</p>
        </div>
        <button onClick={() => {
          const csv = ["id,type,amount,currency,status,createdAt"].concat(data.map((t) => `${t.id},${t.type},${t.amount},${t.currencyCode},${t.status},${t.createdAt}`)).join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `report-${from}-${to}.csv`; a.click();
        }} disabled={data.length === 0} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-slate-50 disabled:opacity-50">Export CSV</button>
      </div>

      <div className="p-6 space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-[#0F172A]">Generate Report</h3>
          <div className="mt-4 flex flex-wrap gap-3 items-end">
            <label className="text-sm">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
            <label className="text-sm">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
            <button onClick={fetchReport} disabled={loading} className="rounded-lg bg-[#012A9D] px-6 py-2 text-sm font-medium text-white hover:bg-[#011E7A]">{loading ? "Loading…" : "Generate"}</button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Total Transactions</p>
            <p className="mt-1 text-2xl font-bold text-[#0F172A]">{total}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Total Volume (Success)</p>
            <p className="mt-1 text-2xl font-bold text-[#0F172A]">{formatCurrency(totalVolume, "NGN")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Date Range</p>
            <p className="mt-1 text-sm font-medium text-[#0F172A]">{from || "—"} → {to || "—"}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-[#0F172A]">Statement</h3>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-4 py-2">ID</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Date</th></tr>
              </thead>
              <tbody>
                {data.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No data — generate a report with a date range.</td></tr> : data.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono text-xs text-[#2563EB]">{t.id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-slate-600">{t.type}</td>
                    <td className="px-4 py-2 font-medium text-[#0F172A]">{formatCurrency(t.amount, t.currencyCode)}</td>
                    <td className="px-4 py-2"><span className={`rounded px-2 py-1 text-xs ${t.status === "SUCCESS" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{t.status}</span></td>
                    <td className="px-4 py-2 text-xs text-slate-500">{formatDate(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
