"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/api";
import { CATEGORY_LABELS, STATUS_LABELS, VERIFICATION_LABELS } from "@/components/community/filter-rail";
import { CommunityStatusActions, OfficerAccessDialog } from "@/components/community/status-actions";

/**
 * One community's management page.
 *
 * Tabbed rather than one long scroll, and each tab fetches only when opened:
 * a cooperative with forty thousand contributions should not cost forty
 * thousand rows to look at its complaints. The tab lives in the query string
 * so a link can point at a specific one — the dashboard's overdue list links
 * straight to `?tab=contributions`.
 *
 * Read-only except for the platform decisions themselves — suspend,
 * deactivate, re-tier, pause an officer — which are here under "Manage
 * status" and on the Administrators tab. They share one component with the
 * Registration & Approvals page rather than being reimplemented, so the
 * maker-checker gate and its 428 handling exist once. They used to be only a
 * link to that page, which opens on the review queue: for a community
 * already verified the operator landed on a list it was not in, and the
 * controls looked missing.
 */

type Tab =
  | "overview"
  | "membership"
  | "administrators"
  | "contributions"
  | "savings"
  | "ajo"
  | "loans"
  | "transactions"
  | "complaints"
  | "audit"
  | "settings";

const TABS: Array<{ key: Tab; label: string; badge?: keyof Counts }> = [
  { key: "overview", label: "Profile" },
  { key: "membership", label: "Members", badge: "members" },
  { key: "administrators", label: "Administrators", badge: "officers" },
  { key: "contributions", label: "Contributions" },
  { key: "savings", label: "Savings", badge: "savingsAccounts" },
  { key: "ajo", label: "Ajo", badge: "ajoGroups" },
  { key: "loans", label: "Loans", badge: "openLoans" },
  { key: "transactions", label: "Transactions" },
  { key: "complaints", label: "Complaints", badge: "openComplaints" },
  { key: "audit", label: "Audit" },
  { key: "settings", label: "Settings & documents", badge: "documents" },
];

type Counts = {
  members: number;
  officers: number;
  ajoGroups: number;
  savingsAccounts: number;
  openLoans: number;
  openComplaints: number;
  documents: number;
};

type Overview = {
  id: string;
  publicId: string | null;
  name: string;
  email: string;
  phone: string;
  address: string | null;
  state: string | null;
  lga: string | null;
  city: string | null;
  country: string;
  status: string;
  verificationLevel: string;
  categoryType: string | null;
  registrationNumber: string | null;
  legalName: string | null;
  website: string | null;
  foundedYear: number | null;
  healthScore: number | null;
  organizerFeesEnabled: boolean;
  isDiscoverable: boolean;
  suspensionReason: string | null;
  suspendedAt: string | null;
  rejectionReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
  registrarName: string | null;
  registrarEmail: string | null;
  registrarPhone: string | null;
  owner: { id: string; name: string; email: string; phone: string };
  wallet: { walletNumber: string; accounts: Array<{ currencyCode: string; available: string; held: string }> } | null;
  subscription: { status: string; currentPeriodEnd: string | null; plan: { name: string; price: string; currencyCode: string; billingPeriod: string; maxMembers: number | null } } | null;
  counts: Counts;
};

const money = (value: string | null | undefined, currency = "NGN") =>
  value == null ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
const day = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(iso)) : "—");
const stamp = (iso: string) => new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const pretty = (v: string) => v.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * What a tab returns.
 *
 * Loosely keyed on purpose — eleven tabs with eleven large read-only shapes
 * would be a second copy of the API's schema to keep in step, for no checking
 * the render does not already do. The sub-components below narrow the handful
 * of fields they actually read.
 */
type TabPayload = Record<string, unknown>;

