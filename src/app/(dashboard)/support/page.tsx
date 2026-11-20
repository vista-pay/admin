"use client";

/**
 * The support queue — every ticket a customer or a community has raised.
 *
 * The console could already answer a dispute and could open one ticket by
 * reference (that is how an Enterprise enquiry was handled), but there was
 * no list: nothing told an admin that a community had written in, so the
 * only tickets ever answered were the ones somebody already knew about.
 *
 * Laid out like the account-officer screen on purpose. The two are the same
 * job — a conversation with somebody waiting — and an admin should not have
 * to learn a second shape for it.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/api";
import { AdminSelect } from "@/components/ui/admin-select";
import { Button } from "@/components/ui/button";
import { ChatThread } from "@/components/admin/chat-thread";
import { notifyInboxChanged } from "@/components/layout/header-inboxes";
import { cn } from "@/lib/utils";

type QueueRow = {
  reference: string;
  subject: string;
  category: string;
  /** What the customer typed when they picked "Other" as the subject. */
  subcategory?: string | null;
  status: string;
  priority: string;
  lastActivityAt: string;
  createdAt: string;
  assignedAdminId: string | null;
  user?: { id: string; email: string | null; phone: string | null } | null;
  community?: { id: string; name: string } | null;
  /** EMAIL means it arrived at support@rendi.ng and the reply leaves by mail. */
  channel?: "APP" | "EMAIL";
  requesterEmail?: string | null;
  requesterName?: string | null;
};

type TicketMessage = {
  id: string;
  authorType: string;
  authorName: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  attachments?: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    sizeBytes: number;
  }>;
};

type TicketDetail = QueueRow & {
  description: string;
  transactionReference: string | null;
  messages: TicketMessage[];
};

const STATUSES = ["SUBMITTED", "UNDER_REVIEW", "WAITING_FOR_INFO", "RESOLVED", "CLOSED"] as const;

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  WAITING_FOR_INFO: "Waiting on them",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

/** Who is actually waiting on this: a community, an account, or an address. */
const requester = (row: QueueRow) =>
  row.community?.name ?? row.requesterName ?? row.requesterEmail ?? row.user?.email ?? "A customer";

/**
 * What it is about. "Other" is the one category that says nothing on its own,
 * so the customer types the real subject and it is carried here — showing the
 * code alone would hide the only part of it an agent can triage from.
 */
const categoryLabel = (row: QueueRow) => {
  const label = row.category.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return row.subcategory ? `${label} · ${row.subcategory}` : label;
};

/** Open means somebody is still waiting; the rest is history. */
const OPEN_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "WAITING_FOR_INFO"];

export default function SupportQueuePage() {
  return (
    <Suspense fallback={null}>
      <SupportQueue />
    </Suspense>
  );
}

