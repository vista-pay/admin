"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The subscriptions hub — what clicking "Subscriptions" in the sidebar opens.
 *
 * The dropdown's three children are three different jobs (define the tiers,
 * see who is on them, see what they bring in), and a first-time operator has
 * no way to know that from three bare links. This page says it: live numbers
 * across the top, then one card per area explaining what it is for, with the
 * figures that belong to it and a clear button in.
 */

type Plan = {
  id: string;
  code: string;
  name: string;
  price: string;
  currencyCode: string;
  billingPeriod: string;
  isActive: boolean;
  isNegotiated: boolean;
};

type Listing = {
  total: number;
  summary: {
    totalCommunities: number;
    subscribed: number;
    unsubscribed: number;
    byPlan: Array<{ planId: string; name: string; communities: number; isActive: boolean }>;
  };
};

type Revenue = {
  currencyCode: string;
  totals: { collected: string; outstanding: string; invoices: number; activeSubscriptions: number; mrr: string };
};

type EnterpriseEnquiry = {
  id: string;
  reference: string;
  subject: string;
  description?: string;
  status: string;
  createdAt: string;
  user: { email: string; profile: { firstName: string; lastName: string } | null } | null;
};

type TicketDetail = {
  reference: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  user: { id: string; email: string; phone: string } | null;
  messages: Array<{
    id: string;
    authorType: string;
    authorName: string;
    body: string;
    isInternal: boolean;
    createdAt: string;
  }>;
};

const money = (value: string | number, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));

