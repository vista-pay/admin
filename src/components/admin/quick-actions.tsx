"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminApi, type AdminSearchResult, type AdminSearchType } from "@/lib/api";
import { useAdminSession } from "@/components/providers/session-provider";

/**
 * Quick actions — the two things an operator opens the console to do:
 * find one record, or start one job.
 *
 * The search box is the part that earns the section. The API has had
 * `/admin/search` — type-ahead across users, transactions, communities,
 * businesses and Ajo groups, searching only the sources the caller's role may
 * open — and nothing in the console was calling it. Every lookup therefore
 * began by guessing which tab the record lived under.
 *
 * The tiles below are jumping-off points, deliberately *not* the six items in
 * "Needs your attention": that card is work queued up, this one is work you
 * start. Each tile is hidden when the signed-in role cannot open it, so the
 * grid shows an operator only what they can actually use rather than tiles
 * that 403.
 */

type Tile = {
  label: string;
  hint: string;
  href: string;
  glyph: string;
  /** Permission key, or null for a route open to any admin. */
  permission: string | null;
  /** True for routes the API gates with @SuperAdminOnly rather than a key. */
  superAdminOnly?: boolean;
};

const TILES: Tile[] = [
  { label: "Find a user", hint: "Profile, wallet, KYC and history", href: "/users", glyph: "◉", permission: "users" },
  { label: "Trace a transaction", hint: "By reference, status or provider", href: "/transactions", glyph: "⇄", permission: "transactions" },
  // Open to every admin: who may decide a given request is settled per
  // request by the API, so gating the tile would hide the queue from the very
  // second approver maker-checker needs.
  { label: "Approvals queue", hint: "Decisions waiting on a second admin", href: "/approvals", glyph: "✓", permission: null },
  { label: "Community dashboard", hint: "Registrations, contributions, Ajo", href: "/community/dashboard", glyph: "♜", permission: "community-oversight" },
  { label: "Member directory", hint: "Search across every community", href: "/community/members", glyph: "⌸", permission: "community-members" },
  { label: "Send announcement", hint: "In-app, email or SMS", href: "/broadcasts", glyph: "◈", permission: null, superAdminOnly: true },
  { label: "Audit trail", hint: "Who did what, from which app", href: "/activity", glyph: "≡", permission: "audit-logs" },
  { label: "System health", hint: "Providers, queues and webhooks", href: "/system-health", glyph: "◍", permission: "system-health" },
];

const TYPE_LABEL: Record<AdminSearchType, string> = {
  USER: "User",
  TRANSACTION: "Transaction",
  COMMUNITY: "Community",
  BUSINESS: "Business",
  AJO_GROUP: "Ajo group",
};
const TYPE_TONE: Record<AdminSearchType, string> = {
  USER: "bg-blue-50 text-blue-700",
  TRANSACTION: "bg-emerald-50 text-emerald-700",
  COMMUNITY: "bg-indigo-50 text-indigo-700",
  BUSINESS: "bg-amber-50 text-amber-800",
  AJO_GROUP: "bg-purple-50 text-purple-700",
};

