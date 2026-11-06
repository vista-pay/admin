"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  features: string[];
  trialDays: number;
  gracePeriodDays: number;
  allowsApiAccess: boolean;
  isActive: boolean;
  isNegotiated: boolean;
  sortOrder: number;
};

type FeatureDefinition = {
  slug: string;
  label: string;
  description: string;
  group: string;
  /** Whether a code path gates on this feature today. */
  enforced: boolean;
};

/** The editable shape of a plan, as the form holds it. */
type Draft = {
  name: string;
  description: string;
  price: string;
  /** Empty string means unlimited, which the API stores as null. */
  maxMembers: string;
  maxStaffSeats: string;
  maxAjoGroups: string;
  trialDays: string;
  gracePeriodDays: string;
  allowsApiAccess: boolean;
  sortOrder: string;
  features: string[];
};

const limitToField = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

const fieldToLimit = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
};

function toDraft(plan: Plan): Draft {
  return {
    name: plan.name,
    description: plan.description ?? "",
    price: plan.price,
    maxMembers: limitToField(plan.maxMembers),
    maxStaffSeats: limitToField(plan.maxStaffSeats),
    maxAjoGroups: limitToField(plan.maxAjoGroups),
    trialDays: String(plan.trialDays),
    gracePeriodDays: String(plan.gracePeriodDays),
    allowsApiAccess: plan.allowsApiAccess,
    sortOrder: String(plan.sortOrder),
    features: [...plan.features],
  };
}

/** Only what the operator actually changed, so a save cannot blank a field. */
function changedFields(plan: Plan, draft: Draft) {
  const body: Record<string, unknown> = {};
  if (draft.name.trim() !== plan.name) body.name = draft.name.trim();
  if (draft.description.trim() !== (plan.description ?? "")) body.description = draft.description.trim();
  if (draft.price !== plan.price) body.price = draft.price;
  if (fieldToLimit(draft.maxMembers) !== (plan.maxMembers ?? null)) body.maxMembers = fieldToLimit(draft.maxMembers);
  if (fieldToLimit(draft.maxStaffSeats) !== (plan.maxStaffSeats ?? null)) body.maxStaffSeats = fieldToLimit(draft.maxStaffSeats);
  if (fieldToLimit(draft.maxAjoGroups) !== (plan.maxAjoGroups ?? null)) body.maxAjoGroups = fieldToLimit(draft.maxAjoGroups);
  if (Number(draft.trialDays) !== plan.trialDays) body.trialDays = Number(draft.trialDays);
  if (Number(draft.gracePeriodDays) !== plan.gracePeriodDays) body.gracePeriodDays = Number(draft.gracePeriodDays);
  if (draft.allowsApiAccess !== plan.allowsApiAccess) body.allowsApiAccess = draft.allowsApiAccess;
  if (Number(draft.sortOrder) !== plan.sortOrder) body.sortOrder = Number(draft.sortOrder);

  // Compared as sets: the server stores features in catalogue order, so a
  // reordering is not a change and must not look like one.
  const before = [...plan.features].sort().join(",");
  const after = [...draft.features].sort().join(",");
  if (before !== after) body.features = draft.features;

  return body;
}

