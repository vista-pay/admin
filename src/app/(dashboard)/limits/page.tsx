"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type LimitRule = { id: string; tier: string; transactionType: string; currencyCode: string; dailyLimit: string; weeklyLimit?: string; monthlyLimit: string; createdAt: string };

const TIER_META: Record<string, { label: string; color: string; desc: string }> = {
  TIER_0: { label: "Tier 0", color: "bg-slate-100 text-slate-700", desc: "Unverified" },
  TIER_1: { label: "Tier 1", color: "bg-blue-50 text-blue-700", desc: "BVN verified" },
  TIER_2: { label: "Tier 2", color: "bg-emerald-50 text-emerald-700", desc: "KYC approved" },
  TIER_3: { label: "Tier 3", color: "bg-violet-50 text-violet-700", desc: "Business KYB" },
};

export default function LimitsPage() {
  const [limits, setLimits] = useState<LimitRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ tier: "TIER_1", transactionType: "TRANSFER", currencyCode: "NGN", dailyLimit: "500000", weeklyLimit: "2000000", monthlyLimit: "5000000" });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch<LimitRule[]>("/admin/limits");
      setLimits(r.data as unknown as LimitRule[]);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await apiFetch("/admin/limits", { method: "POST", body: JSON.stringify({ tier: form.tier, transactionType: form.transactionType, currencyCode: form.currencyCode, dailyLimit: form.dailyLimit, weeklyLimit: form.weeklyLimit, monthlyLimit: form.monthlyLimit, reason: "Admin limit update" }) });
      setEditingId(null);
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  function edit(l: LimitRule) {
    setForm({ tier: l.tier, transactionType: l.transactionType, currencyCode: l.currencyCode, dailyLimit: l.dailyLimit, weeklyLimit: l.weeklyLimit ?? "", monthlyLimit: l.monthlyLimit });
    setEditingId(l.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex flex-1 flex-col bg-[#F8FAFC]">
      <div className="border-b border-slate-200 bg-white">
        <div className="px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F172A] text-white">
              <svg width={20} height={20} viewBox="0 0 16 16" fill="none"><path d="M3 10A5 5 0 0 1 13 10" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round"/><circle cx={8} cy={10} r={1} fill="currentColor"/><path d="M8 10L11 7" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round"/></svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#0F172A]">Limit Management</h1>
              <p className="text-sm text-slate-500">Guard rails per KYC tier — velocity checks for every transaction.</p>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{limits.length} rules</div>
            <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">Audited • COMPLIANCE_OFFICER</div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid gap-4 sm:grid-cols-4">
          {Object.entries(TIER_META).map(([tier, meta]) => {
            const count = limits.filter(l => l.tier === tier).length;
            return (
              <div key={tier} className="rounded-xl border border-slate-200 bg-white p-4">
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${meta.color}`}>{meta.label}</span>
                <p className="mt-2 text-xs text-slate-500">{meta.desc}</p>
                <p className="mt-1 text-lg font-bold text-[#0F172A]">{count} rules</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h3 className="text-sm font-semibold text-[#0F172A]">Active Limit Rules</h3>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">Live • GET /admin/limits</span>
              </div>
              <div className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#F8FAFC] text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <tr><th className="px-4 py-3">Tier</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Currency</th><th className="px-4 py-3">Daily</th><th className="px-4 py-3">Monthly</th><th className="px-4 py-3"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center"><div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#0F172A]" /></td></tr>
                    ) : limits.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center"><p className="text-sm font-medium text-[#0F172A]">No limits yet</p><p className="text-xs text-slate-500">Create your first rule on the right.</p></td></tr>
                    ) : limits.map((l) => (
                      <tr key={l.id} className={`hover:bg-slate-50/70 ${editingId === l.id ? "bg-[#0F172A]/5" : ""}`}>
                        <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${TIER_META[l.tier]?.color ?? "bg-slate-100 text-slate-700"}`}>{l.tier}</span></td>
                        <td className="px-4 py-3 font-medium text-[#0F172A]">{l.transactionType}</td>
                        <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{l.currencyCode}</span></td>
                        <td className="px-4 py-3 font-medium text-[#0F172A]">{Number(l.dailyLimit).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-600">{Number(l.monthlyLimit).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right"><button onClick={() => edit(l)} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium hover:bg-slate-50">Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#0F172A]">{editingId ? "Update Limit" : "Create Limit Rule"}</h3>
                {editingId && <button onClick={() => { setEditingId(null); setForm({ tier: "TIER_1", transactionType: "TRANSFER", currencyCode: "NGN", dailyLimit: "500000", weeklyLimit: "2000000", monthlyLimit: "5000000" }); }} className="text-xs text-slate-500 hover:text-[#0F172A]">Clear</button>}
              </div>
              <p className="mt-1 text-xs text-slate-500">Unique per <code>tier + type + currency</code>. Overwrites existing.</p>

              <form onSubmit={submit} className="mt-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">KYC Tier</label>
                  <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-[#F8FAFC] px-3 py-2.5 text-sm font-medium text-[#0F172A] focus:border-[#0F172A] focus:outline-none">
                    <option>TIER_0</option><option>TIER_1</option><option>TIER_2</option><option>TIER_3</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Type</label>
                    <select value={form.transactionType} onChange={(e) => setForm({ ...form, transactionType: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-[#0F172A] focus:outline-none"><option>TRANSFER</option><option>DEPOSIT</option><option>WITHDRAWAL</option><option>FX_CONVERSION</option></select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Currency</label>
                    <input value={form.currencyCode} onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium uppercase focus:border-[#0F172A] focus:outline-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Daily Limit</label>
                  <input value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium focus:border-[#0F172A] focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Monthly Limit</label>
                  <input value={form.monthlyLimit} onChange={(e) => setForm({ ...form, monthlyLimit: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium focus:border-[#0F172A] focus:outline-none" />
                </div>

                {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

                <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#1E293B] disabled:opacity-50">
                  {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
                  {editingId ? "Update Rule" : "Create Rule"}
                </button>
                <p className="text-center text-xs text-slate-400">POST <code>/admin/limits</code> • Audited</p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