export default function SubscriptionsHubPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [enquiries, setEnquiries] = useState<EnterpriseEnquiry[]>([]);
  const [openEnquiry, setOpenEnquiry] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Three sections, three permissions — a failure on one (an admin without
  // the fees tab, say) must not blank the areas they may open. Each card
  // simply shows what loaded.
  useEffect(() => {
    apiFetch<{ plans: Plan[] }>("/admin/communities/subscription-plans/catalog")
      .then((r) => setPlans(r.data.plans))
      .catch(() => setPlans(null));
    adminApi
      .listCommunitySubscribers({ page: 1, limit: 1 })
      .then((r) => setListing(r.data as Listing))
      .catch(() => setListing(null));
    adminApi
      .subscriptionRevenue(12)
      .then((r) => setRevenue(r.data as Revenue))
      .catch((e: Error) => {
        setRevenue(null);
        setError(e.message.includes("Forbidden") ? "" : e.message);
      });
    adminApi
      .enterpriseEnquiries()
      .then((r) => setEnquiries((r.data as EnterpriseEnquiry[]) ?? []))
      .catch(() => setEnquiries([]));
  }, []);

  const currency = revenue?.currencyCode ?? "NGN";
  const activePlans = plans?.filter((plan) => plan.isActive) ?? [];
  const summary = listing?.summary;

  const kpis = [
    { label: "Active subscriptions", value: revenue ? revenue.totals.activeSubscriptions.toLocaleString() : "—" },
    { label: "MRR", value: revenue ? money(revenue.totals.mrr, currency) : "—", hint: "normalised to a month" },
    { label: "Collected (12m)", value: revenue ? money(revenue.totals.collected, currency) : "—" },
    { label: "Outstanding", value: revenue ? money(revenue.totals.outstanding, currency) : "—" },
    {
      label: "Communities subscribed",
      value: summary ? `${summary.subscribed.toLocaleString()} of ${summary.totalCommunities.toLocaleString()}` : "—",
    },
  ];

  return (
    <div className="min-w-0 flex-1 bg-[#F8FAFC]">
      <header className="border-b border-[#E3E8F0] bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="mt-1 text-xs text-slate-500">
            Community subscription tiers in one place — define the plans, see who is on them, and follow what they bring
            in.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] space-y-5 p-4 sm:p-8">
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        {/* ── The numbers at a glance ── */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {kpis.map((kpi) => (
            <article key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
              <strong className="mt-2 block text-xl tracking-tight">{kpi.value}</strong>
              {kpi.hint && <p className="mt-1 text-[11px] text-slate-400">{kpi.hint}</p>}
            </article>
          ))}
        </section>

        {/* ── One card per job ── */}
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Plans</h2>
              <span className="text-lg" aria-hidden>▦</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              The tier definitions: price, billing period, member and staff limits, and which features each tier
              unlocks. The first self-serve tier is the base plan every community starts on.
            </p>
            <div className="mt-4 flex-1 space-y-2">
              {plans === null ? (
                <p className="text-xs text-slate-400">Plans are managed under Pricing &amp; fees access.</p>
              ) : (
                activePlans.map((plan) => (
                  <div key={plan.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-800">
                      {plan.name}
                      {plan.id === activePlans[0]?.id && !plan.isNegotiated && (
                        <span className="ml-1.5 text-[10px] font-normal text-blue-600">base</span>
                      )}
                    </span>
                    <span className="text-xs tabular-nums text-slate-500">
                      {plan.isNegotiated
                        ? "Custom · contact sales"
                        : Number(plan.price) === 0
                          ? "Free"
                          : `${money(plan.price, plan.currencyCode)}/${plan.billingPeriod.toLowerCase()}`}
                    </span>
                  </div>
                ))
              )}
            </div>
            <Link href="/community-plans" className="mt-4">
              <Button className="w-full">Manage plans →</Button>
            </Link>
          </article>

          <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Subscribers</h2>
              <span className="text-lg" aria-hidden>♜</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Which community is on which tier, since when, and the controls to move one — an admin-side plan change
              bills exactly as if the community changed it themselves.
            </p>
            <div className="mt-4 flex-1 space-y-2">
              {summary ? (
                <>
                  {summary.byPlan
                    .filter((row) => row.communities > 0)
                    .map((row) => (
                      <div key={row.planId} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                        <span className="text-xs font-semibold text-slate-800">{row.name}</span>
                        <Badge variant={row.isActive ? "default" : "neutral"}>
                          {row.communities.toLocaleString()} {row.communities === 1 ? "community" : "communities"}
                        </Badge>
                      </div>
                    ))}
                  {summary.unsubscribed > 0 && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
                      {summary.unsubscribed.toLocaleString()} on no plan at all. Every community
                      should be on one — run <code className="font-mono">pnpm subscriptions:backfill</code>.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-400">Loading subscriber summary…</p>
              )}
            </div>
            <Link href="/community-subscriptions" className="mt-4">
              <Button className="w-full">View subscribers →</Button>
            </Link>
          </article>

          <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Revenue</h2>
              <span className="text-lg" aria-hidden>₦</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              What the tiers actually bring in, sourced from subscription invoices — MRR, collected against invoiced per
              month, and the communities with money still open.
            </p>
            <div className="mt-4 flex-1 space-y-2">
              {revenue ? (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-800">MRR</span>
                    <span className="text-xs font-bold tabular-nums">{money(revenue.totals.mrr, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-800">Collected, last 12 months</span>
                    <span className="text-xs tabular-nums text-emerald-700">{money(revenue.totals.collected, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-800">Outstanding</span>
                    <span className={`text-xs tabular-nums ${Number(revenue.totals.outstanding) > 0 ? "font-bold text-amber-600" : "text-slate-500"}`}>
                      {money(revenue.totals.outstanding, currency)}
                    </span>
                  </div>
                  <p className="px-1 text-[11px] text-slate-400">{revenue.totals.invoices.toLocaleString()} invoices in the window.</p>
                </>
              ) : (
                <p className="text-xs text-slate-400">Revenue is visible with Pricing &amp; fees access.</p>
              )}
            </div>
            <Link href="/subscription-revenue" className="mt-4">
              <Button className="w-full">Open revenue →</Button>
            </Link>
          </article>
        </section>

        {/* ── Enterprise: the plan with no self-serve price ── */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 p-4">
            <div>
              <h2 className="text-sm font-bold">Enterprise enquiries</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Enterprise carries no published price — communities press &ldquo;Contact support&rdquo;
                on their billing page and the request lands here as a support ticket.
              </p>
            </div>
            {enquiries.length > 0 && (
              <Badge variant="warning">{enquiries.length} waiting</Badge>
            )}
          </div>
          {enquiries.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">
              No Enterprise enquiries yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-3 font-semibold">Enquiry</th>
                    <th className="p-3 font-semibold">From</th>
                    <th className="p-3 font-semibold">Raised</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {enquiries.map((enquiry) => (
                    <tr
                      key={enquiry.id}
                      onClick={() => setOpenEnquiry(enquiry.reference)}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="p-3">
                        <p className="font-semibold text-slate-900">{enquiry.subject}</p>
                        <p className="font-mono text-[10px] text-slate-400">{enquiry.reference}</p>
                      </td>
                      <td className="p-3 text-slate-600">
                        {enquiry.user?.profile
                          ? `${enquiry.user.profile.firstName} ${enquiry.user.profile.lastName}`.trim()
                          : (enquiry.user?.email ?? "—")}
                      </td>
                      <td className="p-3 tabular-nums text-slate-500">
                        {new Date(enquiry.createdAt).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="p-3">
                        <Badge variant={enquiry.status === "RESOLVED" || enquiry.status === "CLOSED" ? "success" : "warning"}>
                          {enquiry.status.toLowerCase().replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="p-3 text-right text-xs font-bold text-[#012A9D]">Open →</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {openEnquiry && (
        <EnquiryDrawer
          reference={openEnquiry}
          onClose={() => setOpenEnquiry(null)}
          onChanged={() => {
            adminApi
              .enterpriseEnquiries()
              .then((r) => setEnquiries((r.data as EnterpriseEnquiry[]) ?? []))
              .catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}

/**
 * One Enterprise enquiry, opened.
 *
 * It is a support ticket underneath, so the thread, the reply and the status
 * change go through the support desk rather than a second queue that only
 * this page knows about — an agent picking the ticket up from the other side
 * sees the same conversation.
 */
function EnquiryDrawer({
  reference,
  onClose,
  onChanged,
}: {
  reference: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    adminApi
      .supportTicket(reference)
      .then((r) => setTicket(r.data as TicketDetail))
      .catch((e: Error) => setError(e.message));
  }, [reference]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (reply.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      await adminApi.replySupportTicket(reference, {
        body: reply.trim(),
        isInternal: internal,
      });
      setReply("");
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the reply");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: string) => {
    setBusy(true);
    setError("");
    try {
      await adminApi.updateSupportTicketStatus(reference, { status });
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the status");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/45" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-black">{ticket?.subject ?? "Enterprise enquiry"}</h2>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
              {reference}
            </p>
            {ticket?.user && (
              <p className="mt-1 text-xs text-slate-500">
                {ticket.user.email} · {ticket.user.phone}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
          </button>
        </header>

        {error && <p className="m-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {!ticket ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            ticket.messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-xl p-3 text-sm ${
                  message.isInternal
                    ? "border border-dashed border-amber-300 bg-amber-50"
                    : message.authorType === "CUSTOMER"
                      ? "bg-slate-100"
                      : "bg-[#012A9D]/5"
                }`}
              >
                <p className="text-[11px] font-bold text-slate-500">
                  {message.authorName}
                  {message.isInternal && " · internal note"}
                  <span className="ml-2 font-normal text-slate-400">
                    {new Date(message.createdAt).toLocaleString("en-NG")}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-slate-800">{message.body}</p>
              </div>
            ))
          )}
        </div>

        <footer className="space-y-3 border-t border-slate-100 p-4">
          <textarea
            rows={3}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to the community, or leave an internal note…"
            className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#012A9D]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              Internal note — the community never sees this
            </label>
            <div className="flex gap-2">
              <select
                value={ticket?.status ?? "SUBMITTED"}
                onChange={(e) => void setStatus(e.target.value)}
                disabled={busy}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold"
              >
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_REVIEW">Under review</option>
                <option value="WAITING_FOR_INFO">Waiting for info</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
              <Button onClick={() => void send()} loading={busy} disabled={reply.trim().length < 2}>
                Send
              </Button>
            </div>
          </div>
          {/* Setting up Enterprise itself is a plan move, not a ticket reply. */}
          <p className="text-[11px] leading-4 text-slate-400">
            Agreed terms? Put the community on Enterprise from{" "}
            <Link href="/community-subscriptions" className="font-semibold text-[#012A9D] hover:underline">
              Subscribers
            </Link>{" "}
            — an admin-applied negotiated plan is billed commercially, not from their wallet.
          </p>
        </footer>
      </aside>
    </div>
  );
}