export function QuickActions() {
  const router = useRouter();
  const { can, profile } = useAdminSession();

  const [query, setQuery] = useState("");
  /**
   * The last reply, tagged with the term it answers.
   *
   * Tagged rather than cleared on every keystroke: clearing meant a
   * synchronous setState in the effect path, and it also let a reply for
   * "ade" render under a box that now reads "adewale". Comparing the tag
   * makes "this reply is stale" a derivation instead of a race.
   */
  const [found, setFound] = useState<{
    term: string;
    results: AdminSearchResult[];
    truncated: boolean;
    error: string;
  } | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const tiles = useMemo(
    () => TILES.filter((tile) => (tile.superAdminOnly ? Boolean(profile?.isSuperAdmin) : can(tile.permission))),
    [can, profile],
  );

  /**
   * Debounced, abortable type-ahead.
   *
   * The abort matters more than the debounce: without it a slow reply for
   * "ade" can land after a fast one for "adewale" and overwrite it, so the
   * dropdown shows results for a query the admin has already typed past.
   */
  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      adminApi
        .search(term, controller.signal)
        .then((res) => {
          setFound({ term, results: res.data.results, truncated: res.data.truncated, error: "" });
          setCursor(-1);
        })
        .catch((cause: Error) => {
          // An aborted request is the expected outcome of typing, not a fault.
          if (controller.signal.aborted) return;
          setFound({ term, results: [], truncated: false, error: cause.message || "Search failed" });
        });
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term]);

  // Derived, so "no reply for what is typed now" cannot disagree with a flag.
  const fresh = term.length >= 2 && found?.term === term ? found : null;
  const results = fresh?.error ? [] : (fresh?.results ?? null);
  const searching = term.length >= 2 && !fresh;
  const error = fresh?.error ?? "";
  // Clamped at use: a shorter result set must not leave the cursor past its end.
  const active = results && cursor >= 0 && cursor < results.length ? cursor : -1;

  /** Click outside closes the dropdown without clearing what was typed. */
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const go = useCallback(
    (result: AdminSearchResult) => {
      setOpen(false);
      // The API decides the destination — the console does not reconstruct a
      // route from a record type it may be wrong about.
      router.push(result.href);
    },
    [router],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!results?.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((current) => (current <= 0 ? results.length - 1 : current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active >= 0 ? active : 0]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && term.length >= 2;

  return (
    <section className="rounded-xl border border-[#E3E8F0] bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#0F172A]">Quick actions</h2>
          <p className="mt-0.5 text-[11px] text-[#64748B]">
            Jump to a record, or start a job. You only see what your role can open.
          </p>
        </div>

        <div ref={boxRef} className="relative w-full sm:max-w-md">
          <label htmlFor="quick-search" className="sr-only">
            Search users, transactions, communities, businesses and Ajo groups
          </label>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" aria-hidden>
            ⌕
          </span>
          <input
            id="quick-search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Name, email, phone, Rendi tag or reference…"
            autoComplete="off"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls="quick-search-results"
            className="h-10 w-full rounded-lg border border-[#E3E8F0] bg-[#F8FAFC] pl-9 pr-9 text-xs outline-none transition focus:border-[#2563EB] focus:bg-white"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setOpen(false); }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-sm leading-none text-slate-400 hover:bg-slate-100"
            >
              ×
            </button>
          )}

          {showDropdown && (
            <div
              id="quick-search-results"
              role="listbox"
              className="absolute left-0 right-0 top-12 z-50 max-h-80 overflow-auto rounded-xl border border-[#E3E8F0] bg-white py-1 shadow-xl"
            >
              {searching && !results && <p className="px-3 py-3 text-[11px] text-slate-500">Searching…</p>}
              {error && <p className="px-3 py-3 text-[11px] text-red-600">{error}</p>}
              {results?.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(result)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${index === active ? "bg-blue-50" : "hover:bg-slate-50"}`}
                >
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${TYPE_TONE[result.type]}`}>
                    {TYPE_LABEL[result.type]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-xs text-[#0F172A]">{result.title}</b>
                    {result.subtitle && <small className="block truncate text-[10px] text-[#64748B]">{result.subtitle}</small>}
                  </span>
                  {result.meta && <span className="shrink-0 text-[10px] text-slate-500">{result.meta}</span>}
                </button>
              ))}
              {results && results.length === 0 && !error && (
                <p className="px-3 py-3 text-[11px] text-slate-500">
                  Nothing matched “{term}” in the records your role can open.
                </p>
              )}
              {fresh?.truncated && results && results.length > 0 && (
                <p className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">
                  More matches exist — narrow the search to see them.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="group flex items-center gap-2.5 rounded-lg border border-[#E3E8F0] bg-[#F8FAFC] p-3 transition hover:border-[#2563EB] hover:bg-white"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm transition group-hover:bg-[#2563EB] group-hover:text-white" aria-hidden>
              {tile.glyph}
            </span>
            <span className="min-w-0">
              <b className="block truncate text-xs text-[#0F172A]">{tile.label}</b>
              <small className="block truncate text-[10px] text-[#64748B]">{tile.hint}</small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
