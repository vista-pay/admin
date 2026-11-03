"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Plan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  price: string;
  currencyCode: string;
  billingPeriod: string;
  maxMembers?: number | null;
  maxStaffSeats?: number | null;
  maxAjoGroups?: number | null;
  isActive: boolean;
};

export default function CommunityPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<Plan[]>("/admin/communities/subscription-plans/catalog");
      setPlans(response.data);
      setDrafts(Object.fromEntries(response.data.map((plan) => [plan.id, plan.price])));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load plans");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(plan: Plan, isActive = plan.isActive) {
    setBusy(plan.id);
    try {
      await apiFetch(`/admin/communities/subscription-plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          price: drafts[plan.id] ?? plan.price,
          isActive,
          reason: "Community subscription plan updated in the admin console",
        }),
      });
      setToast(`${plan.name} updated.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update plan");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-black">Community subscription plans</h1>
        <p className="mt-1 text-sm text-slate-600">Set the live price shown on each community&apos;s Billing &amp; plan page.</p>
      </header>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <section className="mt-5 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.id} className="rounded-2xl border bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="font-black">{plan.name}</h2><p className="mt-1 text-xs text-slate-500">{plan.description}</p></div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${plan.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{plan.isActive ? "LIVE" : "HIDDEN"}</span>
            </div>
            <label className="mt-5 block text-xs font-bold text-slate-600">Price ({plan.currencyCode} / {plan.billingPeriod.toLowerCase()})
              <input type="number" min="0" step="100" value={drafts[plan.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [plan.id]: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border px-3 text-lg font-bold" />
            </label>
            <dl className="mt-4 space-y-1 text-xs text-slate-600"><div className="flex justify-between"><dt>Members</dt><dd>{plan.maxMembers ?? "Unlimited"}</dd></div><div className="flex justify-between"><dt>Staff seats</dt><dd>{plan.maxStaffSeats ?? "Unlimited"}</dd></div><div className="flex justify-between"><dt>Ajo groups</dt><dd>{plan.maxAjoGroups ?? "Unlimited"}</dd></div></dl>
            <div className="mt-5 grid grid-cols-2 gap-2"><button disabled={busy === plan.id || !drafts[plan.id]} onClick={() => void save(plan)} className="rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy === plan.id ? "Saving…" : "Save price"}</button><button disabled={busy === plan.id} onClick={() => void save(plan, !plan.isActive)} className="rounded-xl border px-3 py-2.5 text-sm font-bold">{plan.isActive ? "Hide" : "Publish"}</button></div>
          </article>
        ))}
      </section>
      {!plans.length && !error && <p className="mt-10 text-center text-sm text-slate-500">No community plans configured.</p>}
      {toast && <div className="fixed bottom-5 right-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-xl">✓ {toast}</div>}
    </main>
  );
}
