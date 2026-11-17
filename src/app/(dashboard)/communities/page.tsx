"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/api";
import {
  CommunityStatusActions,
  OfficerAccessDialog,
} from "@/components/community/status-actions";

/**
 * Registration & approvals — the verification queue, and every platform
 * decision about a community that is already through it.
 *
 * Two panes: the queue on the left, the community under review on the right.
 * The right pane is where decisions are taken, so it carries the evidence
 * those decisions rest on — documents, officers, decision history — rather
 * than making a reviewer open another screen to find them.
 *
 * `?id=<community>` selects a community and opens a tab it is actually in.
 * The management page links in that way; without it, arriving here from a
 * verified community dropped the operator on a queue filtered to PENDING
 * where their community was not, and the status actions looked missing.
 */

type Halt = { status: string; reason: string | null; since: string | null; message: string };

type Row = {
  id: string;
  publicId?: string | null;
  name: string;
  category?: string | null;
  categoryType?: string | null;
  verificationLevel?: string | null;
  city?: string | null;
  state?: string | null;
  lga?: string | null;
  country: string;
  registrationNumber?: string | null;
  status: string;
  createdAt: string;
  owner: { email: string; phone: string };
  _count: { members: number; ajoGroups: number };
};

type Officer = {
  id: string;
  name: string;
  email: string;
  role: string;
  title?: string | null;
  status: string;
  adminAccessSuspendedAt?: string | null;
  adminAccessSuspensionReason?: string | null;
};

type Detail = Row & {
  email: string;
  phone: string;
  address?: string | null;
  verifiedAt?: string | null;
  rejectionReason?: string | null;
  suspensionReason?: string | null;
  halt?: Halt | null;
  legalName?: string | null;
  organizerFeesEnabled: boolean;
  owner: { id: string; email: string; phone: string; profile?: { firstName: string; lastName: string } | null };
  members: Officer[];
  documents: Array<{ id: string; name: string; category: string; fileUrl: string; version: number; createdAt: string }>;
  subscription?: { status: string; plan: { name: string } } | null;
  decisions: Array<{
    id: string;
    action: string;
    reason: string;
    createdAt: string;
    adminUser?: { firstName: string; lastName: string; email: string };
  }>;
};

/** Anyone whose role is not the plain member post holds one. */
const isOfficerRole = (role: string) => role !== "MEMBER" && role !== "COMMUNITY_MEMBER";

const VERIFICATION_TONE: Record<string, string> = {
  FULL: "bg-emerald-50 text-emerald-700",
  BASIC: "bg-blue-50 text-blue-700",
  PENDING: "bg-slate-100 text-slate-600",
};
const VERIFICATION_LABEL: Record<string, string> = {
  FULL: "Fully verified",
  BASIC: "Basic verified",
  PENDING: "Pending verification",
};
const STATUS_TONE: Record<string, string> = {
  VERIFIED: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  SUSPENDED: "bg-red-50 text-red-600",
  INACTIVE: "bg-slate-100 text-slate-600",
  REJECTED: "bg-slate-100 text-slate-600",
};
const STATUS_LABEL: Record<string, string> = {
  VERIFIED: "Active",
  PENDING: "In review",
  SUSPENDED: "Suspended",
  INACTIVE: "Inactive",
  REJECTED: "Rejected",
};

const day = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(iso)) : "—";
const pretty = (v: string) => v.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

/**
 * How long an application has been waiting.
 *
 * Measured from page load rather than `Date.now()` at render so every row
 * agrees with every other — a list where one row says 3h and the next 4h for
 * the same minute looks broken.
 */
