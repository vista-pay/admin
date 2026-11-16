"use client";

/**
 * Subscribers: every community and the tier it is on, with the admin-side
 * move between tiers.
 *
 * Every community is on a plan — enrolled on the base plan at creation and
 * re-enrolled when a paid one ends — so the "on no plan" count is an anomaly
 * the page flags rather than a tier it describes.
 *
 * Changing a plan here follows the exact billing semantics the community
 * gets on its own Billing page — an upgrade debits the community wallet
 * immediately, a downgrade waits for the paid period to end unless forced —
 * which is why the confirm step spells out what will happen before saving.
 */

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import { AdminSelect } from "@/components/ui/admin-select";

type PlanOption = {
  planId: string;
  code: string;
  name: string;
  isActive: boolean;
  price: string;
  currencyCode: string;
  billingPeriod: string;
  trialDays: number;
  communities: number;
};

type SubscriberRow = {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: string;
  createdAt: string;
  memberCount: number;
  ajoGroupCount: number;
  subscription: {
    id: string;
    status: string;
    plan: { id: string; code: string; name: string; price: string; currencyCode: string; billingPeriod: string };
    currentPeriodStart: string;
    currentPeriodEnd: string;
    graceEndsAt: string | null;
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    autoRenew: boolean;
    pendingPlan: { id: string; code: string; name: string; effectiveAt: string | null } | null;
    dedicatedSupport: boolean;
  } | null;
};

type Listing = {
  items: SubscriberRow[];
  total: number;
  page: number;
  limit: number;
  summary: {
    totalCommunities: number;
    subscribed: number;
    unsubscribed: number;
    byPlan: PlanOption[];
  };
};

const money = (value: string, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—");

const STATUS_TONES: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  TRIALING: "bg-blue-50 text-blue-700",
  PAST_DUE: "bg-amber-50 text-amber-800",
  GRACE: "bg-amber-50 text-amber-800",
};

