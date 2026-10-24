"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

type Detail = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  address: string | null;
  country: string;
  city: string | null;
  category: string | null;
  registrationNumber: string | null;
  status: "PENDING" | "VERIFIED" | "SUSPENDED" | "REJECTED";
  organizerFeesEnabled: boolean;
  isDiscoverable: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  owner: {
    id: string;
    email: string;
    phone: string;
    status: string;
    createdAt: string;
    profile: { firstName: string; lastName: string } | null;
  };
  members: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    title: string | null;
    status: string;
    joinedAt: string;
  }>;
  ajoGroups: Array<{
    id: string;
    name: string;
    status: string;
    type: string;
    contributionAmount: string;
    currencyCode: string;
  }>;
  wallet: {
    walletNumber: string;
    accounts: Array<{ currencyCode: string; available: string; held: string }>;
  } | null;
  subscription: { status: string; plan: { name: string } } | null;
  listing: { status: string; tagline: string | null; category: string | null } | null;
  decisions: Array<{
    id: string;
    action: string;
    reason: string;
    createdAt: string;
    adminUser: { email: string; firstName: string; lastName: string } | null;
  }>;
  _count: { members: number; ajoGroups: number };
};

export default function CommunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [allowOrganizerFees, setAllowOrganizerFees] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Refetch after a decision. Safe to call from a handler — unlike an effect
   * body, where setting state up front forces a second render pass.
   */
  const load = useCallback(async () => {
    try {
      const res = await adminApi.getCommunity(id);
      const detail = res.data as unknown as Detail;
      setData(detail);
      setAllowOrganizerFees(detail.organizerFeesEnabled);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this community");
    } finally {
      setSettled(true);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    adminApi.getCommunity(id).then(
      (res) => {
        if (cancelled) return;
        const detail = res.data as unknown as Detail;
        setData(detail);
        setAllowOrganizerFees(detail.organizerFeesEnabled);
        setSettled(true);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load this community");
        setSettled(true);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [id]);

  const loading = !settled;

  async function submit() {
    if (!decision) return;
    setSubmitting(true);
    try {
      await adminApi.reviewCommunity(id, {
        approve: decision === "approve",
        reason: reason.trim() || undefined,
        // Sent on approval only. On a rejection it is meaningless, and
        // sending it would quietly flip a policy flag on a community that
        // cannot trade anyway.
        ...(decision === "approve" ? { organizerFeesEnabled: allowOrganizerFees } : {}),
      });
      setDecision(null);
      setReason("");
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The decision was not recorded");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-700">{error ?? "Not found"}</p>
        <Link href="/communities" className="mt-3 inline-block text-sm text-[#012A9D] hover:underline">
          Back to communities
        </Link>
      </div>
    );
  }

  const ownerName =
    `${data.owner?.profile?.firstName ?? ""} ${data.owner?.profile?.lastName ?? ""}`.trim() ||
    data.owner?.email;

  // The things a reviewer is actually weighing. Shown as a checklist rather
  // than buried in the detail panes, because an approval here lets a
  // community collect money from its members. Verification is assessed on
  // the community (the business), not on the owner personally.
  const checks = [
    {
      label: "Registration number supplied",
      ok: Boolean(data.registrationNumber),
      detail: data.registrationNumber ?? "None on file — unregistered association",
    },
    {
      label: "Contact details complete",
      ok: Boolean(data.email && data.phone && data.address),
      detail: data.address ?? "No registered address",
    },
    {
      label: "Has officers beyond the owner",
      ok: (data._count?.members ?? 0) > 1,
      detail: `${data._count?.members ?? 0} member${data._count?.members === 1 ? "" : "s"}`,
    },
  ];

  return (
    <div className="flex flex-1 flex-col bg-[#F8FAFC]">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <Link href="/communities" className="text-sm text-slate-500 hover:text-[#012A9D]">
          ← Communities
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[20px] font-semibold text-[#0F172A]">{data.name}</h1>
          <Badge
            variant={
              data.status === "VERIFIED"
                ? "success"
                : data.status === "PENDING"
                  ? "warning"
                  : data.status === "REJECTED"
                    ? "error"
                    : "neutral"
            }
          >
            {data.status.toLowerCase()}
          </Badge>
          {data.organizerFeesEnabled && <Badge variant="info">Organizer fees permitted</Badge>}
          {data.isDiscoverable && <Badge variant="neutral">Listed in Discover</Badge>}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {[data.category, data.city, data.country].filter(Boolean).join(" · ")} · registered{" "}
          {formatDate(data.createdAt)}
        </p>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid flex-1 gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Verification checklist">
            <ul className="divide-y divide-slate-100">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-3 px-5 py-3">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      c.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {c.ok ? "✓" : "!"}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-[#0F172A]">{c.label}</span>
                    <span className="block text-xs text-slate-500">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 text-xs text-slate-500">
              None of these block approval on their own — they are what to weigh.
            </p>
          </Panel>

          <Panel title="Owner">
            <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <Field label="Name">{ownerName}</Field>
              <Field label="Account status">{data.owner?.status ?? "—"}</Field>
              <Field label="Email">{data.owner?.email}</Field>
              <Field label="Phone">{data.owner?.phone}</Field>
              <Field label="On Vista since">{formatDate(data.owner?.createdAt)}</Field>
            </dl>
            {data.owner?.id && (
              <div className="border-t border-slate-100 px-5 py-3">
                <Link
                  href={`/users/${data.owner.id}`}
                  className="text-sm text-[#012A9D] hover:underline"
                >
                  Open the owner&apos;s user record →
                </Link>
              </div>
            )}
          </Panel>

          <Panel title="Community details">
            <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <Field label="Official email">{data.email}</Field>
              <Field label="Official phone">{data.phone}</Field>
              <Field label="Registration number">
                {data.registrationNumber ?? "Not supplied"}
              </Field>
              <Field label="Address">{data.address ?? "Not supplied"}</Field>
              <Field label="Members">{data._count?.members ?? 0}</Field>
              <Field label="Ajo groups">{data._count?.ajoGroups ?? 0}</Field>
              <Field label="Subscription">
                {data.subscription
                  ? `${data.subscription.plan?.name} · ${data.subscription.status.toLowerCase()}`
                  : "None"}
              </Field>
              <Field label="Wallet">
                {data.wallet ? data.wallet.walletNumber : "Not provisioned"}
              </Field>
            </dl>
          </Panel>

          {data.members.length > 0 && (
            <Panel title={`Officers and members (${data.members.length})`}>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Name</th>
                    <th className="px-5 py-2.5">Contact</th>
                    <th className="px-5 py-2.5">Role</th>
                    <th className="px-5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.slice(0, 15).map((m) => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="px-5 py-2.5 text-[#0F172A]">{m.name}</td>
                      <td className="px-5 py-2.5 text-slate-600">
                        <div>{m.email}</div>
                        <div className="text-xs text-slate-400">{m.phone}</div>
                      </td>
                      <td className="px-5 py-2.5 text-slate-600">
                        {m.title ?? m.role.replace(/^COMMUNITY_/, "").toLowerCase()}
                      </td>
                      <td className="px-5 py-2.5">
                        <Badge variant={m.status === "ACTIVE" ? "success" : "neutral"}>
                          {m.status.toLowerCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {data.decisions.length > 0 && (
            <Panel title="Decision history">
              <ul className="divide-y divide-slate-100">
                {data.decisions.map((d) => (
                  <li key={d.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-[#0F172A]">
                        {d.action.replace(/_/g, " ").toLowerCase()}
                      </span>
                      <span className="text-xs text-slate-400">{formatDate(d.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {d.adminUser
                        ? `${d.adminUser.firstName} ${d.adminUser.lastName} · ${d.adminUser.email}`
                        : "Unknown admin"}
                      {d.reason ? ` — ${d.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Decision">
            <div className="space-y-4 px-5 py-4">
              {data.status === "VERIFIED" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-900">
                  Verified{data.verifiedAt ? ` on ${formatDate(data.verifiedAt)}` : ""}. This
                  community can collect contributions, run payouts and lend.
                </div>
              )}

              {data.status === "REJECTED" && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-900">
                  <p className="font-medium">Rejected</p>
                  <p className="mt-0.5">{data.rejectionReason ?? "No reason recorded."}</p>
                </div>
              )}

              {data.status === "PENDING" && (
                <p className="text-[13px] text-slate-600">
                  Until this is verified the community cannot move money or appear in Discover.
                  Everything else in their portal already works.
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  variant={decision === "approve" ? "primary" : "outline"}
                  className="flex-1"
                  onClick={() => setDecision(decision === "approve" ? null : "approve")}
                >
                  {data.status === "VERIFIED" ? "Re-verify" : "Approve"}
                </Button>
                <Button
                  variant={decision === "reject" ? "destructive" : "outline"}
                  className="flex-1"
                  onClick={() => setDecision(decision === "reject" ? null : "reject")}
                >
                  Reject
                </Button>
              </div>

              {decision && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  {decision === "approve" && (
                    <label className="flex items-start gap-2.5 text-[13px] text-slate-700">
                      <input
                        type="checkbox"
                        checked={allowOrganizerFees}
                        onChange={(e) => setAllowOrganizerFees(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#012A9D] focus:ring-[#012A9D]"
                      />
                      <span>
                        <span className="font-medium text-[#0F172A]">
                          Permit organizer fees
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          Lets this community charge its members a fee on each contribution.
                          A separate decision from verification, and off unless the
                          jurisdiction allows it.
                        </span>
                      </span>
                    </label>
                  )}

                  <div>
                    <label
                      htmlFor="review-reason"
                      className="mb-1 block text-xs font-medium text-slate-600"
                    >
                      {decision === "reject" ? "Reason (shown to the community)" : "Note"}
                      {decision === "reject" && <span className="text-red-600"> *</span>}
                    </label>
                    <textarea
                      id="review-reason"
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={
                        decision === "reject"
                          ? "Registration number could not be verified with the CAC"
                          : "CAC certificate checked against the register"
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#012A9D] focus:outline-none"
                    />
                    {decision === "reject" && (
                      <p className="mt-1 text-xs text-slate-500">
                        The owner sees this on their Settings → Verification page.
                      </p>
                    )}
                  </div>

                  <Button
                    variant={decision === "reject" ? "destructive" : "primary"}
                    className="w-full"
                    loading={submitting}
                    disabled={decision === "reject" && reason.trim().length < 5}
                    onClick={() => void submit()}
                  >
                    {decision === "reject" ? "Reject community" : "Verify community"}
                  </Button>
                </div>
              )}
            </div>
          </Panel>

          {data.listing && (
            <Panel title="Public listing">
              <div className="px-5 py-4 text-[13px]">
                <Badge
                  variant={data.listing.status === "LIVE" ? "success" : "neutral"}
                >
                  {data.listing.status.toLowerCase().replace(/_/g, " ")}
                </Badge>
                {data.listing.tagline && (
                  <p className="mt-2 text-slate-700">{data.listing.tagline}</p>
                )}
              </div>
            </Panel>
          )}

          {data.ajoGroups.length > 0 && (
            <Panel title={`Ajo groups (${data.ajoGroups.length})`}>
              <ul className="divide-y divide-slate-100">
                {data.ajoGroups.slice(0, 8).map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="min-w-0 text-[13px] text-[#0F172A]">{g.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {g.currencyCode} {Number(g.contributionAmount).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h2 className="border-b border-slate-100 px-5 py-3 text-[15px] font-semibold text-[#0F172A]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-[#0F172A]">{children}</dd>
    </div>
  );
}
