"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, type DirectoryMember, type MemberProfile } from "@/lib/api";
import { AdminSelect } from "@/components/ui/admin-select";
import { useDebounce } from "@/hooks/use-debounce";

/**
 * The central member directory.
 *
 * One search box across name, phone, email, Rendi tag and member code,
 * because support is handed whichever of the five the caller happens to
 * quote — making an agent pick the right field first is how somebody who is
 * plainly in the system gets told "no record found".
 *
 * Rows are memberships, not people: "Ada in Unity Traders" is the question
 * support is actually asked, and membership is where status, member code and
 * suspension live. Each row says how many communities that person belongs to,
 * so the cross-community view is one click, not a second search.
 */

const money = (value: string, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
const day = (iso: string) => new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(iso));
const pretty = (v: string) => v.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

const MEMBER_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  SUSPENDED: "bg-red-50 text-red-600",
  REJECTED: "bg-slate-100 text-slate-600",
  LEFT: "bg-slate-100 text-slate-600",
};

export default function MemberDirectoryPage() {
  const [q, setQ] = useState("");
  const [view, setView] = useState("ALL");
  const [rows, setRows] = useState<DirectoryMember[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const search = useDebounce(q, 300);

  const load = useCallback(
    () =>
      adminApi
        .memberDirectory({ q: search || undefined, view, page, limit: 25 })
        .then((r) => {
          setRows(r.data.items);
          setTotal(r.data.total);
          setTotalPages(r.data.totalPages);
          setSelected((current) => current ?? r.data.items[0]?.user.id ?? null);
          setError("");
        })
        .catch((e: Error) => setError(e.message || "Could not load the member directory"))
        .finally(() => setLoading(false)),
    [search, view, page],
  );

  useEffect(() => { void load(); }, [load]);

  // Clearing the old profile belongs to the act of selecting, not to an
  // effect: doing it in the effect body is a synchronous setState on every
  // selection change, which cascades a render for no reason.
  const select = useCallback((userId: string) => {
    setSelected(userId);
    setProfile(null);
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    void adminApi
      .memberProfile(selected)
      .then((r) => { if (!cancelled) setProfile(r.data); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, [selected]);

  return (
    <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-black tracking-tight">Member management</h1>
        <p className="mt-1 text-sm text-slate-600">
          {loading ? "Loading…" : `${total.toLocaleString()} memberships`} · search by name, phone, email, Rendi tag or member code
        </p>
      </header>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Ada Obi · 08031234567 · ada@example.com · @ada · KAKA-261106-0001" className="h-11 flex-1 rounded-xl border px-4 text-sm outline-none focus:border-blue-500" />
        <AdminSelect aria-label="Filter the directory" value={view} onChange={(e) => { setPage(1); setView(e.target.value); }} containerClassName="w-full sm:w-[235px]">
          <option value="ALL">Everyone</option>
          <option value="SUSPENDED">Suspended or paused</option>
          <option value="MULTI_COMMUNITY">In more than one community</option>
        </AdminSelect>
      </div>

      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="self-start overflow-hidden rounded-2xl border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>{["Member", "Community", "Post", "Member code", "Standing"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => select(row.user.id)} className={`cursor-pointer border-t ${selected === row.user.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                    <td className="px-3 py-3">
                      <b className="block">{row.name}</b>
                      <span className="text-xs text-slate-500">
                        {row.user.phone}
                        {row.communityCount > 1 && <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">{row.communityCount} communities</span>}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/community/${row.community.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-blue-600">{row.community.name}</Link>
                      <span className="block text-xs text-slate-500">{row.community.publicId}</span>
                    </td>
                    <td className="px-3 py-3 text-xs">{row.isOfficer ? <b>{row.title ?? row.role.label ?? pretty(row.role.name)}</b> : "Member"}</td>
                    <td className="px-3 py-3 text-xs">{row.memberCode ?? "—"}</td>
                    <td className="px-3 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${MEMBER_TONE[row.status] ?? "bg-slate-100 text-slate-600"}`}>{pretty(row.status)}</span>
                      {/* The two suspensions are different things and are
                          labelled as such — one pauses named services, the
                          other pauses an officer's powers. */}
                      {row.suspendedScopes.length > 0 && <span className="mt-0.5 block text-[11px] text-red-600">{row.suspendedScopes.length} service{row.suspendedScopes.length === 1 ? "" : "s"} paused</span>}
                      {row.adminAccessSuspendedAt && <span className="mt-0.5 block text-[11px] text-red-600">Officer powers paused</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !rows.length && <p className="p-10 text-center text-sm text-slate-500">Nobody matches that search.</p>}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-3 text-sm">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border bg-white px-3 py-1.5 font-bold disabled:opacity-40">← Previous</button>
              <span className="text-xs text-slate-600">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border bg-white px-3 py-1.5 font-bold disabled:opacity-40">Next →</button>
            </div>
          )}
        </section>

        {profile ? (
          <aside className="self-start rounded-2xl border bg-white p-5 xl:sticky xl:top-20">
            <h2 className="text-lg font-black">{profile.user.name}</h2>
            <p className="text-xs text-slate-500">{profile.user.email} · {profile.user.phone}{profile.user.vistaTag ? ` · ${profile.user.vistaTag}` : ""}</p>

            <dl className="mt-4 grid grid-cols-[96px_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">Account</dt><dd className="text-right font-bold">{pretty(profile.user.status)}</dd>
              <dt className="text-slate-500">KYC</dt><dd className="text-right font-bold">{profile.user.kycRecord ? `${profile.user.kycRecord.tier.replace("TIER_", "Tier ")} · ${pretty(profile.user.kycRecord.status)}` : "None"}</dd>
              <dt className="text-slate-500">Joined</dt><dd className="text-right font-bold">{day(profile.user.createdAt)}</dd>
              {/* Balance only. A platform admin overseeing communities has no
                  business reading a customer's transaction history from this
                  screen — that is the Transactions tab and its own permission. */}
              <dt className="text-slate-500">Wallet</dt><dd className="text-right font-bold">{profile.user.wallet?.accounts.map((a) => money(a.available, a.currencyCode)).join(" · ") ?? "None"}</dd>
            </dl>

            <h3 className="mt-5 text-[11px] font-extrabold uppercase text-slate-600">
              Communities ({profile.memberships.length})
            </h3>
            <div className="mt-2 space-y-2">
              {profile.memberships.map((membership) => (
                <Link key={membership.id} href={`/community/${membership.community.id}`} className="block rounded-xl border p-3 hover:border-blue-400">
                  <p className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-bold">{membership.community.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${MEMBER_TONE[membership.status] ?? "bg-slate-100 text-slate-600"}`}>{pretty(membership.status)}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {membership.isOfficer ? membership.title ?? membership.role.label ?? pretty(membership.role.name) : "Member"}
                    {membership.memberCode ? ` · ${membership.memberCode}` : ""}
                    {membership.community.status !== "VERIFIED" ? ` · community ${membership.community.status.toLowerCase()}` : ""}
                  </p>
                  {membership.suspensionReason && <p className="mt-1 text-[11px] leading-4 text-red-600">{membership.suspensionReason}</p>}
                </Link>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              Each membership is separate: suspending this person in one community leaves the others, and their Rendi account, untouched.
            </p>

            <h3 className="mt-5 text-[11px] font-extrabold uppercase text-slate-600">Across all communities</h3>
            <dl className="mt-2 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">Contributed</dt><dd className="text-right font-bold">{money(profile.contributions.paid)}</dd>
              <dt className="text-slate-500">Payments</dt><dd className="text-right font-bold">{profile.contributions.payments}</dd>
              <dt className="text-slate-500">Savings</dt><dd className="text-right font-bold">{money(profile.savings.balance)} · {profile.savings.accounts} accounts</dd>
            </dl>

            {profile.loans.length > 0 && (
              <>
                <h3 className="mt-5 text-[11px] font-extrabold uppercase text-slate-600">Loans</h3>
                <div className="mt-2 space-y-1.5">
                  {profile.loans.slice(0, 5).map((loan) => (
                    <p key={loan.id} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">{loan.loanReference} · {pretty(loan.status)}</span>
                      <b className="shrink-0">{money(loan.outstanding, loan.currencyCode)}</b>
                    </p>
                  ))}
                </div>
              </>
            )}

            {profile.complaints.length > 0 && (
              <>
                <h3 className="mt-5 text-[11px] font-extrabold uppercase text-slate-600">Complaints raised</h3>
                <div className="mt-2 space-y-1.5">
                  {profile.complaints.slice(0, 5).map((ticket) => (
                    <p key={ticket.id} className="text-xs leading-5">
                      <b>{ticket.reference}</b> · {pretty(ticket.status)}<br />
                      <span className="text-slate-500">{ticket.subject}</span>
                    </p>
                  ))}
                </div>
              </>
            )}

            {/* Leads, labelled as leads. Email and phone are unique
                platform-wide, so a real duplicate can only ever match on a
                name or a phone that differs by formatting — both of which
                produce false positives. */}
            {profile.duplicateLeads.length > 0 && (
              <>
                <h3 className="mt-5 text-[11px] font-extrabold uppercase text-amber-700">Possible duplicate accounts</h3>
                <div className="mt-2 space-y-2">
                  {profile.duplicateLeads.map((lead) => (
                    <Link key={lead.id} href={`/users/${lead.id}`} className="block rounded-xl bg-amber-50 p-2.5 text-xs">
                      <b className="block">{lead.name}</b>
                      <span className="text-slate-600">{lead.email} · {lead.phone}</span>
                      <span className="mt-0.5 block font-bold text-amber-800">matched on {lead.matchedOn.map((m) => m.toLowerCase().replace("_", " ")).join(" and ")}</span>
                    </Link>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  A lead to investigate, not a finding. Email and phone are unique across Rendi, so two accounts for one person can only ever share a name or a reformatted number.
                </p>
              </>
            )}
          </aside>
        ) : (
          <aside className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">Select a member to see every community they belong to.</aside>
        )}
      </div>
    </main>
  );
}