export default function CommunityPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [catalogue, setCatalogue] = useState<FeatureDefinition[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<{ plans: Plan[]; featureCatalogue: FeatureDefinition[] }>(
        "/admin/communities/subscription-plans/catalog",
      );
      setPlans(response.data.plans);
      setCatalogue(response.data.featureCatalogue);
      setDrafts(Object.fromEntries(response.data.plans.map((plan) => [plan.id, toDraft(plan)])));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load plans");
    }
  }, []);

  useEffect(() => {
    // The rule reads `load` as a synchronous setState in the effect body. It
    // is not: every setState inside it runs after an await, once the fetch has
    // settled, so there is no render-phase update to avoid here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, FeatureDefinition[]>();
    for (const feature of catalogue) {
      const list = byGroup.get(feature.group) ?? [];
      list.push(feature);
      byGroup.set(feature.group, list);
    }
    return [...byGroup.entries()];
  }, [catalogue]);

  const anyEnforced = catalogue.some((feature) => feature.enforced);

  function edit(planId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [planId]: { ...current[planId], ...patch } }));
  }

  function toggleFeature(planId: string, slug: string) {
    setDrafts((current) => {
      const draft = current[planId];
      const has = draft.features.includes(slug);
      return {
        ...current,
        [planId]: {
          ...draft,
          features: has ? draft.features.filter((f) => f !== slug) : [...draft.features, slug],
        },
      };
    });
  }

  async function save(plan: Plan, overrides: Record<string, unknown> = {}) {
    const body = { ...changedFields(plan, drafts[plan.id]), ...overrides };
    if (Object.keys(body).length === 0) {
      setToast(`${plan.name} has no unsaved changes.`);
      return;
    }
    setBusy(plan.id);
    setError("");
    try {
      await apiFetch(`/admin/communities/subscription-plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...body,
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
    <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-black">Community subscription plans</h1>
        <p className="mt-1 text-sm text-slate-600">
          Price, limits and features for every tier shown on a community&apos;s Billing &amp; plan page.
        </p>
      </header>

      {/* Said plainly rather than left to be discovered: ticking a feature
          changes what the pricing page advertises, and nothing more, until
          entitlement checks exist for it. */}
      {!anyEnforced && catalogue.length > 0 && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Features are descriptive today.</strong> They set what each plan advertises on the
          community billing page. No part of the product currently refuses an action because a plan
          lacks a feature — only the member, staff-seat and Ajo-group limits below are enforced.
        </p>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        {plans.map((plan) => {
          const draft = drafts[plan.id];
          if (!draft) return null;
          const dirty = Object.keys(changedFields(plan, draft)).length > 0;

          return (
            <article key={plan.id} className="rounded-2xl border bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <input
                    value={draft.name}
                    onChange={(event) => edit(plan.id, { name: event.target.value })}
                    aria-label={`${plan.code} plan name`}
                    className="w-full rounded-lg border-transparent bg-transparent text-lg font-black hover:border-slate-200 focus:border-slate-300 focus:bg-white"
                  />
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    {plan.code}
                    {plan.isNegotiated && " · negotiated"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${plan.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                >
                  {plan.isActive ? "LIVE" : "HIDDEN"}
                </span>
              </div>

              <label className="mt-3 block text-xs font-bold text-slate-600">
                Description
                <textarea
                  value={draft.description}
                  onChange={(event) => edit(plan.id, { description: event.target.value })}
                  rows={2}
                  maxLength={300}
                  placeholder="One line shown under the plan name"
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal"
                />
              </label>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold text-slate-600">
                  Price ({plan.currencyCode} / {plan.billingPeriod.toLowerCase()})
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={draft.price}
                    onChange={(event) => edit(plan.id, { price: event.target.value })}
                    className="mt-1 h-11 w-full rounded-xl border px-3 text-lg font-bold"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Display order
                  <input
                    type="number"
                    min="0"
                    value={draft.sortOrder}
                    onChange={(event) => edit(plan.id, { sortOrder: event.target.value })}
                    className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-bold"
                  />
                </label>
              </div>

              <fieldset className="mt-4">
                <legend className="text-xs font-bold text-slate-600">
                  Limits <span className="font-normal text-slate-400">— blank means unlimited</span>
                </legend>
                <div className="mt-1 grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["maxMembers", "Members"],
                      ["maxStaffSeats", "Staff seats"],
                      ["maxAjoGroups", "Ajo groups"],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="block text-[11px] font-semibold text-slate-500">
                      {label}
                      <input
                        type="number"
                        min="1"
                        value={draft[field]}
                        onChange={(event) => edit(plan.id, { [field]: event.target.value } as Partial<Draft>)}
                        placeholder="Unlimited"
                        className="mt-1 h-10 w-full rounded-xl border px-3 text-sm font-bold"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-[11px] font-semibold text-slate-500">
                  Trial days
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={draft.trialDays}
                    onChange={(event) => edit(plan.id, { trialDays: event.target.value })}
                    className="mt-1 h-10 w-full rounded-xl border px-3 text-sm font-bold"
                  />
                </label>
                <label className="block text-[11px] font-semibold text-slate-500">
                  Grace days after a failed charge
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={draft.gracePeriodDays}
                    onChange={(event) => edit(plan.id, { gracePeriodDays: event.target.value })}
                    className="mt-1 h-10 w-full rounded-xl border px-3 text-sm font-bold"
                  />
                </label>
              </div>

              <fieldset className="mt-5">
                <legend className="text-xs font-bold text-slate-600">
                  Features{" "}
                  <span className="font-normal text-slate-400">
                    — {draft.features.length} of {catalogue.length} selected
                  </span>
                </legend>
                <div className="mt-2 space-y-3">
                  {groups.map(([group, features]) => (
                    <div key={group}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {group}
                      </p>
                      <div className="mt-1 space-y-1">
                        {features.map((feature) => (
                          <label
                            key={feature.slug}
                            className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={draft.features.includes(feature.slug)}
                              onChange={() => toggleFeature(plan.id, feature.slug)}
                              className="mt-0.5 h-4 w-4 shrink-0"
                            />
                            <span className="min-w-0">
                              <span className="block text-[13px] font-semibold text-slate-800">
                                {feature.label}
                                {feature.enforced && (
                                  <span className="ml-1.5 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                                    enforced
                                  </span>
                                )}
                              </span>
                              <span className="block text-[11px] text-slate-500">
                                {feature.description}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={draft.allowsApiAccess}
                  onChange={(event) => edit(plan.id, { allowsApiAccess: event.target.checked })}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  <span className="block text-[13px] font-semibold text-slate-800">
                    Allow API access
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    Carried on the plan&apos;s entitlements, separate from the API access feature
                    bullet above.
                  </span>
                </span>
              </label>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <button
                  disabled={busy === plan.id || !dirty}
                  onClick={() => void save(plan)}
                  className="col-span-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                >
                  {busy === plan.id ? "Saving…" : dirty ? "Save changes" : "No changes"}
                </button>
                <button
                  disabled={busy === plan.id}
                  onClick={() => void save(plan, { isActive: !plan.isActive })}
                  className="rounded-xl border px-3 py-2.5 text-sm font-bold"
                >
                  {plan.isActive ? "Hide" : "Publish"}
                </button>
              </div>
              {dirty && (
                <button
                  onClick={() => edit(plan.id, toDraft(plan))}
                  className="mt-2 w-full text-center text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                >
                  Discard changes
                </button>
              )}
            </article>
          );
        })}
      </section>

      {!plans.length && !error && (
        <p className="mt-10 text-center text-sm text-slate-500">No community plans configured.</p>
      )}
      {toast && (
        <div className="fixed bottom-5 right-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-xl">
          ✓ {toast}
        </div>
      )}
    </main>
  );
}