type Permission = { resource: string; action: string };
type OfficerRow = {
  id: string;
  title: string | null;
  adminAccessSuspendedAt: string | null;
  adminAccessSuspensionReason: string | null;
  name: string;
  role: { name: string; label: string | null; isElected: boolean; permissions: Permission[] };
  user: { email: string; phone: string };
};
type RoleRow = { id: string; name: string; label: string | null; holders: number };
type InvitationRow = { id: string; email: string; expiresAt: string; role: { name: string; label: string | null } };
type OverdueRow = {
  id: string;
  periodNumber: number;
  currencyCode: string;
  dueDate: string;
  outstanding: string;
  daysLate: number;
  cycle: { cycleNumber: number; ajoGroup: { name: string } };
  member: { name: string; phone: string };
};
type AjoGroupRow = {
  id: string;
  name: string;
  groupNumber: string;
  status: string;
  frequency: string;
  members: number;
  contributionAmount: string;
  currencyCode: string;
  cycle: { cycleNumber: number; totalPeriods: number; roundsOpened: number; progress: number } | null;
};
type PayoutRow = {
  id: string;
  netAmount: string;
  currencyCode: string;
  status: string;
  scheduledFor?: string | null;
  paidAt?: string | null;
  cycle: { ajoGroup: { name: string } };
  recipient: { name: string };
};
type ActivityLine = {
  id: string;
  summary: string;
  severity: string;
  surface: string;
  actorType: string;
  actorLabel: string | null;
  reason: string | null;
  approvalRequestId: string | null;
  createdAt: string;
};
type CommunityLogLine = {
  id: string;
  action: string;
  entityType: string;
  actorType: string;
  reason: string | null;
  createdAt: string;
};
type PolicyRow = { area: string; isPublished: boolean; version: number; content: string | null };
type DocumentRow = { id: string; name: string; category: string; fileUrl: string; version: number; createdAt: string };
type BranchRow = { id: string; name: string; members: number };
type BranchSeat = {
  id: string;
  name: string;
  title: string;
  role: string;
  powersPaused: boolean;
  appointedAt: string;
};
/**
 * A branch and who runs it.
 *
 * On the administrators tab rather than with the other branch data, because
 * a branch manager *is* a community administrator — one whose authority is
 * bounded to a chapter. A list of only community-wide posts would show a
 * cooperative with nine officers as having three.
 */
type BranchLeadership = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  state: string | null;
  lga: string | null;
  isActive: boolean;
  memberCount: number;
  /** What the branch has filed and had paid — is it actually being run? */
  spending: { pending: number; paidTotal: string };
  manager: (BranchSeat & { memberCode: string | null }) | null;
  staff: BranchSeat[];
};

const STATUS_TONE: Record<string, string> = {
  VERIFIED: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  SUSPENDED: "bg-red-50 text-red-600",
  INACTIVE: "bg-slate-100 text-slate-600",
  REJECTED: "bg-slate-100 text-slate-600",
};

