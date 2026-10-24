"use client";

import { useEffect, useState } from "react";
import { adminApi, apiFetch } from "@/lib/api";
import { API_BASE } from "@/lib/constants";

type Provider = { id: string; code: string; name: string; isActive: boolean; isDefault: boolean };
type Corridor = { id: string; sourceCountry: string; destinationCountry: string; sourceCurrency: string; destinationCurrency: string; providerCode: string; isActive: boolean; minAmount: string; maxAmount: string };

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([adminApi.providers().then((r) => r.data as unknown as Provider[]), adminApi.corridors().then((r) => r.data as unknown as Corridor[])]);
      setProviders(p);
      setCorridors(c);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function toggleProvider(id: string, isActive: boolean) {
    await apiFetch(`/admin/providers/${id}/status`, { method: "PATCH", body: JSON.stringify({ isActive: !isActive, reason: "Toggled from admin console" }) });
    load();
  }
  async function toggleCorridor(id: string, isActive: boolean) {
    await apiFetch(`/admin/corridors/${id}/status`, { method: "PATCH", body: JSON.stringify({ isActive: !isActive, reason: "Toggled from admin console" }) });
    load();
  }

  const [showAddCorridor, setShowAddCorridor] = useState(false);
  const [newCorridor, setNewCorridor] = useState({ sourceCountry: "NG", destinationCountry: "US", sourceCurrency: "NGN", destinationCurrency: "USD", providerCode: "FLUTTERWAVE", minAmount: "10", maxAmount: "100000" });
  const [creating, setCreating] = useState(false);

  async function createCorridor() {
    setCreating(true);
    try {
      await apiFetch("/admin/corridors", { method: "POST", body: JSON.stringify(newCorridor) });
      setShowAddCorridor(false);
      load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed to create corridor"); }
    finally { setCreating(false); }
  }

  const bullBoardUrl = API_BASE.replace(/\/api\/v1\/?$/, "") + "/admin/queues";

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading providers…</div>;

  return (
    <div className="flex flex-1 flex-col bg-[#F8FAFC]">
      <div className="flex h-[68px] items-center justify-between border-b border-slate-200 bg-white px-6">
        <div>
          <h1 className="text-[18px] font-semibold text-[#0F172A]">Providers & Corridors</h1>
          <p className="text-sm text-slate-500">Manage payment providers and international corridors — toggles are audited.</p>
        </div>
        <a href={bullBoardUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0F172A] hover:bg-slate-50">Open Bull Board</a>
      </div>

      {error && <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="p-6 space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-[#0F172A]">Payment Providers</h3>
          <p className="text-xs text-slate-500">Toggle availability — affects deposits, withdrawals, and international payouts.</p>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-4 py-2">Provider</th><th className="px-4 py-2">Code</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Default</th><th className="px-4 py-2">Action</th></tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-[#0F172A]">{p.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.code}</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{p.isActive ? "Active" : "Inactive"}</span></td>
                    <td className="px-4 py-3 text-xs">{p.isDefault ? "Yes" : "No"}</td>
                    <td className="px-4 py-3"><button onClick={() => toggleProvider(p.id, p.isActive)} className={`rounded-lg px-3 py-1 text-xs font-medium ${p.isActive ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>{p.isActive ? "Deactivate" : "Activate"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#0F172A]">International Corridors</h3>
              <p className="text-xs text-slate-500">NGN → USD/EUR/GBP etc via Flutterwave. Inactive corridors block quotes.</p>
            </div>
            <button onClick={() => setShowAddCorridor(true)} className="rounded-lg bg-[#012A9D] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#011E7A]">Add Corridor</button>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-4 py-2">Route</th><th className="px-4 py-2">Currencies</th><th className="px-4 py-2">Limits</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Action</th></tr>
              </thead>
              <tbody>
                {corridors.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-[#0F172A]">{c.sourceCountry} → {c.destinationCountry} <span className="text-xs text-slate-500">({c.providerCode})</span></td>
                    <td className="px-4 py-3 text-xs text-slate-600">{c.sourceCurrency} → {c.destinationCurrency}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{c.minAmount} — {c.maxAmount}</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs ${c.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{c.isActive ? "Live" : "Disabled"}</span></td>
                    <td className="px-4 py-3"><button onClick={() => toggleCorridor(c.id, c.isActive)} className={`rounded-lg px-3 py-1 text-xs font-medium ${c.isActive ? "bg-slate-100 text-slate-700" : "bg-[#012A9D] text-white"}`}>{c.isActive ? "Disable" : "Enable"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-400">Changes are audited to <code>AuditLog</code> and require <code>SUPER_ADMIN</code> or <code>COMPLIANCE_OFFICER</code>.</p>
        </div>
      </div>

      {showAddCorridor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[#0F172A]">Add International Corridor</h3>
            <p className="mt-1 text-sm text-slate-500">Create a new NGN → destination corridor. It will be audited and requires approval.</p>
            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Source Country<input value={newCorridor.sourceCountry} onChange={(e) => setNewCorridor({ ...newCorridor, sourceCountry: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="NG" /></label>
                <label className="text-sm">Destination Country<input value={newCorridor.destinationCountry} onChange={(e) => setNewCorridor({ ...newCorridor, destinationCountry: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="US" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Source Currency<input value={newCorridor.sourceCurrency} onChange={(e) => setNewCorridor({ ...newCorridor, sourceCurrency: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="NGN" /></label>
                <label className="text-sm">Destination Currency<input value={newCorridor.destinationCurrency} onChange={(e) => setNewCorridor({ ...newCorridor, destinationCurrency: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="USD" /></label>
              </div>
              {/* Flutterwave is the only option, and Paystack is deliberately
                  not listed: it settles Nigerian merchants in NGN and has no
                  outbound international payout product, so a corridor pointed
                  at it would be accepted here and then fail at payout. */}
              <label className="text-sm">Provider Code
                <select value={newCorridor.providerCode} onChange={(e) => setNewCorridor({ ...newCorridor, providerCode: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option>FLUTTERWAVE</option></select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Min Amount<input value={newCorridor.minAmount} onChange={(e) => setNewCorridor({ ...newCorridor, minAmount: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
                <label className="text-sm">Max Amount<input value={newCorridor.maxAmount} onChange={(e) => setNewCorridor({ ...newCorridor, maxAmount: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setShowAddCorridor(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">Cancel</button>
              <button onClick={createCorridor} disabled={creating} className="rounded-lg bg-[#012A9D] px-4 py-2 text-sm font-medium text-white hover:bg-[#011E7A] disabled:opacity-50">{creating ? "Creating…" : "Create Corridor"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
