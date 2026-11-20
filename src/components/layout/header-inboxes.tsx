"use client";

/**
 * The two things in this console that someone outside it is waiting on.
 *
 * A support ticket and a dispute are one job — a customer waiting for an
 * answer — so they share a badge. Account-officer messages are a separate
 * one: a community that bought a named contact and wrote to them. Two
 * glyphs, because "17 waiting" is useless if it cannot say waiting for what.
 *
 * Each opens a panel of the most recent few and every row is a link to the
 * place it can actually be answered. A notification you cannot act on from
 * is a notification people learn to ignore.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminApi, type AccountOfficerInbox, type SupportInbox } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Slow enough to be free, often enough that nobody refreshes to check. */
const POLL_MS = 60_000;

/**
 * Fired by any screen that has just read something the badges count.
 *
 * Without it the counts only moved on the next poll, so an agent who opened a
 * ticket watched the badge keep claiming it was waiting for up to a minute —
 * long enough to conclude the badge is broken and stop believing it.
 */
export const INBOX_CHANGED_EVENT = "rendi:inbox-changed";

/** Call after opening or answering anything the header counts. */
export function notifyInboxChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
}

export function HeaderInboxes() {
  const [support, setSupport] = useState<SupportInbox | null>(null);
  const [officer, setOfficer] = useState<AccountOfficerInbox | null>(null);
  const [open, setOpen] = useState<"support" | "officer" | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    // Settled, not all: a console where one desk is unreachable should still
    // show the other's count rather than two empty bells.
    const [a, b] = await Promise.allSettled([
      adminApi.supportInbox(),
      adminApi.accountOfficerInbox(),
    ]);
    if (a.status === "fulfilled") setSupport(a.value.data as SupportInbox);
    if (b.status === "fulfilled") setOfficer(b.value.data as AccountOfficerInbox);
  }, []);

  useEffect(() => {
    // Every setState here runs after the fetch settles, not during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);

    // Three ways the counts can go stale between polls: a screen read
    // something, the operator came back to the tab, or they were away long
    // enough for the interval to have been throttled.
    const onChanged = () => void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener(INBOX_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onChanged);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener(INBOX_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Click-away and Escape, so an open panel never traps the page.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative flex items-center gap-2">
      <InboxButton
        label="Support and disputes"
        count={support?.total ?? 0}
        active={open === "support"}
        onClick={() => setOpen((current) => (current === "support" ? null : "support"))}
        icon={<LifeRingGlyph />}
      />
      <InboxButton
        label="Account officer messages"
        count={officer?.communitiesWaiting ?? 0}
        active={open === "officer"}
        onClick={() => setOpen((current) => (current === "officer" ? null : "officer"))}
        icon={<HeadsetGlyph />}
      />

      {open === "support" && (
        <Panel
          title="Waiting on support"
          subtitle={
            support
              ? support.total === 0
                ? "Nothing new — everything here has been read"
                : `${support.unreadTickets} unread ticket${support.unreadTickets === 1 ? "" : "s"} · ${support.unreadDisputes} unread dispute${support.unreadDisputes === 1 ? "" : "s"}`
              : "Loading…"
          }
          seeAll={{ href: "/support", label: "Open the support queue" }}
          empty="Nothing open. Every ticket and dispute has been answered."
          rows={(support?.items ?? []).map((item) => ({
            key: `${item.kind}-${item.id}`,
            href: item.href,
            title: item.title,
            meta: `${item.kind === "DISPUTE" ? "Dispute" : "Ticket"} · ${item.from}`,
            at: item.at,
            // Priority is the louder fact when a ticket is both urgent and
            // unread; "New" marks the rest of what the badge counted.
            flag: item.priority !== "NORMAL" ? item.priority : item.unread ? "New" : null,
          }))}
          onNavigate={() => {
            setOpen(null);
            // Opening a row reads it; refresh once the page has had a moment
            // to fetch, so the badge reflects it without waiting for a poll.
            window.setTimeout(() => void load(), 1_200);
          }}
        />
      )}

      {open === "officer" && (
        <Panel
          title="Communities waiting on us"
          subtitle={
            officer
              ? `${officer.total} unread message${officer.total === 1 ? "" : "s"}`
              : "Loading…"
          }
          seeAll={{ href: "/account-officers", label: "Open account officers" }}
          empty="No community is waiting on a reply."
          rows={(officer?.items ?? []).map((item) => ({
            key: item.communityId,
            href: item.href,
            title: item.name,
            meta: item.preview,
            at: item.at,
            flag: item.unread > 1 ? `${item.unread} unread` : null,
          }))}
          onNavigate={() => {
            setOpen(null);
            window.setTimeout(() => void load(), 1_200);
          }}
        />
      )}
    </div>
  );
}

function InboxButton({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${label} — ${count} waiting` : label}
      aria-expanded={active}
      title={label}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-xl border transition-colors",
        active
          ? "border-[#012A9D] bg-[#012A9D]/5 text-[#012A9D]"
          : "border-slate-200 text-slate-600 hover:bg-slate-50",
      )}
    >
      {icon}
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black tabular-nums text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

type PanelRow = {
  key: string;
  href: string;
  title: string;
  meta: string;
  at: string;
  flag: string | null;
};

function Panel({
  title,
  subtitle,
  rows,
  empty,
  seeAll,
  onNavigate,
}: {
  title: string;
  subtitle: string;
  rows: PanelRow[];
  empty: string;
  seeAll: { href: string; label: string };
  onNavigate: () => void;
}) {
  return (
    <div className="absolute right-0 top-12 z-50 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-black text-slate-900">{title}</p>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>

      <ul className="max-h-[320px] overflow-y-auto">
        {rows.map((row) => (
          <li key={row.key}>
            <Link
              href={row.href}
              onClick={onNavigate}
              className="block border-b border-slate-50 px-4 py-2.5 transition-colors hover:bg-slate-50"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="truncate text-[13px] font-semibold text-slate-900">
                  {row.title}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                  {when(row.at)}
                </span>
              </span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                  {row.meta}
                </span>
                {row.flag && (
                  <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                    {row.flag}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}

        {rows.length === 0 && <li className="px-4 py-8 text-center text-xs text-slate-500">{empty}</li>}
      </ul>

      <Link
        href={seeAll.href}
        onClick={onNavigate}
        className="block border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-center text-[12px] font-bold text-[#012A9D] hover:bg-slate-100"
      >
        {seeAll.label}
      </Link>
    </div>
  );
}

const GLYPH = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** A life ring: the desk anyone can call. */
function LifeRingGlyph() {
  return (
    <svg {...GLYPH} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />
    </svg>
  );
}

/** A headset: the named officer a plan buys. */
function HeadsetGlyph() {
  return (
    <svg {...GLYPH} aria-hidden>
      <path d="M4 14v-2a8 8 0 1 1 16 0v2" />
      <path d="M4 14h2.2a1 1 0 0 1 1 1v3.2a1 1 0 0 1-1 1H5.6A1.6 1.6 0 0 1 4 17.6Z" />
      <path d="M20 14h-2.2a1 1 0 0 0-1 1v3.2a1 1 0 0 0 1 1h.6a1.6 1.6 0 0 0 1.6-1.6Z" />
    </svg>
  );
}

/** Short enough for a 360px panel: minutes, hours, then the date. */
function when(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}