export default function CommunityHubPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  /**
   * The loaded tab, tagged with which tab it is.
   *
   * Tagged rather than cleared on switch: clearing meant a synchronous
   * setState in the effect path, and — worse — a gap where the previous
   * tab's rows could render under the new tab's heading.
   */
  const [payload, setPayload] = useState<{ tab: Tab; data: TabPayload } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [toast, setToast] = useState("");

  const loadOverview = useCallback(
    () =>
      adminApi
        .communityTab<Overview>(id, "overview")
        .then((r) => { setOverview(r.data); setError(""); })
        .catch((e: Error) => setError(e.message || "Could not load this community"))
        .finally(() => setLoading(false)),
    [id],
  );

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const loadTab = useCallback(() => {
    if (tab === "overview") return Promise.resolve();
    return adminApi
      .communityTab<TabPayload>(id, tab, { limit: 25 })
      .then((r) => { setPayload({ tab, data: r.data }); setError(""); })
      .catch((e: Error) => setError(e.message || "Could not load this tab"));
  }, [id, tab]);

  useEffect(() => { void loadTab(); }, [loadTab]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4500); return () => clearTimeout(t); }, [toast]);

  // Derived rather than a flag: "this tab's data has not arrived" is exactly
  // `payload` not matching `tab`, and a separate boolean is one more thing
  // that can disagree with reality.
  const tabLoading = tab !== "overview" && payload?.tab !== tab && !error;

  if (loading) return <main className="p-8 text-sm text-slate-500">Loading…</main>;
  if (!overview) return <main className="p-8"><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error || "Community not found"}</p></main>;

  return (
    <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
      <Link href="/community/all" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-blue-600 transition hover:bg-blue-50">← All communities</Link>

      <header className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-black tracking-tight text-slate-950">{overview.name}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[overview.status]}`}>● {STATUS_LABELS[overview.status] ?? pretty(overview.status)}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{VERIFICATION_LABELS[overview.verificationLevel]}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {overview.publicId ?? overview.id.slice(0, 8)}
            {overview.categoryType ? ` · ${CATEGORY_LABELS[overview.categoryType]}` : " · not categorised"}
            {[overview.lga, overview.state].filter(Boolean).length ? ` · ${[overview.lga, overview.state].filter(Boolean).join(", ")}` : ""}
            {` · registered ${day(overview.createdAt)}`}
          </p>
        </div>
        {/* The actions themselves, here. They used to be a link to
            Registration & approvals, which opens on the review queue — so for
            any community already decided, the operator landed on a list their
            community was not in and the controls looked missing. */}
        <div className="shrink-0">
          <button
            onClick={() => setActionsOpen((v) => !v)}
            aria-expanded={actionsOpen}
            className={`w-full rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm transition lg:w-auto ${actionsOpen ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white hover:bg-slate-50"}`}
          >
            Manage status {actionsOpen ? "▴" : "▾"}
          </button>
        </div>
      </header>

      {actionsOpen && (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:ml-auto lg:max-w-md">
          <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            Platform status &amp; verification
          </h2>
          <CommunityStatusActions
            community={overview}
            onDone={(message) => { setToast(message); void loadOverview(); }}
            onError={setError}
          />
        </section>
      )}

      {/* Rendi has stopped this community: the first thing on the page,
          because everything below it is moot while it is true. */}
      {(overview.suspensionReason || overview.status === "SUSPENDED" || overview.status === "INACTIVE") && (
        <p className={`mt-4 rounded-xl p-3 text-sm leading-5 ${overview.status === "INACTIVE" ? "bg-slate-100 text-slate-700" : "bg-red-50 text-red-700"}`}>
          <b className="block">
            {overview.status === "SUSPENDED" ? "Suspended by Rendi" : "Inactive"}
            {overview.suspendedAt ? ` · ${day(overview.suspendedAt)}` : ""}
          </b>
          {overview.suspensionReason ?? "No reason recorded."}
        </p>
      )}

      <nav className="mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 text-sm shadow-sm">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 font-bold transition ${tab === item.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
          >
            {item.label}
            {item.badge && overview.counts[item.badge] > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === item.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>{overview.counts[item.badge]}</span>
            )}
          </button>
        ))}
      </nav>

      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5">
        {tab === "overview" ? (
          <ProfileTab community={overview} />
        ) : tabLoading ? (
          <p className="p-10 text-center text-sm text-slate-500">Loading…</p>
        ) : payload?.tab === tab ? (
          <TabBody
            tab={tab}
            data={payload.data}
            communityId={id}
            onDone={(message) => { setToast(message); void loadTab(); }}
            onError={setError}
          />
        ) : (
          <p className="p-10 text-center text-sm text-slate-500">Nothing recorded here yet.</p>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 right-5 z-[90] max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-5 text-emerald-800 shadow-xl">
          ✓ &nbsp;{toast}
        </div>
      )}
    </main>
  );
}