export default function CommunitySubscriptionsPage() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  // The read-only detail dialog: everything the current subscription says.
  const [viewing, setViewing] = useState<SubscriberRow | null>(null);
  // The change-plan dialog. `target` is the community being moved.
  const [target, setTarget] = useState<SubscriberRow | null>(null);
  const [chosenPlan, setChosenPlan] = useState("");
  const [immediate, setImmediate] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await adminApi.listCommunitySubscribers({
        search: query || undefined,
        planId: planFilter || undefined,
        page,
        limit: 25,
      });
      setListing(response.data as Listing);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load subscribers");
    }
  }, [query, planFilter, page]);

  useEffect(() => {
    // Every setState here runs after the fetch settles, not during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const plans = listing?.summary.byPlan ?? [];
  const activePlans = plans.filter((plan) => plan.isActive);

  function openChange(row: SubscriberRow) {
    setTarget(row);
    setChosenPlan("");
    setImmediate(false);
    setReason("");
  }

  const chosen = activePlans.find((plan) => plan.planId === chosenPlan) ?? null;
  const currentPrice = target?.subscription ? Number(target.subscription.plan.price) : null;
  const direction =
    chosen === null
      ? null
      : currentPrice === null
        ? "start"
        : Number(chosen.price) > currentPrice
          ? "upgrade"
          : Number(chosen.price) < currentPrice
            ? "downgrade"
            : "sideways";

  async function submitChange() {
    if (!target || !chosen || reason.trim().length < 5) return;
    setBusy(true);
    setError("");
    try {
      await adminApi.changeCommunityPlan(target.id, {
        planId: chosen.planId,
        immediate: immediate || undefined,
        reason: reason.trim(),
      });
      setToast(`${target.name} → ${chosen.name}.`);
      setTarget(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the plan");
    } finally {
      setBusy(false);
    }
  }

  const pages = listing ? Math.max(1, Math.ceil(listing.total / listing.limit)) : 1;

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-black">Subscribers</h1>
        <p className="mt-1 text-sm text-slate-600">
          Which community is on which tier, and the admin-side move between tiers. Billing follows the
          same rules as the community changing plan itself.
        </p>
      </header>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {listing && (
        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Communities</p>
            <p className="mt-1 text-xl font-black">{listing.summary.totalCommunities}</p>
          </article>
          {/* Should be zero: every community is enrolled on the base plan at
              creation, and cancelling re-enrols. A non-zero count means rows
              predating that rule — run `pnpm subscriptions:backfill`. */}
          <article
            className={`rounded-2xl border p-4 ${
              listing.summary.unsubscribed > 0
                ? "border-amber-300 bg-amber-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <p
              className={`text-[11px] font-bold uppercase tracking-wide ${
                listing.summary.unsubscribed > 0 ? "text-amber-800" : "text-slate-500"
              }`}
            >
              On no plan
            </p>
            <p className="mt-1 text-xl font-black">{listing.summary.unsubscribed}</p>
            {listing.summary.unsubscribed > 0 && (
              <p className="mt-1 text-[10px] leading-3 text-amber-800">needs backfill</p>
            )}
          </article>
          {plans.map((plan) => (
            <article key={plan.planId} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">{plan.name}</p>
              <p className="mt-1 text-xl font-black">{plan.communities}</p>
            </article>
          ))}
        </section>
      )}

      <section className="mt-5 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}
          className="flex items-center gap-2"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, slug or email…"
            className="h-10 w-[260px] rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Search</button>
        </form>
        <AdminSelect value={planFilter} onChange={(e) => { setPage(1); setPlanFilter(e.target.value); }}>
          <option value="">All plans</option>
          <option value="none">On no plan</option>
          {plans.map((plan) => (
            <option key={plan.planId} value={plan.planId}>{plan.name}</option>
          ))}
        </AdminSelect>
      </section>

      <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Community</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Period ends</th>
              <th className="px-4 py-3">Pending change</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(listing?.items ?? []).map((row) => (
              <tr key={row.id} className="border-b border-slate-50">
                <td className="px-4 py-3">
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-xs text-slate-500">{row.email}</p>
                </td>
                <td className="px-4 py-3">{row.memberCount}</td>
                <td className="px-4 py-3">
                  {row.subscription ? (
                    <>
                      <p className="font-semibold">{row.subscription.plan.name}</p>
                      <p className="text-xs text-slate-500">
                        {money(row.subscription.plan.price, row.subscription.plan.currencyCode)} · {row.subscription.plan.billingPeriod.toLowerCase()}
                        {row.subscription.dedicatedSupport && " · dedicated support"}
                      </p>
                    </>
                  ) : (
                    <span className="font-semibold text-amber-700">On no plan</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.subscription ? (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONES[row.subscription.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {row.subscription.status}
                      {row.subscription.cancelAtPeriodEnd && " · ending"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">NO PLAN</span>
                  )}
                </td>
                <td className="px-4 py-3">{day(row.subscription?.currentPeriodEnd ?? null)}</td>
                <td className="px-4 py-3">
                  {row.subscription?.pendingPlan
                    ? `${row.subscription.pendingPlan.name} on ${day(row.subscription.pendingPlan.effectiveAt)}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <button
                      onClick={() => setViewing(row)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      View
                    </button>
                    <button
                      onClick={() => openChange(row)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {row.subscription ? "Change plan" : "Start subscription"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {listing && listing.items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">No communities match.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {listing && pages > 1 && (
        <nav className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">Previous</button>
          <span className="text-slate-600">Page {listing.page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">Next</button>
        </nav>
      )}

      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal
          onClick={() => setViewing(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="flex items-start gap-3 border-b border-slate-100 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#012A9D]/10 text-sm font-black text-[#012A9D]">
                {viewing.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-black">{viewing.name}</h2>
                  {viewing.subscription ? (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONES[viewing.subscription.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {viewing.subscription.status}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">NO PLAN</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{viewing.email}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {viewing.memberCount} {viewing.memberCount === 1 ? "member" : "members"} · {viewing.ajoGroupCount}{" "}
                  {viewing.ajoGroupCount === 1 ? "Ajo group" : "Ajo groups"} · since {day(viewing.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setViewing(null)}
                aria-label="Close"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4 L12 12 M12 4 L4 12" />
                </svg>
              </button>
            </div>

            {/* ── Body ── */}
            <div className="p-5">
              {!viewing.subscription ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
                  <span className="text-2xl" aria-hidden>₦</span>
                  <p className="mt-2 text-sm font-bold text-slate-800">No paid plan yet</p>
                  <p className="mx-auto mt-1 max-w-[36ch] text-xs leading-5 text-slate-500">
                    This community is on the free allowance — no billing period and no invoices. Starting a
                    subscription moves it onto a tier with the standard billing rules.
                  </p>
                </div>
              ) : (
                (() => {
                  const sub = viewing.subscription;
                  const daysLeft = Math.max(
                    0,
                    Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / 86_400_000),
                  );
                  const periodPct = (() => {
                    const start = new Date(sub.currentPeriodStart).getTime();
                    const end = new Date(sub.currentPeriodEnd).getTime();
                    if (end <= start) return 100;
                    return Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (end - start)) * 100)));
                  })();
                  const facts: Array<{ label: string; value: React.ReactNode }> = [
                    ...(sub.trialEndsAt ? [{ label: "Trial ends", value: day(sub.trialEndsAt) }] : []),
                    ...(sub.graceEndsAt ? [{ label: "Grace period ends", value: day(sub.graceEndsAt) }] : []),
                    {
                      label: "Renewal",
                      value: sub.cancelAtPeriodEnd
                        ? "Ends at period end — cancelled"
                        : sub.autoRenew
                          ? "Renews automatically"
                          : "Does not auto-renew",
                    },
                    {
                      label: "Pending change",
                      value: sub.pendingPlan ? `${sub.pendingPlan.name} · ${day(sub.pendingPlan.effectiveAt)}` : "None",
                    },
                    {
                      label: "Dedicated support",
                      value: sub.dedicatedSupport ? "Included" : "Not included",
                    },
                  ];
                  return (
                    <>
                      {/* The plan, stated like a bill. */}
                      <div className="flex items-center justify-between rounded-xl bg-[#012A9D]/5 p-4">
                        <div>
                          <p className="text-sm font-black text-slate-900">{sub.plan.name}</p>
                          <p className="text-xs text-slate-500">{sub.plan.code}</p>
                        </div>
                        <p className="text-right">
                          <span className="text-lg font-black tabular-nums text-slate-900">
                            {money(sub.plan.price, sub.plan.currencyCode)}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            per {({ MONTHLY: "month", QUARTERLY: "quarter", YEARLY: "year", ANNUAL: "year" } as Record<string, string>)[sub.plan.billingPeriod] ?? sub.plan.billingPeriod.toLowerCase()}
                          </span>
                        </p>
                      </div>

                      {/* Where the period stands. */}
                      <div className="mt-3 rounded-xl border border-slate-100 p-4">
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="font-bold uppercase tracking-wide text-slate-500">Current period</span>
                          <span className="font-semibold text-slate-700">
                            {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-[#2563EB]" style={{ width: `${periodPct}%` }} />
                        </div>
                        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-slate-400">
                          <span>{day(sub.currentPeriodStart)}</span>
                          <span>{day(sub.currentPeriodEnd)}</span>
                        </div>
                      </div>

                      <dl className="mt-3 overflow-hidden rounded-xl border border-slate-100">
                        {facts.map((fact, index) => (
                          <div
                            key={fact.label}
                            className={`flex items-center justify-between gap-4 px-4 py-2.5 ${index % 2 ? "bg-slate-50/60" : "bg-white"}`}
                          >
                            <dt className="text-xs font-semibold text-slate-500">{fact.label}</dt>
                            <dd className="text-right text-xs font-semibold text-slate-800">{fact.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  );
                })()
              )}
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4 pl-5">
              <a
                href={`/communities/${viewing.id}`}
                className="whitespace-nowrap text-xs font-bold text-[#012A9D] hover:underline"
              >
                Open community profile →
              </a>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setViewing(null)}
                  className="whitespace-nowrap rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const row = viewing;
                    setViewing(null);
                    openChange(row);
                  }}
                  className="whitespace-nowrap rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-bold text-white hover:bg-[#1D4ED8]"
                >
                  {viewing.subscription ? "Change plan" : "Start subscription"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-black">
              {target.subscription ? "Change plan" : "Start subscription"} · {target.name}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Currently {target.subscription ? `${target.subscription.plan.name} (${target.subscription.status})` : "on no plan — every community should be on one"}.
            </p>

            <label className="mt-4 block text-xs font-bold text-slate-600">New plan</label>
            <AdminSelect containerClassName="mt-1 w-full" value={chosenPlan} onChange={(e) => setChosenPlan(e.target.value)}>
              <option value="">Choose a plan…</option>
              {activePlans
                .filter((plan) => plan.planId !== target.subscription?.plan.id)
                .map((plan) => (
                  <option key={plan.planId} value={plan.planId}>
                    {plan.name} — {money(plan.price, plan.currencyCode)}/{plan.billingPeriod.toLowerCase()}
                  </option>
                ))}
            </AdminSelect>

            {/* What will actually happen, stated before the money moves. */}
            {chosen && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                {direction === "start" && (chosen.trialDays > 0
                  ? `Starts a ${chosen.trialDays}-day trial; the first invoice is billed when the trial ends.`
                  : `Starts the subscription and bills ${money(chosen.price, chosen.currencyCode)} from the community's wallet now.`)}
                {direction === "upgrade" && `Applies immediately and bills ${money(chosen.price, chosen.currencyCode)} from the community's wallet for a fresh period starting today.`}
                {direction === "downgrade" && (immediate
                  ? "Applies immediately — the community loses its current plan's limits today and is billed for the new plan now."
                  : "Takes effect when the paid period ends; nothing is billed until renewal.")}
                {direction === "sideways" && "Same price: applies on the standard schedule."}
              </p>
            )}

            {chosen && direction === "downgrade" && (
              <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={immediate} onChange={(e) => setImmediate(e.target.checked)} />
                Apply the downgrade immediately instead of at renewal
              </label>
            )}

            <label className="mt-3 block text-xs font-bold text-slate-600">Reason (recorded in both audit trails)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Why this community is being moved…"
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button>
              <button
                onClick={submitChange}
                disabled={busy || !chosen || reason.trim().length < 5}
                className="rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <p className="fixed bottom-5 right-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow">{toast}</p>}
    </main>
  );
}
