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
  /** Live subscriptions on this tier — how far an edit here reaches. */
  communities?: number;
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

/**
 * A community the saved edit will reach at its next renewal. The server sends
 * these instead of refusing the edit: a tighter limit never bites mid-period.
 */
type Warning = {
  communityId: string;
  community: string;
  field: string;
  noun: string;
  limit: number;
  used: number;
  message: string;
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

const naira = (value: string) => {
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
};

const period = (value: string) =>
  ({ MONTHLY: "month", QUARTERLY: "quarter", ANNUAL: "year" })[value] ?? value.toLowerCase();

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
  const [openFeatures, setOpenFeatures] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  /** Keyed by plan id: what the last save on that plan will reach, and when. */
  const [impact, setImpact] = useState<Record<string, Warning[]>>({});

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

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, FeatureDefinition[]>();
    for (const feature of catalogue) {
      const list = byGroup.get(feature.group) ?? [];
      list.push(feature);
      byGroup.set(feature.group, list);
    }
    return [...byGroup.entries()];
  }, [catalogue]);

  const enforced = catalogue.filter((feature) => feature.enforced);

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
      const response = await apiFetch<{ warnings?: Warning[] }>(
        `/admin/communities/subscription-plans/${plan.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...body,
            reason: "Community subscription plan updated in the admin console",
          }),
        },
      );
      // The save already happened. Warnings describe who it reaches at their
      // next renewal — they are an outcome, never a reason it did not stick.
      setImpact((current) => ({ ...current, [plan.id]: response.data?.warnings ?? [] }));
      setToast(`${plan.name} saved.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update plan");
    } finally {
      setBusy(null);
    }
  }

  /**
   * The plan every community lands on — the first active, self-serve one by
   * display order. Mirrors `SubscriptionsService.defaultPlan` so the badge
   * below names the same plan the server enrols on.
   */
  const basePlanId =
    plans.filter((plan) => plan.isActive && !plan.isNegotiated)[0]?.id ?? null;

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-950">Community subscription plans</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Price, limits and features for every tier on a community&apos;s Billing &amp; plan page.
            Every community is on one of these — there is no plan-less state.
          </p>
        </div>
        <p className="shrink-0 text-xs font-semibold text-slate-500">
          {plans.length} tier{plans.length === 1 ? "" : "s"} ·{" "}
          {plans.filter((plan) => plan.isActive).length} live
        </p>
      </header>

      {/* One disclosure instead of two permanent banners: the rules matter at
          the moment of saving, not on every visit to the page. */}
      <details className="group mt-5 rounded-xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-bold text-slate-800">
            How an edit reaches communities already on a tier
          </span>
          <span className="text-xs font-bold text-blue-600 group-open:hidden">Read</span>
          <span className="hidden text-xs font-bold text-slate-500 group-open:inline">Hide</span>
        </summary>
        <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-[13px] leading-6 text-slate-600">
          <p>
            <strong className="text-slate-900">Anything you add</strong> — a feature, a higher
            limit, API access — reaches them immediately.{" "}
            <strong className="text-slate-900">Anything you remove</strong> takes effect at their
            next renewal, because they have already paid for the period they are in. A price change
            applies to the next invoice. Nothing here is ever blocked by a community being on the
            tier; where a reduction will bite, the page names who and when after you save.
          </p>
          {catalogue.length > 0 && enforced.length < catalogue.length && (
            <p>
              <strong className="text-slate-900">
                {enforced.length === 0 ? "Features are descriptive today." : "Most features are still descriptive."}
              </strong>{" "}
              {enforced.length === 0
                ? "They set what each plan advertises on the community billing page. No part of the product currently refuses an action because a plan lacks a feature — only the member, staff-seat and Ajo-group limits are enforced."
                : `Only ${enforced.map((f) => f.label).join(", ")} currently gates anything, alongside the member, staff-seat and Ajo-group limits. The rest set what each plan advertises, nothing more.`}
            </p>
          )}
        </div>
      </details>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        {plans.map((plan) => {
          const draft = drafts[plan.id];
          if (!draft) return null;
          const dirty = Object.keys(changedFields(plan, draft)).length > 0;
          const warnings = impact[plan.id] ?? [];
          const showFeatures = openFeatures[plan.id] ?? false;
          const role = plan.isNegotiated
            ? { label: "CONTACT SALES", tone: "bg-violet-50 text-violet-700" }
            : plan.id === basePlanId
              ? { label: "BASE PLAN", tone: "bg-blue-50 text-blue-700" }
              : null;

          return (
            <article
              key={plan.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              {/* Identity strip: what this tier is, who is on it, what it
                  costs — readable before anything is edited. */}
              <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-black text-slate-950">{plan.name}</h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${plan.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
                      >
                        {plan.isActive ? "LIVE" : "HIDDEN"}
                      </span>
                      {role && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${role.tone}`}>
                          {role.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                      {plan.code}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-black text-slate-950">{naira(plan.price)}</p>
                    <p className="text-[11px] text-slate-500">per {period(plan.billingPeriod)}</p>
                  </div>
                </div>
                {/* Who this edit reaches. A price or feature change is abstract
                    until you know how many cooperatives are on the other side. */}
                <p className="mt-2 text-xs font-semibold text-slate-600">
                  {(plan.communities ?? 0) === 0 ? (
                    <span className="text-slate-400">No communities on this tier</span>
                  ) : (
                    <>
                      {plan.communities} {plan.communities === 1 ? "community" : "communities"} on
                      this tier
                    </>
                  )}
                </p>
              </div>

              <div className="flex flex-1 flex-col gap-5 p-5">
                {plan.isNegotiated && (
                  <p className="rounded-xl bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-900">
                    Agreed with each community rather than sold self-serve. Communities see
                    &ldquo;Custom&rdquo; and a Contact support button; the price below is only what
                    an admin applies after that conversation.
                  </p>
                )}
                {plan.id === basePlanId && (
                  <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
                    Every community starts here and returns here when a paid plan ends. Pricing it
                    above ₦0 charges every community on it.
                  </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Plan name" className="sm:col-span-2">
                    <input
                      value={draft.name}
                      onChange={(event) => edit(plan.id, { name: event.target.value })}
                      className={input}
                    />
                  </Field>
                  <Field label="Description" className="sm:col-span-2">
                    <textarea
                      value={draft.description}
                      onChange={(event) => edit(plan.id, { description: event.target.value })}
                      rows={2}
                      maxLength={300}
                      placeholder="One line shown under the plan name"
                      className={`${input} h-auto py-2 leading-5`}
                    />
                  </Field>
                  <Field label={`Price (${plan.currencyCode} / ${period(plan.billingPeriod)})`}>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={draft.price}
                      onChange={(event) => edit(plan.id, { price: event.target.value })}
                      className={input}
                    />
                  </Field>
                  <Field label="Display order">
                    <input
                      type="number"
                      min="0"
                      value={draft.sortOrder}
                      onChange={(event) => edit(plan.id, { sortOrder: event.target.value })}
                      className={input}
                    />
                  </Field>
                </div>

                <fieldset>
                  <Legend hint="blank means unlimited">Limits</Legend>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    {(
                      [
                        ["maxMembers", "Members"],
                        ["maxStaffSeats", "Staff seats"],
                        ["maxAjoGroups", "Ajo groups"],
                      ] as const
                    ).map(([field, label]) => (
                      <Field key={field} label={label}>
                        <input
                          type="number"
                          min="1"
                          value={draft[field]}
                          onChange={(event) =>
                            edit(plan.id, { [field]: event.target.value } as Partial<Draft>)
                          }
                          placeholder="Unlimited"
                          className={input}
                        />
                      </Field>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <Legend hint="days">Billing cycle</Legend>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <Field label="Free trial">
                      <input
                        type="number"
                        min="0"
                        max="365"
                        value={draft.trialDays}
                        onChange={(event) => edit(plan.id, { trialDays: event.target.value })}
                        className={input}
                      />
                    </Field>
                    <Field label="Grace after a failed charge">
                      <input
                        type="number"
                        min="0"
                        max="90"
                        value={draft.gracePeriodDays}
                        onChange={(event) => edit(plan.id, { gracePeriodDays: event.target.value })}
                        className={input}
                      />
                    </Field>
                  </div>
                </fieldset>

                {/* Collapsed by default: fifteen checkboxes per card turned the
                    page into a wall. The count says what is on without opening. */}
                <fieldset className="rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenFeatures((current) => ({ ...current, [plan.id]: !showFeatures }))
                    }
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Features{" "}
                      <span className="font-semibold normal-case tracking-normal text-slate-400">
                        — {draft.features.length} of {catalogue.length} on
                      </span>
                    </span>
                    <span className="text-xs font-bold text-blue-600">
                      {showFeatures ? "Done" : "Edit"}
                    </span>
                  </button>

                  {!showFeatures && (
                    <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                      {draft.features.length === 0 && !draft.allowsApiAccess ? (
                        <span className="text-xs text-slate-400">No features on this tier</span>
                      ) : (
                        draft.features.map((slug) => {
                          const feature = catalogue.find((item) => item.slug === slug);
                          return (
                            <span
                              key={slug}
                              className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700"
                            >
                              {feature?.label ?? slug}
                            </span>
                          );
                        })
                      )}
                      {/* The entitlement switch lives inside the editor, so it
                          has to be visible from the collapsed summary too. */}
                      {draft.allowsApiAccess && (
                        <span className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
                          API access allowed
                        </span>
                      )}
                    </div>
                  )}

                  {showFeatures && (
                    <div className="space-y-4 border-t border-slate-100 px-4 py-3">
                      {groups.map(([group, features]) => (
                        <div key={group}>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {group}
                          </p>
                          <div className="mt-1.5 space-y-1">
                            {features.map((feature) => (
                              <label
                                key={feature.slug}
                                className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={draft.features.includes(feature.slug)}
                                  onChange={() => toggleFeature(plan.id, feature.slug)}
                                  className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
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
                                  <span className="block text-[11px] leading-4 text-slate-500">
                                    {feature.description}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border-t border-slate-100 px-2 pb-1 pt-3 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={draft.allowsApiAccess}
                          onChange={(event) => edit(plan.id, { allowsApiAccess: event.target.checked })}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                        />
                        <span>
                          <span className="block text-[13px] font-semibold text-slate-800">
                            Allow API access
                          </span>
                          <span className="block text-[11px] leading-4 text-slate-500">
                            Carried on the plan&apos;s entitlements, separate from the API access
                            feature bullet above.
                          </span>
                        </span>
                      </label>
                    </div>
                  )}
                </fieldset>

                {warnings.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs font-bold text-amber-900">
                      Saved. {warnings.length} communit{warnings.length === 1 ? "y is" : "ies are"}{" "}
                      above a new limit
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {warnings.map((warning) => (
                        <li
                          key={`${warning.communityId}-${warning.field}`}
                          className="text-[12px] leading-5 text-amber-900"
                        >
                          <strong>{warning.community}</strong> has {warning.used} {warning.noun} and
                          the new cap is {warning.limit}. It keeps {warning.used} until its current
                          period ends; the cap applies from its next renewal.
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => setImpact((current) => ({ ...current, [plan.id]: [] }))}
                      className="mt-2 text-[11px] font-bold text-amber-800 hover:underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
                <span className="mr-auto text-[11px] font-semibold text-slate-500">
                  {dirty ? "Unsaved changes" : "All changes saved"}
                </span>
                {dirty && (
                  <button
                    onClick={() => edit(plan.id, toDraft(plan))}
                    className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
                  >
                    Discard
                  </button>
                )}
                <button
                  disabled={busy === plan.id}
                  onClick={() => void save(plan, { isActive: !plan.isActive })}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"
                >
                  {plan.isActive ? "Hide" : "Publish"}
                </button>
                <button
                  disabled={busy === plan.id || !dirty}
                  onClick={() => void save(plan)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                >
                  {busy === plan.id ? "Saving…" : "Save changes"}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {!plans.length && !error && (
        <p className="mt-10 text-center text-sm text-slate-500">No community plans configured.</p>
      )}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-xl">
          ✓ {toast}
        </div>
      )}
    </main>
  );
}

const input =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Legend({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <legend className="text-xs font-bold uppercase tracking-wide text-slate-500">
      {children}
      {hint && <span className="ml-1 font-semibold normal-case tracking-normal text-slate-400">— {hint}</span>}
    </legend>
  );
}