function ProfileTab({ community }: { community: Overview }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Profile & contact</h2>
        <dl className="mt-4 grid grid-cols-[160px_1fr] gap-y-2.5 text-sm">
          {[
            ["Rendi ID", community.publicId],
            ["Legal name", community.legalName],
            ["Registration no.", community.registrationNumber],
            ["Official email", community.email],
            ["Official phone", community.phone],
            ["Address", [community.address, community.city, community.lga, community.state, community.country].filter(Boolean).join(", ")],
            ["Website", community.website],
            ["Founded", community.foundedYear?.toString()],
            ["Verified", day(community.verifiedAt)],
            ["Listed in Discover", community.isDiscoverable ? "Yes" : "No"],
            ["Organizer fees", community.organizerFeesEnabled ? "Permitted" : "Restricted"],
            ["Health score", community.healthScore == null ? "Not yet scored" : `${community.healthScore} / 100`],
          ].map(([label, value]) => (
            <div key={String(label)} className="col-span-2 grid grid-cols-[160px_1fr] gap-2">
              <dt className="text-slate-500">{label}</dt>
              <dd className="min-w-0 break-words font-bold">{value || <span className="font-normal text-slate-400">Not recorded</span>}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mt-6 text-sm font-extrabold uppercase tracking-wide text-slate-600">Registrar & owner account</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5">
            <b className="block text-sm">{community.registrarName ?? "Not recorded"}</b>
            <span className="text-slate-500">{community.registrarEmail ?? "—"}<br />{community.registrarPhone ?? "—"}</span>
            <p className="mt-1 text-slate-500">The person who filled in the registration.</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5">
            <b className="block text-sm">{community.owner.name}</b>
            <span className="text-slate-500">{community.owner.email}<br />{community.owner.phone}</span>
            <p className="mt-1 text-slate-500">The organisation&rsquo;s own login. Money-out approvals route here.</p>
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Community wallet</h2>
          {community.wallet ? (
            <>
              <p className="mt-2 text-xs text-slate-500">{community.wallet.walletNumber}</p>
              {community.wallet.accounts.filter((account) => account.currencyCode === "NGN").map((account) => (
                <p key={account.currencyCode} className="mt-2">
                  <span className="block text-2xl font-black">{money(account.available, account.currencyCode)}</span>
                  <span className="text-xs text-slate-500">available · {money(account.held, account.currencyCode)} held</span>
                </p>
              ))}
              {!community.wallet.accounts.some((account) => account.currencyCode === "NGN") && <p className="mt-3 text-sm text-slate-500">NGN wallet account not provisioned yet.</p>}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No wallet provisioned yet.</p>
          )}
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Community funds, separate from members&rsquo; personal wallets and from their savings. Nothing on this page can move them.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Subscription</h2>
          {community.subscription ? (
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">Plan</dt><dd className="text-right font-bold">{community.subscription.plan.name}</dd>
              <dt className="text-slate-500">Status</dt><dd className="text-right font-bold">{pretty(community.subscription.status)}</dd>
              <dt className="text-slate-500">Price</dt><dd className="text-right font-bold">{money(community.subscription.plan.price, community.subscription.plan.currencyCode)} / {community.subscription.plan.billingPeriod.toLowerCase()}</dd>
              <dt className="text-slate-500">Member cap</dt><dd className="text-right font-bold">{community.subscription.plan.maxMembers ?? "Unlimited"}</dd>
              <dt className="text-slate-500">Renews</dt><dd className="text-right font-bold">{day(community.subscription.currentPeriodEnd)}</dd>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No active subscription.</p>
          )}
          <Link href="/community-subscriptions" className="mt-3 inline-block text-xs font-bold text-blue-600">Subscriptions & billing →</Link>
        </section>
      </aside>
    </div>
  );
}

/**
 * The remaining tabs.
 *
 * Rendered from the API payload with a shared summary-plus-table shape rather
 * than eleven bespoke components: every one of these is "some headline
 * figures and a list", and eleven near-identical files would be eleven places
 * to fix the same spacing bug.
 */
function TabBody({
  tab,
  data,
  communityId,
  onDone,
  onError,
}: {
  tab: Tab;
  data: TabPayload;
  communityId: string;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const summary = data.summary as Record<string, unknown> | undefined;

  return (
    <div className="space-y-5">
      {summary && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(summary).map(([key, value]) => (
            <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{pretty(key)}</p>
              <p className="mt-1 truncate text-xl font-black" title={formatCell(value)}>{formatCell(value)}</p>
            </div>
          ))}
        </section>
      )}

      {tab === "administrators" && (
        <AdministratorsTab data={data} communityId={communityId} onDone={onDone} onError={onError} />
      )}
      {tab === "contributions" && <OverdueTab data={data} />}
      {tab === "ajo" && <AjoTab data={data} />}
      {tab === "audit" && <AuditTab data={data} />}
      {tab === "settings" && <SettingsTab data={data} />}

      {/* The list-shaped tabs share one renderer. */}
      {["membership", "savings", "loans", "transactions", "complaints"].includes(tab) && (
        <GenericTable rows={pickRows(data)} />
      )}
    </div>
  );
}

/** Where a tab's rows live — some payloads nest them under their own key. */
function pickRows(data: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(data.items)) return data.items as Array<Record<string, unknown>>;
  const accounts = data.accounts as { items?: unknown } | undefined;
  if (accounts && Array.isArray(accounts.items)) return accounts.items as Array<Record<string, unknown>>;
  return [];
}