const pageLoadedAt = Date.now();
const waited = (iso: string) => {
  const hours = Math.max(0, Math.floor((pageLoadedAt - new Date(iso).getTime()) / 3_600_000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d` : `${hours}h`;
};

export default function CommunitiesPage() {
  const params = useSearchParams();
  const requested = params.get("id");

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  // Seeded from the link: arriving with `?id=` means the queue's own default
  // of PENDING would hide the very community being asked for.
  const [tab, setTab] = useState(requested ? "ALL" : "PENDING");
  const [selectedId, setSelectedId] = useState<string | null>(requested);
  const [fetched, setFetched] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [toast, setToast] = useState("");
  /** Bumped after any decision, to re-read the open community. */
  const [revision, setRevision] = useState(0);

  const load = useCallback(
    () =>
      adminApi
        .listCommunities({ page: 1, limit: 100 })
        .then((r) => {
          const d = r.data as { items: Row[]; total: number };
          setRows(d.items ?? []);
          setTotal(d.total ?? 0);
          setError("");
        })
        .catch((e: Error) => setError(e.message || "Could not load communities"))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => { void load(); }, [load, revision]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4500); return () => clearTimeout(t); }, [toast]);

  const filtered = useMemo(() => rows.filter((x) => tab === "ALL" || x.status === tab), [rows, tab]);

  /**
   * Which community the right pane shows.
   *
   * Derived from `selectedId` rather than assigned while loading the list, so
   * a refresh after a decision re-reads the same community instead of jumping
   * to the top of the queue — which is what happened before, and meant
   * suspending a community immediately lost it from view.
   */
  const effectiveId =
    selectedId && filtered.some((x) => x.id === selectedId) ? selectedId : filtered[0]?.id ?? null;

  useEffect(() => {
    if (!effectiveId) return;
    let cancelled = false;
    void adminApi
      .getCommunity(effectiveId)
      .then((r) => { if (!cancelled) setFetched(r.data as Detail); })
      .catch((e: Error) => { if (!cancelled) setError(e.message || "Could not open community"); });
    return () => { cancelled = true; };
  }, [effectiveId, revision]);

  /**
   * The open community, derived rather than cleared.
   *
   * Holding the fetched record and comparing its id is what keeps the pane
   * from showing the previous community under the new one's name while the
   * next read is in flight — and it means the effect above never has to set
   * state synchronously to blank it.
   */
  const selected = fetched && fetched.id === effectiveId ? fetched : null;

  const counts = useMemo(
    () => ({
      PENDING: rows.filter((x) => x.status === "PENDING").length,
      VERIFIED: rows.filter((x) => x.status === "VERIFIED").length,
      SUSPENDED: rows.filter((x) => x.status === "SUSPENDED").length,
      INACTIVE: rows.filter((x) => x.status === "INACTIVE").length,
    }),
    [rows],
  );
  /** Applications with nothing uploaded are the ones that stall. */
  const unverified = useMemo(() => rows.filter((x) => x.verificationLevel === "PENDING").length, [rows]);
  const officers = useMemo(() => (selected?.members ?? []).filter((m) => isOfficerRole(m.role)), [selected]);

  /** Both the list and the open community are re-read after any decision. */
  const settled = (message: string) => {
    setToast(message);
    setRevision((n) => n + 1);
  };

  function exportCsv() {
    const header = "rendi_id,community,type,location,status,verification,members";
    const lines = rows.map((x) =>
      [
        x.publicId ?? "",
        `"${x.name.replaceAll('"', '""')}"`,
        x.categoryType ?? "",
        `"${[x.lga, x.state, x.city, x.country].filter(Boolean).join(", ")}"`,
        x.status,
        x.verificationLevel ?? "",
        x._count.members,
      ].join(","),
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([[header, ...lines].join("\n")], { type: "text/csv" }));
    a.download = "communities.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Community management</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Registration &amp; approvals</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Verify a community&rsquo;s documents and officers, decide its application, and set its platform status.
            Every decision is attributed to your account and shown to the community word for word.
          </p>
        </div>
        <button onClick={exportCsv} disabled={!rows.length} className="h-11 shrink-0 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold disabled:opacity-40">
          ⇩ &nbsp;Export
        </button>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "In review", value: counts.PENDING, hint: "awaiting a decision", tone: "border-amber-200 bg-amber-50/60", text: "text-amber-800", sub: "text-amber-700" },
          { label: "No documents yet", value: unverified, hint: "nothing to verify on", tone: "border-slate-200 bg-white", text: "text-slate-950", sub: "text-slate-500" },
          { label: "Active", value: counts.VERIFIED, hint: "operating normally", tone: "border-emerald-200 bg-emerald-50/60", text: "text-emerald-800", sub: "text-emerald-700" },
          { label: "Stopped", value: counts.SUSPENDED + counts.INACTIVE, hint: "suspended or inactive", tone: "border-red-200 bg-red-50/60", text: "text-red-800", sub: "text-red-700" },
        ].map((tile) => (
          <article key={tile.label} className={`rounded-2xl border p-4 shadow-sm ${tile.tone}`}>
            <p className={`text-[11px] font-bold uppercase tracking-wide ${tile.sub}`}>{tile.label}</p>
            <p className={`mt-1.5 text-2xl font-black ${tile.text}`}>{tile.value}</p>
            <p className={`mt-1 text-xs ${tile.sub}`}>{tile.hint}</p>
          </article>
        ))}
      </section>

      <nav className="mt-6 flex gap-5 overflow-x-auto border-b border-slate-200 text-sm">
        {([
          ["PENDING", `In review (${counts.PENDING})`],
          ["VERIFIED", `Active (${counts.VERIFIED})`],
          ["SUSPENDED", `Suspended (${counts.SUSPENDED})`],
          ["INACTIVE", `Inactive (${counts.INACTIVE})`],
          ["ALL", `All (${total})`],
        ] as Array<[string, string]>).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`whitespace-nowrap border-b-2 py-3 transition-colors ${tab === value ? "border-blue-600 font-bold text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">{tab === "PENDING" ? "Verification queue" : "Communities"}</h2>
              <p className="mt-0.5 text-xs text-slate-500">Select one to review its evidence and decide</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{filtered.length} shown</span>
          </div>
          <div className="max-h-[680px] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>{["Community", "Type", "Location", "Waiting", "Status"].map((h) => <th key={h} className="px-3 py-3 font-extrabold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {loading && !filtered.length &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-t border-slate-100"><td colSpan={5} className="px-3 py-4"><div className="h-8 animate-pulse rounded-lg bg-slate-100" /></td></tr>
                  ))}
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={`cursor-pointer border-t border-slate-100 transition-colors ${effectiveId === row.id ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-bold text-white">{initials(row.name)}</span>
                        <span className="min-w-0">
                          <b className="block truncate text-slate-900">{row.name}</b>
                          <span className="text-xs text-slate-500">{row.publicId ?? row.registrationNumber ?? row.id.slice(0, 8)} · {row._count.members} members</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-xs">
                      {row.categoryType ? pretty(row.categoryType) : <span className="text-amber-700">Not categorised</span>}
                    </td>
                    <td className="px-3 py-3.5 text-xs">{[row.lga, row.state, row.city].filter(Boolean).join(", ") || row.country}</td>
                    <td className="px-3 py-3.5 text-xs tabular-nums">{row.status === "PENDING" ? waited(row.createdAt) : day(row.createdAt)}</td>
                    <td className="px-3 py-3.5">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[row.status] ?? "bg-slate-100 text-slate-600"}`}>
                        ● {STATUS_LABEL[row.status] ?? pretty(row.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !filtered.length && (
            <div className="p-12 text-center">
              <p className="text-sm font-bold text-slate-700">Nothing in this queue</p>
              <p className="mt-1 text-xs text-slate-500">Applications appear here as communities submit their verification profile.</p>
            </div>
          )}
        </section>

        {selected ? (
          <aside className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-20">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white">{initials(selected.name)}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-black leading-tight text-slate-950">{selected.name}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {selected.publicId ?? selected.id.slice(0, 8)} · registered {day(selected.createdAt)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[selected.status] ?? "bg-slate-100 text-slate-600"}`}>
                  ● {STATUS_LABEL[selected.status] ?? pretty(selected.status)}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${VERIFICATION_TONE[selected.verificationLevel ?? "PENDING"]}`}>
                  {VERIFICATION_LABEL[selected.verificationLevel ?? "PENDING"]}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selected.organizerFeesEnabled ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                  Organizer fees {selected.organizerFeesEnabled ? "on" : "off"}
                </span>
              </div>
            </div>

            <div className="max-h-[calc(100vh-14rem)] overflow-auto px-5 py-4">
              {selected.halt && (
                <p className={`mb-4 rounded-xl p-3 text-xs leading-5 ${selected.halt.status === "INACTIVE" ? "bg-slate-100 text-slate-700" : "bg-red-50 text-red-700"}`}>
                  <b className="block">
                    {selected.halt.status === "SUSPENDED" ? "Suspended by Rendi" : selected.halt.status === "INACTIVE" ? "Inactive" : "Registration not approved"}
                    {selected.halt.since ? ` · ${day(selected.halt.since)}` : ""}
                  </b>
                  {selected.halt.message}
                </p>
              )}

              {/* The decision controls first, because that is what a reviewer
                  opened this pane to do. The evidence follows, in the order
                  they would check it. */}
              <Section title={selected.status === "PENDING" ? "Decide this application" : "Platform status"} first>
                <CommunityStatusActions community={selected} onDone={settled} onError={setError} />
              </Section>

              <dl className="mt-5 grid grid-cols-[132px_1fr] gap-y-2.5 border-t border-slate-100 pt-4 text-sm">
                {[
                  ["Legal name", selected.legalName],
                  ["Registration no.", selected.registrationNumber],
                  ["Contact", selected.email],
                  ["Phone", selected.phone],
                  ["Location", [selected.lga, selected.state, selected.city, selected.country].filter(Boolean).join(", ")],
                  ["Members", `${selected._count.members} · ${selected._count.ajoGroups} Ajo group${selected._count.ajoGroups === 1 ? "" : "s"}`],
                  ["Subscription", selected.subscription ? `${selected.subscription.plan.name} · ${selected.subscription.status.toLowerCase()}` : null],
                ].map(([label, value]) => (
                  <div key={String(label)} className="col-span-2 grid grid-cols-[132px_1fr] gap-2">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="min-w-0 break-words text-right font-bold text-slate-900">
                      {value || <span className="font-normal text-slate-400">Not recorded</span>}
                    </dd>
                  </div>
                ))}
              </dl>

              <Section title="Owner / applicant">
                <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5">
                  <b className="block text-sm text-slate-900">
                    {selected.owner.profile ? `${selected.owner.profile.firstName} ${selected.owner.profile.lastName}` : selected.owner.email}
                  </b>
                  <span className="text-slate-500">{selected.owner.email} · {selected.owner.phone}</span>
                  <p className="mt-1.5 text-slate-500">
                    Verification is assessed on the community itself — its registration, officers and documents — not the
                    owner personally.
                  </p>
                </div>
              </Section>

              <Section title={`Officers (${officers.length})`}>
                <div className="space-y-2">
                  {officers.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-slate-900">
                        {m.name}
                        {m.adminAccessSuspendedAt && <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">PAUSED</span>}
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{m.title ?? pretty(m.role)}</span>
                      <button
                        onClick={() => setOfficer(m)}
                        title={m.adminAccessSuspendedAt ? "Restore this officer's powers" : "Pause this officer's powers"}
                        className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${m.adminAccessSuspendedAt ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
                      >
                        {m.adminAccessSuspendedAt ? "Restore" : "Pause"}
                      </button>
                    </div>
                  ))}
                  {!officers.length && <p className="text-xs text-slate-400">Only the registrar holds a post so far.</p>}
                  <p className="text-[11px] leading-5 text-slate-500">
                    Pausing an officer stops the actions their post carries, on their next request. They keep the post,
                    their membership and their own records.
                  </p>
                </div>
              </Section>

              <Section title={`Governance documents (${selected.documents.length})`}>
                <div className="space-y-2.5">
                  {selected.documents.map((doc) => (
                    <a key={doc.id} href={doc.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg p-1.5 text-sm transition hover:bg-slate-50">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs text-white">✓</span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-slate-900">{doc.name}</b>
                        <small className="text-slate-500">{pretty(doc.category)} · v{doc.version}</small>
                      </span>
                      <b className="shrink-0 text-blue-600">View</b>
                    </a>
                  ))}
                  {!selected.documents.length && (
                    <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      Nothing uploaded to the governance shelf yet. Use <b>Request document</b> to ask the owner for
                      verification evidence.
                    </p>
                  )}
                </div>
              </Section>

              {selected.decisions.length > 0 && (
                <Section title="Decision history">
                  <div className="space-y-2.5">
                    {selected.decisions.slice(0, 6).map((d) => (
                      <p key={d.id} className="text-xs leading-5 text-slate-600">
                        <b className="text-slate-900">{pretty(d.action)}</b> — {d.reason}
                        <br />
                        <span className="text-slate-400">
                          {d.adminUser ? `${d.adminUser.firstName} ${d.adminUser.lastName}` : "Administrator"} · {day(d.createdAt)}
                        </span>
                      </p>
                    ))}
                  </div>
                </Section>
              )}

              <Link href={`/community/${selected.id}`} className="mt-5 block rounded-xl border border-slate-200 py-2.5 text-center text-xs font-bold text-blue-600 transition hover:bg-slate-50">
                Open the full management page →
              </Link>
            </div>
          </aside>
        ) : (
          <aside className="self-start rounded-2xl border border-dashed border-slate-300 bg-white/50 p-12 text-center">
            <p className="text-sm font-bold text-slate-700">No community selected</p>
            <p className="mt-1 text-xs text-slate-500">Pick one from the queue to review its documents, officers and history.</p>
          </aside>
        )}
      </div>

      {officer && selected && (
        <OfficerAccessDialog
          communityId={selected.id}
          officer={officer}
          onClose={() => setOfficer(null)}
          onDone={settled}
          onError={setError}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[90] max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-5 text-emerald-800 shadow-xl">
          ✓ &nbsp;{toast}
        </div>
      )}
    </main>
  );
}

/** A titled block in the review pane. One component so the rhythm is even. */
function Section({ title, children, first = false }: { title: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div className={first ? "" : "mt-5 border-t border-slate-100 pt-4"}>
      <h3 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </div>
  );
}
