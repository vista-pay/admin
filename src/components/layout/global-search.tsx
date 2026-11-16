"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, type AdminSearchResult, type AdminSearchType } from "@/lib/api";

/** How long to sit still before asking. Roughly one unhurried keystroke. */
const DEBOUNCE_MS = 200;

/** Below this the API returns nothing, so there is no point asking. */
const MIN_CHARS = 2;

const GROUP_LABEL: Record<AdminSearchType, string> = {
  USER: "Users",
  TRANSACTION: "Transactions",
  COMMUNITY: "Communities",
  BUSINESS: "Businesses",
  AJO_GROUP: "Ajo groups",
};

/** Order the groups appear in, regardless of which matched first. */
const GROUP_ORDER: AdminSearchType[] = [
  "USER",
  "TRANSACTION",
  "COMMUNITY",
  "BUSINESS",
  "AJO_GROUP",
];

const GROUP_ICON: Record<AdminSearchType, string> = {
  USER: "◍",
  TRANSACTION: "⇄",
  COMMUNITY: "⬡",
  BUSINESS: "▣",
  AJO_GROUP: "◎",
};

/**
 * The console's global search.
 *
 * It used to guess a destination from the shape of what was typed — a handful
 * of reference prefixes went to transactions, everything else to users — and
 * then navigate to a list page to find out whether anything matched. A
 * community, a business or an Ajo group could not be reached at all, and a
 * mistyped reference quietly searched the wrong screen.
 *
 * Now the API answers as the admin types, across every source their role may
 * open, and each suggestion carries the link to the record itself. Enter on a
 * highlighted row goes straight there; with nothing matched it falls back to
 * the users list so the box is never a dead end.
 */
export function GlobalSearch() {
  const router = useRouter();
  const listId = useId();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** The in-flight request, so a superseded reply never lands. */
  const pending = useRef<AbortController | null>(null);

  const trimmed = query.trim();

  /** Too short to ask. Derived, so no state has to be cleared to show it. */
  const tooShort = trimmed.length < MIN_CHARS;

  // ── Ask, once typing settles ─────────────────────────────────────────
  //
  // Everything that changes state happens inside the timeout or the reply,
  // never in the effect body: a synchronous setState here would re-render on
  // every keystroke before the request had even been made.
  useEffect(() => {
    if (tooShort) return;

    const timer = setTimeout(() => {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setLoading(true);

      adminApi
        .search(trimmed, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          setResults(res.data.results);
          setActive(0);
          setFailed(false);
        })
        .catch(() => {
          // An abort is the expected way a superseded request ends; only a
          // real failure should tell the admin that search is unavailable.
          if (controller.signal.aborted) return;
          setResults([]);
          setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      // Whatever is in flight is for a query that no longer matches the box.
      pending.current?.abort();
    };
  }, [trimmed, tooShort]);

  // ── ⌘K / Ctrl+K focuses, as the hint on the box promises ─────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Clicking away closes it ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  /** Grouped for display, while `ordered` stays flat for the keyboard. */
  const groups = useMemo(() => {
    const byType = new Map<AdminSearchType, AdminSearchResult[]>();
    (tooShort ? [] : results).forEach((r) => {
      const list = byType.get(r.type) ?? [];
      list.push(r);
      byType.set(r.type, list);
    });
    return GROUP_ORDER.filter((t) => byType.has(t)).map((type) => ({
      type,
      items: byType.get(type)!,
    }));
  }, [results, tooShort]);

  /** Flat order the arrow keys walk, matching what is on screen. */
  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const go = useCallback(
    (result: AdminSearchResult) => {
      setOpen(false);
      setQuery("");
      setResults([]);
      inputRef.current?.blur();
      router.push(result.href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!ordered.length) return;
      setOpen(true);
      setActive((current) => {
        const next = e.key === "ArrowDown" ? current + 1 : current - 1;
        // Wraps, so holding one arrow never strands the highlight at an end.
        return (next + ordered.length) % ordered.length;
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const chosen = ordered[active];
      if (chosen) {
        go(chosen);
        return;
      }
      // Nothing matched, but the admin still meant something: hand the query
      // to the users list rather than swallowing the keypress.
      if (trimmed.length >= MIN_CHARS) {
        setOpen(false);
        router.push(`/users?search=${encodeURIComponent(trimmed)}`);
      }
    }
  };

  const showPanel = open && !tooShort;

  return (
    <div ref={rootRef} className="relative mx-auto w-full max-w-[420px]">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
      >
        <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>

      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showPanel && ordered[active] ? `${listId}-${ordered[active].id}` : undefined
        }
        aria-label="Global admin search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search users, phone, tx ref, group, community…"
        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-14 text-xs outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
      />

      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500">
        {/* Derived, not stored: a request aborted by the box being cleared
            never resolves, so a stored flag would spin here for good. */}
        {loading && !tooShort ? "…" : "⌘K"}
      </span>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-12 z-50 max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {failed ? (
            <p className="px-3 py-3 text-[11px] text-red-600">
              Search is unavailable just now. Try again in a moment.
            </p>
          ) : ordered.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-slate-500">
              {loading && !tooShort ? "Searching…" : `Nothing matches “${trimmed}”.`}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.type}>
                <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {GROUP_LABEL[group.type]}
                </p>
                {group.items.map((item) => {
                  const index = ordered.indexOf(item);
                  const highlighted = index === active;
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      id={`${listId}-${item.id}`}
                      role="option"
                      aria-selected={highlighted}
                      type="button"
                      // Mouse down, not click: the input blurs first otherwise
                      // and the panel closes before the click lands.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        go(item);
                      }}
                      onMouseEnter={() => setActive(index)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                        highlighted ? "bg-blue-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-600">
                        {GROUP_ICON[item.type]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-[#0F172A]">
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="block truncate text-[11px] text-slate-500">
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                      {item.meta && (
                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {item.meta}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}

          {ordered.length > 0 && (
            <p className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400">
              ↑↓ to move · ↵ to open · esc to close
            </p>
          )}
        </div>
      )}
    </div>
  );
}