/** A scalar as text. Objects become their most useful field, not "[object Object]". */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString("en-NG");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    // A decimal string that is plainly money, formatted as money. The API
    // sends amounts as strings so precision survives the wire.
    if (/^-?\d+(\.\d+)?$/.test(value) && value.includes(".")) {
      return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value));
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return stamp(value);
    return value;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["name", "reference", "label", "count", "amount"]) {
      if (typeof obj[key] === "string" || typeof obj[key] === "number") return String(obj[key]);
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/** Columns worth a table, in a sensible order, skipping the noisy ones. */
const SKIP = new Set(["id", "userId", "communityId", "payload", "oldValues", "newValues", "escalations", "_count", "suspendedScopes"]);

function GenericTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">Nothing recorded here yet.</p>;
  const columns = Object.keys(rows[0]).filter((key) => !SKIP.has(key));
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
            <tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-3">{pretty(column)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={String(row.id ?? index)} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                {columns.map((column) => (
                  <td key={column} className="max-w-[260px] truncate px-3 py-3" title={formatCell(row[column])}>{formatCell(row[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdministratorsTab({
  data,
  communityId,
  onDone,
  onError,
}: {
  data: TabPayload;
  communityId: string;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const officers = (data.officers ?? []) as OfficerRow[];
  const roles = (data.roles ?? []) as RoleRow[];
  const vacant = (data.vacant ?? []) as string[];
  const invitations = (data.invitations ?? []) as InvitationRow[];
  const branches = (data.branches ?? []) as BranchLeadership[];
  const unmanaged = (data.unmanagedBranches ?? []) as string[];
  const [acting, setActing] = useState<OfficerRow | null>(null);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="overflow-hidden rounded-2xl border bg-white">
        <h2 className="border-b bg-slate-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-slate-600">Officers ({officers.length})</h2>
        <div className="divide-y">
          {officers.map((officer) => (
            <div key={officer.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <b>{officer.name}</b>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{officer.title ?? officer.role.label ?? pretty(officer.role.name)}</span>
                {officer.role.isElected && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">ELECTED</span>}
                {officer.adminAccessSuspendedAt && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">POWERS PAUSED</span>}
                <button
                  onClick={() => setActing(officer)}
                  className={`ml-auto rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${officer.adminAccessSuspendedAt ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
                >
                  {officer.adminAccessSuspendedAt ? "Restore powers" : "Pause powers"}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">{officer.user.email} · {officer.user.phone}</p>
              {officer.adminAccessSuspensionReason && <p className="mt-1 text-xs leading-5 text-red-600">{officer.adminAccessSuspensionReason}</p>}
              {/* The post's actual powers. Per community, so there is no
                  platform-wide answer to quote instead. */}
              <div className="mt-2 flex flex-wrap gap-1">
                {(officer.role.permissions ?? []).map((permission) => (
                  <span key={`${permission.resource}:${permission.action}`} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    {permission.resource === "*" ? "everything" : permission.resource}:{permission.action}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!officers.length && <p className="p-8 text-center text-sm text-slate-500">Only the registrar holds a post here.</p>}
        </div>
        <p className="border-t bg-slate-50 px-5 py-3 text-[11px] leading-5 text-slate-500">
          Pausing an officer stops the actions their post carries on their next request — they keep the post, their
          membership and their own records.
        </p>
      </section>

      <aside className="space-y-5">
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Posts defined ({roles.length})</h2>
          <div className="mt-3 space-y-1.5">
            {roles.map((role) => (
              <p key={role.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{role.label ?? role.name}</span>
                <span className={`shrink-0 text-xs font-bold ${role.holders ? "text-slate-600" : "text-amber-700"}`}>{role.holders ? `${role.holders} holder${role.holders === 1 ? "" : "s"}` : "vacant"}</span>
              </p>
            ))}
          </div>
          {vacant.length > 0 && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              {vacant.length} {vacant.length === 1 ? "post is" : "posts are"} unfilled: {vacant.join(", ")}. A cooperative with no treasurer is worth a look.
            </p>
          )}
        </section>

        {branches.length > 0 && (
          <section className="overflow-hidden rounded-2xl border bg-white">
            <h2 className="border-b bg-slate-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-slate-600">
              Branch leadership ({branches.length})
            </h2>
            {unmanaged.length > 0 && (
              <p className="border-b bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-900">
                Running without a manager: <b>{unmanaged.join(", ")}</b>. Only community-wide officers can
                act in those branches.
              </p>
            )}
            <div className="divide-y">
              {branches.map((branch) => (
                <div key={branch.id} className="p-4">
                  <p className="flex flex-wrap items-baseline gap-2">
                    <b className="text-sm">{branch.name}</b>
                    {branch.code && <span className="text-[11px] font-bold text-slate-400">{branch.code}</span>}
                    {!branch.isActive && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">CLOSED</span>
                    )}
                    <span className="ml-auto text-xs text-slate-500">
                      {branch.memberCount} members
                      {Number(branch.spending?.paidTotal ?? 0) > 0 && ` · ${money(branch.spending.paidTotal)} spent`}
                      {branch.spending?.pending > 0 && ` · ${branch.spending.pending} awaiting approval`}
                    </span>
                  </p>
                  {[branch.lga, branch.city, branch.state].filter(Boolean).length > 0 && (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {[branch.lga, branch.city, branch.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs leading-5">
                    {branch.manager ? (
                      <>
                        <b className="text-slate-900">{branch.manager.name}</b>
                        <span className="text-slate-500"> — {branch.manager.title} ({branch.manager.role}), since {day(branch.manager.appointedAt)}</span>
                        {branch.manager.powersPaused && (
                          <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">POWERS PAUSED</span>
                        )}
                      </>
                    ) : (
                      <span className="text-amber-700">No manager appointed</span>
                    )}
                  </p>
                  {branch.staff.length > 0 && (
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      Staff: {branch.staff.map((seat) => `${seat.name} (${seat.title})`).join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="border-t bg-slate-50 px-5 py-3 text-[11px] leading-5 text-slate-500">
              A branch seat carries its role&rsquo;s permissions inside that branch only. Pausing a branch
              officer&rsquo;s powers uses the same control as any other officer, above.
            </p>
          </section>
        )}

        {invitations.length > 0 && (
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Awaiting acceptance</h2>
            <div className="mt-3 space-y-2">
              {invitations.map((invitation) => (
                <p key={invitation.id} className="text-xs leading-5">
                  <b className="block">{invitation.email}</b>
                  <span className="text-slate-500">{invitation.role.label ?? invitation.role.name} · expires {day(invitation.expiresAt)}</span>
                </p>
              ))}
            </div>
          </section>
        )}
      </aside>

      {acting && (
        <OfficerAccessDialog
          communityId={communityId}
          officer={{
            id: acting.id,
            name: acting.name,
            role: acting.role.name,
            title: acting.title ?? acting.role.label,
            adminAccessSuspendedAt: acting.adminAccessSuspendedAt,
            adminAccessSuspensionReason: acting.adminAccessSuspensionReason,
          }}
          onClose={() => setActing(null)}
          onDone={onDone}
          onError={onError}
        />
      )}
    </div>
  );
}

function OverdueTab({ data }: { data: TabPayload }) {
  const overdue = data.overdue as { items?: OverdueRow[]; total?: number } | undefined;
  const items = overdue?.items ?? [];
  if (!items.length) return <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">Nobody in this community is behind on contributions.</p>;
  return (
    <section className="overflow-hidden rounded-2xl border bg-white">
      <h2 className="border-b bg-slate-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-slate-600">
        Behind on contributions ({overdue?.total ?? items.length})
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-white text-[11px] uppercase text-slate-500"><tr>{["Member", "Group", "Round", "Due", "Outstanding", "Late"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-3"><b className="block">{row.member.name}</b><span className="text-xs text-slate-500">{row.member.phone}</span></td>
                <td className="px-3 py-3 text-xs">{row.cycle.ajoGroup.name}</td>
                <td className="px-3 py-3 text-xs">#{row.periodNumber} of cycle {row.cycle.cycleNumber}</td>
                <td className="px-3 py-3 text-xs">{day(row.dueDate)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-bold">{money(row.outstanding, row.currencyCode)}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${row.daysLate > 30 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>{row.daysLate}d</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AjoTab({ data }: { data: TabPayload }) {
  const groups = (data.groups ?? []) as AjoGroupRow[];
  const upcoming = (data.upcomingPayouts ?? []) as PayoutRow[];
  const recent = (data.recentPayouts ?? []) as PayoutRow[];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="overflow-hidden rounded-2xl border bg-white">
        <h2 className="border-b bg-slate-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-slate-600">Groups ({groups.length})</h2>
        <div className="divide-y">
          {groups.map((group) => (
            <div key={group.id} className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <b>{group.name}</b>
                <span className="text-xs text-slate-500">{group.groupNumber} · {group.members} members · {money(group.contributionAmount, group.currencyCode)} {group.frequency.toLowerCase()}</span>
              </div>
              {group.cycle ? (
                <>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${group.cycle.progress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Cycle {group.cycle.cycleNumber} · round {group.cycle.roundsOpened} of {group.cycle.totalPeriods} opened ({group.cycle.progress}%)
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No running cycle · {pretty(group.status)}</p>
              )}
            </div>
          ))}
          {!groups.length && <p className="p-8 text-center text-sm text-slate-500">This community runs no Ajo groups.</p>}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Upcoming payouts</h2>
          <div className="mt-3 space-y-2">
            {upcoming.map((payout) => (
              <p key={payout.id} className="text-xs leading-5">
                <b className="block">{payout.recipient.name} · {money(payout.netAmount, payout.currencyCode)}</b>
                <span className="text-slate-500">{payout.cycle.ajoGroup.name} · {day(payout.scheduledFor)} · {pretty(payout.status)}</span>
              </p>
            ))}
            {!upcoming.length && <p className="text-sm text-slate-500">None scheduled.</p>}
          </div>
        </section>
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Members paid</h2>
          <div className="mt-3 space-y-2">
            {recent.map((payout) => (
              <p key={payout.id} className="text-xs leading-5">
                <b className="block">{payout.recipient.name} · {money(payout.netAmount, payout.currencyCode)}</b>
                <span className="text-slate-500">{payout.cycle.ajoGroup.name} · {day(payout.paidAt)}</span>
              </p>
            ))}
            {!recent.length && <p className="text-sm text-slate-500">No payouts yet.</p>}
          </div>
        </section>
      </aside>
    </div>
  );
}

function AuditTab({ data }: { data: TabPayload }) {
  const platform = data.platform as { items?: ActivityLine[] } | undefined;
  const own = (data.community ?? []) as CommunityLogLine[];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="overflow-hidden rounded-2xl border bg-white">
        <h2 className="border-b bg-slate-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-slate-600">
          Platform trail
          <span className="ml-2 font-normal normal-case text-slate-500">— who did this to the community, and from which app</span>
        </h2>
        <div className="divide-y">
          {(platform?.items ?? []).map((row) => (
            <div key={row.id} className="p-4 text-sm">
              <p className="flex flex-wrap items-baseline gap-2">
                <b className="min-w-0">{row.summary}</b>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${row.severity === "CRITICAL" ? "bg-red-50 text-red-600" : row.severity === "WARNING" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{row.severity}</span>
              </p>
              <p className="text-xs text-slate-500">
                {row.actorLabel ?? pretty(row.actorType)} · {pretty(row.surface)} · {stamp(row.createdAt)}
                {row.approvalRequestId ? ` · approved as ${row.approvalRequestId}` : ""}
              </p>
              {row.reason && <p className="mt-1 text-xs leading-5 text-slate-600">{row.reason}</p>}
            </div>
          ))}
          {!(platform?.items ?? []).length && <p className="p-8 text-center text-sm text-slate-500">Nothing recorded yet.</p>}
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl border bg-white">
        <h2 className="border-b bg-slate-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-slate-600">
          The community&rsquo;s own book
          <span className="ml-2 font-normal normal-case text-slate-500">— what its officers did</span>
        </h2>
        <div className="divide-y">
          {own.map((row) => (
            <div key={row.id} className="p-4 text-sm">
              <b>{pretty(row.action)}</b>
              <p className="text-xs text-slate-500">{pretty(row.entityType)} · {pretty(row.actorType)} · {stamp(row.createdAt)}</p>
              {row.reason && <p className="mt-1 text-xs leading-5 text-slate-600">{row.reason}</p>}
            </div>
          ))}
          {!own.length && <p className="p-8 text-center text-sm text-slate-500">Nothing recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}

function SettingsTab({ data }: { data: TabPayload }) {
  const policies = (data.policies ?? []) as PolicyRow[];
  const documents = (data.documents ?? []) as DocumentRow[];
  const branches = (data.branches ?? []) as BranchRow[];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="overflow-hidden rounded-2xl border bg-white">
        <h2 className="border-b bg-slate-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-slate-600">Service policies</h2>
        <div className="divide-y">
          {policies.map((policy) => (
            <div key={policy.area} className="p-4">
              <p className="flex items-center gap-2">
                <b className="text-sm">{pretty(policy.area)}</b>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${policy.isPublished ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{policy.isPublished ? `PUBLISHED v${policy.version}` : "DRAFT"}</span>
              </p>
              {policy.content && <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">{policy.content}</p>}
            </div>
          ))}
          {!policies.length && <p className="p-8 text-center text-sm text-slate-500">No policies published.</p>}
        </div>
        <p className="border-t bg-slate-50 px-5 py-3 text-[11px] leading-5 text-slate-500">
          Read-only. Contribution rules, payout schedules and policies belong to this community&rsquo;s own officers — changing them here would be Rendi rewriting a cooperative&rsquo;s bye-laws.
        </p>
      </section>

      <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl border bg-white">
          <h2 className="border-b bg-slate-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-slate-600">Documents ({documents.length})</h2>
          <div className="divide-y">
            {documents.map((document) => (
              <a key={document.id} href={document.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-4 text-sm hover:bg-slate-50">
                <span className="min-w-0 flex-1"><b className="block truncate">{document.name}</b><span className="text-xs text-slate-500">{pretty(document.category)} · v{document.version} · {day(document.createdAt)}</span></span>
                <b className="shrink-0 text-blue-600">View</b>
              </a>
            ))}
            {!documents.length && <p className="p-8 text-center text-sm text-slate-500">Nothing uploaded.</p>}
          </div>
        </section>
        {branches.length > 0 && (
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-600">Branches</h2>
            <div className="mt-3 space-y-1.5">
              {branches.map((branch) => (
                <p key={branch.id} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{branch.name}</span>
                  <span className="shrink-0 text-xs font-bold text-slate-600">{branch.members} members</span>
                </p>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