function SupportQueue() {
  const params = useSearchParams();
  const router = useRouter();
  const deepLink = params.get("ticket");

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [filter, setFilter] = useState<"OPEN" | "ALL">("OPEN");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await adminApi.listSupportTickets();
      setRows(response.data as QueueRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the queue");
    }
  }, []);

  const open = useCallback(async (reference: string) => {
    setError("");
    try {
      const response = await adminApi.supportTicket(reference);
      setTicket(response.data as TicketDetail);
      // Fetching it is what marks it read on the server; the header badge
      // has no way to know that happened unless it is told.
      notifyInboxChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open that ticket");
    }
  }, []);

  useEffect(() => {
    // Every setState here runs after the fetch settles, not during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Arriving from the header inbox, which links straight at one ticket.
  useEffect(() => {
    // Settles before it writes, same as the queue load above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (deepLink) void open(deepLink);
  }, [deepLink, open]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows
      .filter((row) => (filter === "OPEN" ? OPEN_STATUSES.includes(row.status) : true))
      .filter((row) =>
        !needle
          ? true
          : `${row.subject} ${row.reference} ${row.community?.name ?? ""} ${row.user?.email ?? ""}`
              .toLowerCase()
              .includes(needle),
      );
  }, [rows, filter, search]);

  const openCount = rows.filter((row) => OPEN_STATUSES.includes(row.status)).length;

  async function reply() {
    const body = draft.trim();
    if (!body || !ticket) return;
    setBusy(true);
    setError("");
    try {
      await adminApi.replySupportTicket(ticket.reference, { body, isInternal: internal });
      setDraft("");
      await open(ticket.reference);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send that reply");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    if (!ticket) return;
    setBusy(true);
    try {
      await adminApi.updateSupportTicketStatus(ticket.reference, { status });
      await open(ticket.reference);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the status");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setTicket(null);
    // Drop the deep link too, or coming back re-opens what was just closed.
    if (deepLink) router.replace("/support");
  }

  return (
    <main className="mx-auto flex h-[calc(100dvh-3.5rem)] min-h-0 w-full max-w-[1500px] flex-col overflow-hidden p-3 sm:p-4 lg:h-[calc(100dvh-4rem)] lg:px-6 lg:py-4">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="text-xl font-black">Support</h1>
          <p className="hidden truncate text-xs text-slate-500 sm:block">
            What customers and communities have asked Rendi
          </p>
        </div>

        <div className="flex shrink-0 rounded-xl border border-slate-200 bg-white p-0.5">
          {(
            [
              ["Open", openCount, "OPEN"],
              ["All", rows.length, "ALL"],
            ] as const
          ).map(([label, value, key]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                filter === key ? "bg-[#012A9D] text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {label}
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11px] font-black tabular-nums",
                  filter === key
                    ? "bg-white/20 text-white"
                    : value > 0 && key === "OPEN"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-600",
                )}
              >
                {value}
              </span>
            </button>
          ))}
        </div>
      </header>

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-3 grid min-h-0 flex-1 gap-3 lg:grid-cols-[340px_1fr]">
        <section
          className={cn(
            "min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white",
            ticket ? "hidden lg:flex" : "flex",
          )}
        >
          <div className="border-b border-slate-100 p-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search subject, reference, community…"
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#012A9D]"
            />
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.map((row) => (
              <li key={row.reference}>
                <button
                  onClick={() => void open(row.reference)}
                  className={cn(
                    "w-full border-b border-slate-50 px-3 py-3 text-left transition-colors",
                    ticket?.reference === row.reference ? "bg-[#012A9D]/5" : "hover:bg-slate-50",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="truncate text-[13px] font-bold text-slate-900">
                      {row.subject}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                      {when(row.lastActivityAt)}
                    </span>
                  </span>
                  <span className="mt-1 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold",
                        OPEN_STATUSES.includes(row.status)
                          ? "bg-amber-50 text-amber-800"
                          : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                    {row.channel === "EMAIL" && (
                      <span
                        className="shrink-0 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700"
                        title="Arrived by email; replies go back by email"
                      >
                        MAIL
                      </span>
                    )}
                    <span className="truncate text-[11px] text-slate-500">
                      {requester(row)}
                    </span>
                    {row.priority !== "NORMAL" && (
                      <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                        {row.priority}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}

            {visible.length === 0 && (
              <li className="p-8 text-center text-sm text-slate-500">
                {rows.length === 0
                  ? "Nothing has been raised yet."
                  : filter === "OPEN"
                    ? "Nothing open — everything has been answered."
                    : "Nothing matches that search."}
              </li>
            )}
          </ul>
        </section>

        <section
          className={cn(
            "min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60",
            ticket ? "flex" : "hidden lg:flex",
          )}
        >
          {ticket ? (
            <>
              <header className="flex items-center gap-3 border-b border-slate-100 bg-white px-3 py-2.5 sm:px-4">
                <button
                  type="button"
                  onClick={close}
                  aria-label="Back to the queue"
                  className="-ml-1 shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
                >
                  ‹
                </button>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{ticket.subject}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {ticket.reference} · {categoryLabel(ticket)} · {requester(ticket)}
                    {ticket.channel === "EMAIL" && ticket.requesterEmail && (
                      <> · by email from {ticket.requesterEmail}</>
                    )}
                    {ticket.transactionReference && <> · tx {ticket.transactionReference}</>}
                  </p>
                </div>

                <AdminSelect
                  containerClassName="w-[150px] shrink-0"
                  value={ticket.status}
                  disabled={busy}
                  onChange={(event) => void setStatus(event.target.value)}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </option>
                  ))}
                </AdminSelect>
              </header>

              {/*
                The facts, folded away.
                
                They used to sit open in a four-column grid above a repeat of
                the opening message, which together pushed the conversation
                off the bottom of the screen — the one thing an agent is here
                to read. Requester, category and reference are already on the
                header line above, so the grid was saying it twice; what is
                left behind the toggle is the detail nobody needs until they
                need it.
              */}
              <details className="group border-b border-slate-200 bg-white open:bg-slate-50/60">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-50">
                  <span className="transition group-open:rotate-90" aria-hidden>›</span>
                  Ticket details
                  <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${ticket.priority === "NORMAL" ? "bg-slate-100 text-slate-600" : "bg-red-50 text-red-700"}`}>
                    {ticket.priority.toLowerCase()} urgency
                  </span>
                  {ticket.transactionReference && (
                    <span className="truncate text-[10px] font-medium text-slate-500">
                      tx {ticket.transactionReference}
                    </span>
                  )}
                </summary>
                <div className="grid gap-3 px-4 pb-4 md:grid-cols-4">
                  <TicketFact label="Requester" value={requester(ticket)} />
                  <TicketFact label="Category" value={categoryLabel(ticket)} verbatim />
                  <TicketFact label="Urgency" value={ticket.priority.toLowerCase()} />
                  <TicketFact label="Reference" value={ticket.reference} />
                  {ticket.transactionReference && (
                    <TicketFact label="Transaction reference" value={ticket.transactionReference} />
                  )}
                </div>
              </details>

              {/*
                The opening message is left in the thread rather than lifted
                out of it. It *is* the customer's first message — pulling it
                into a box above meant the conversation started mid-sentence,
                and its attachments were stranded up there away from the reply
                they belong to.
              */}
              <ChatThread
                messages={[
                  // A ticket whose opening message was never recorded as one
                  // — an email that arrived before the thread existed, say —
                  // would otherwise show an empty conversation and lose the
                  // complaint entirely. Synthesised only when no message
                  // already carries it, so the normal case stays one message.
                  ...(ticket.messages.some((message) => message.body.trim() === ticket.description.trim())
                    ? []
                    : [
                        {
                          id: `${ticket.reference}-opening`,
                          text: ticket.description,
                          at: ticket.createdAt,
                          mine: false,
                          author: requester(ticket),
                          attachments: undefined,
                        },
                      ]),
                  ...ticket.messages
                    .map((message) => ({
                    id: message.id,
                    // An internal note is marked, or an admin cannot tell what
                    // the customer has actually been told.
                    text: message.isInternal ? `🔒 Internal · ${message.body}` : message.body,
                    at: message.createdAt,
                    mine: message.authorType === "AGENT",
                    author:
                      message.authorType === "AGENT"
                        ? `${message.authorName} · Rendi`
                        : message.authorName,
                    attachments: message.attachments,
                  })),
                ]}
                emptyState={<p className="text-center text-sm text-slate-500">No replies yet.</p>}
              />

              <div className="border-t border-slate-100 bg-white p-2.5">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void reply();
                  }}
                  className="flex items-end gap-2"
                >
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={2}
                    placeholder={
                      internal
                        ? "Note for other admins…"
                        : ticket.channel === "EMAIL"
                          ? `Reply — emailed to ${ticket.requesterEmail ?? "them"}`
                          : "Reply to them…"
                    }
                    className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#012A9D]"
                  />
                  <Button type="submit" loading={busy} disabled={!draft.trim()}>
                    Send
                  </Button>
                </form>

                <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(event) => setInternal(event.target.checked)}
                  />
                  Internal note — kept off the customer&rsquo;s screen
                </label>
              </div>
            </>
          ) : (
            <div className="m-auto max-w-sm p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">
                Pick a request to read it
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Tickets from the app, from businesses and from communities all arrive here.
                Replies reach them wherever they raised it.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function TicketFact({
  label,
  value,
  /**
   * Title-casing is for enum values read out of the database. Anything the
   * customer typed keeps their capitalisation — "Bank Statement Request" is
   * not what they wrote, and a reference or an address it would mangle.
   */
  verbatim = false,
}: {
  label: string;
  value: string;
  verbatim?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[13px] font-medium text-slate-900",
          !verbatim && "capitalize",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function when(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}
