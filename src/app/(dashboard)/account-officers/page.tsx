"use client";

/**
 * Account officers: the named-contact side of the `dedicated_support` plan
 * feature.
 *
 * Laid out as a mail client rather than a table with a chat bolted beside it.
 * The work here is reading a conversation and answering it, so the
 * conversation gets the room and the list becomes a column of selectable
 * rows — sorted so the ones waiting on a reply are at the top, because a
 * community with messages and no officer is the overdue assignment.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "@/lib/api";
import { AdminSelect } from "@/components/ui/admin-select";
import { Button } from "@/components/ui/button";
import { ChatThread } from "@/components/admin/chat-thread";
import { uploadAccountOfficerFile, type UploadedFile } from "@/lib/upload";
import { cn } from "@/lib/utils";

type OfficerRow = {
  communityId: string;
  name: string;
  slug: string;
  email: string;
  communityStatus: string;
  memberCount: number;
  planCode: string;
  planName: string;
  subscriptionStatus: string;
  officer: { id: string; name: string; email: string; isActive: boolean; note: string | null; assignedAt: string } | null;
  unreadFromCommunity: number;
  lastMessageAt: string | null;
};

type Candidate = { id: string; name: string; email: string; role: string; communities: number };

type Attachment = { id: string; fileName: string; fileUrl: string; mimeType: string; sizeBytes: number };

type ThreadMessage = {
  id: string;
  text: string;
  fromOfficer: boolean;
  author: string;
  readAt: string | null;
  at: string;
  attachments?: Attachment[];
};

type Thread = {
  community: { id: string; name: string; slug: string };
  officer: { id: string; name: string; email: string } | null;
  dedicatedSupport: boolean;
  messages: ThreadMessage[];
};

const when = (value: string | null) => {
  if (!value) return "—";
  const at = new Date(value);
  const hours = (Date.now() - at.getTime()) / 3_600_000;
  if (hours < 24) return at.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
  if (hours < 24 * 7) return at.toLocaleDateString("en-NG", { weekday: "short" });
  return at.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

export default function AccountOfficersPage() {
  const [rows, setRows] = useState<OfficerRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "WAITING" | "UNASSIGNED">("ALL");
  const [search, setSearch] = useState("");

  // Assignment dialog.
  const [assigning, setAssigning] = useState<OfficerRow | null>(null);
  const [candidateId, setCandidateId] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  // Open conversation.
  const [thread, setThread] = useState<Thread | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [list, people] = await Promise.all([
        adminApi.listAccountOfficerCommunities(),
        adminApi.accountOfficerCandidates(),
      ]);
      setRows(list.data as OfficerRow[]);
      setCandidates(people.data as Candidate[]);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load account officers");
    }
  }, []);

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

  async function openThread(row: OfficerRow) {
    try {
      const response = await adminApi.accountOfficerThread(row.communityId);
      setThread(response.data as Thread);
      setDraft("");
      setPending([]);
      // Opening marks their messages read on the server; mirror it locally.
      setRows((current) =>
        current.map((r) => (r.communityId === row.communityId ? { ...r, unreadFromCommunity: 0 } : r)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the conversation");
    }
  }

  async function attach(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = await Promise.all(
        Array.from(files).slice(0, 5).map((file) => uploadAccountOfficerFile(file)),
      );
      setPending((current) => [...current, ...uploaded].slice(0, 5));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not attach that file");
    } finally {
      setUploading(false);
      if (filePicker.current) filePicker.current.value = "";
    }
  }

  async function send() {
    // Files alone are a message: "here is the form" is the form.
    if (!thread || (!draft.trim() && pending.length === 0)) return;
    setBusy(true);
    try {
      const response = await adminApi.replyAccountOfficerThread(
        thread.community.id,
        draft.trim(),
        pending,
      );
      setThread({ ...thread, messages: [...thread.messages, response.data as ThreadMessage] });
      setDraft("");
      setPending([]);
      setRows((current) =>
        current.map((r) =>
          r.communityId === thread.community.id
            ? { ...r, lastMessageAt: new Date().toISOString() }
            : r,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the message");
    } finally {
      setBusy(false);
    }
  }

  function openAssign(row: OfficerRow) {
    setAssigning(row);
    setCandidateId(row.officer?.id ?? "");
    setNote(row.officer?.note ?? "");
    setReason("");
  }

  async function submitAssign(remove = false) {
    if (!assigning || reason.trim().length < 5 || (!remove && !candidateId)) return;
    setBusy(true);
    setError("");
    try {
      await adminApi.assignAccountOfficer(assigning.communityId, {
        adminUserId: remove ? null : candidateId,
        note: note.trim() || undefined,
        reason: reason.trim(),
      });
      setToast(remove ? `${assigning.name} unassigned.` : `${assigning.name} covered.`);
      setAssigning(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the assignment");
    } finally {
      setBusy(false);
    }
  }

  const unassigned = rows.filter((row) => !row.officer).length;
  const waiting = rows.reduce((sum, row) => sum + row.unreadFromCommunity, 0);

  /**
   * Unanswered first, then most recently active. The queue is meant to be
   * worked top-down, and a community waiting three days should not sit below
   * one that was answered an hour ago.
   */
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) =>
        filter === "WAITING"
          ? row.unreadFromCommunity > 0
          : filter === "UNASSIGNED"
            ? !row.officer
            : true,
      )
      .filter(
        (row) =>
          !term ||
          row.name.toLowerCase().includes(term) ||
          row.email.toLowerCase().includes(term),
      )
      .sort((a, b) => {
        if ((b.unreadFromCommunity > 0 ? 1 : 0) !== (a.unreadFromCommunity > 0 ? 1 : 0)) {
          return b.unreadFromCommunity - a.unreadFromCommunity;
        }
        return (
          new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()
        );
      });
  }, [rows, filter, search]);

  const selected = thread ? rows.find((r) => r.communityId === thread.community.id) ?? null : null;

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">Account officers</h1>
          <p className="mt-1 text-sm text-slate-600">
            Communities whose plan includes dedicated support, the admin who covers each one, and
            the conversation with them.
          </p>
        </div>
        <div className="flex gap-2">
          {(
            [
              ["Entitled", rows.length, "ALL"],
              ["Waiting on us", waiting, "WAITING"],
              ["Unassigned", unassigned, "UNASSIGNED"],
            ] as const
          ).map(([label, value, key]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "min-w-[116px] rounded-2xl border px-4 py-2.5 text-left transition-colors",
                filter === key
                  ? "border-[#012A9D] bg-[#012A9D]/5"
                  : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
              <p
                className={cn(
                  "mt-0.5 text-xl font-black",
                  key === "WAITING" && value > 0 && "text-amber-600",
                  key === "UNASSIGNED" && value > 0 && "text-amber-600",
                )}
              >
                {value}
              </p>
            </button>
          ))}
        </div>
      </header>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5 grid min-h-[620px] flex-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* ── The queue ─────────────────────────────────────────────── */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search communities…"
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#012A9D]"
            />
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.map((row) => {
              const active = thread?.community.id === row.communityId;
              return (
                <li key={row.communityId}>
                  <button
                    onClick={() => void openThread(row)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-slate-50 px-3 py-3 text-left transition-colors",
                      active ? "bg-[#012A9D]/5" : "hover:bg-slate-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-black",
                        active ? "bg-[#012A9D] text-white" : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {initials(row.name)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-bold text-slate-900">{row.name}</span>
                        <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                          {when(row.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        {row.officer ? (
                          <span className="truncate text-xs text-slate-500">
                            {row.officer.name}
                          </span>
                        ) : (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            Unassigned
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">· {row.planName}</span>
                      </span>
                    </span>

                    {row.unreadFromCommunity > 0 && (
                      <span className="mt-1 min-w-5 shrink-0 rounded-full bg-[#2563EB] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                        {row.unreadFromCommunity}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}

            {visible.length === 0 && (
              <li className="p-8 text-center text-sm text-slate-500">
                {rows.length === 0
                  ? "No community is on a plan with dedicated support yet. Tick the feature on a plan in Subscriptions → Plans, or move a community onto one in Subscribers."
                  : "Nothing matches this filter."}
              </li>
            )}
          </ul>
        </section>

        {/* ── The conversation ──────────────────────────────────────── */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60">
          {thread ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900">{thread.community.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {thread.officer ? (
                      <>Covered by {thread.officer.name}</>
                    ) : (
                      <span className="text-amber-700">
                        No officer assigned — replies here still reach the community
                      </span>
                    )}
                    {selected && <> · {selected.memberCount} members · {selected.email}</>}
                  </p>
                </div>
                {selected && (
                  <Button variant="outline" size="sm" onClick={() => openAssign(selected)}>
                    {selected.officer ? "Reassign" : "Assign officer"}
                  </Button>
                )}
              </header>

              <ChatThread
                messages={thread.messages.map((message) => ({
                  id: message.id,
                  text: message.text,
                  at: message.at,
                  // Rendi writes on the right; the community answers on the left.
                  mine: message.fromOfficer,
                  author: message.fromOfficer ? `${message.author} · Rendi` : message.author,
                  attachments: message.attachments,
                }))}
                emptyState={
                  <p className="max-w-sm text-center text-sm text-slate-500">
                    No messages yet. Anything you send appears under “Account officer” in this
                    community&rsquo;s portal.
                  </p>
                }
              />

              <div className="border-t border-slate-100 bg-white p-3">
                {pending.length > 0 && (
                  <ul className="mb-2.5 flex flex-wrap gap-2">
                    {pending.map((file) => (
                      <li
                        key={file.fileUrl}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-2.5 pr-1.5 text-xs"
                      >
                        <span className="max-w-[180px] truncate font-medium text-slate-900">
                          {file.fileName}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setPending((c) => c.filter((f) => f.fileUrl !== file.fileUrl))
                          }
                          aria-label={`Remove ${file.fileName}`}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                  className="flex items-end gap-2"
                >
                  <input
                    ref={filePicker}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    className="hidden"
                    onChange={(event) => void attach(event.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Attach a file"
                    loading={uploading}
                    disabled={pending.length >= 5}
                    onClick={() => filePicker.current?.click()}
                  >
                    📎
                  </Button>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    placeholder={`Reply to ${thread.community.name}…`}
                    className="flex-1 resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none transition focus:border-[#012A9D]"
                  />
                  <Button
                    type="submit"
                    loading={busy}
                    disabled={!draft.trim() && pending.length === 0}
                  >
                    Send
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="m-auto max-w-sm p-8 text-center">
              <p className="text-3xl" aria-hidden>
                ☏
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-700">
                Pick a community to open its conversation
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Replies appear under “Account officer” in their portal. Communities waiting on us
                are listed first.
              </p>
            </div>
          )}
        </section>
      </div>

      {assigning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-black">Account officer · {assigning.name}</h2>
            <p className="mt-1 text-xs text-slate-500">
              The named contact this community sees in its portal. Any admin with communities access
              can still reply while they are away.
            </p>

            <label className="mt-4 block text-xs font-bold text-slate-600">Officer</label>
            <AdminSelect containerClassName="mt-1 w-full" value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
              <option value="">Choose an administrator…</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} — {candidate.role}{candidate.communities > 0 ? ` (covers ${candidate.communities})` : ""}
                </option>
              ))}
            </AdminSelect>

            <label className="mt-3 block text-xs font-bold text-slate-600">Note (shown to other admins)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Coverage notes…"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <label className="mt-3 block text-xs font-bold text-slate-600">Reason (recorded in the audit trail)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <div className="mt-4 flex items-center justify-between gap-2">
              {assigning.officer ? (
                <button
                  onClick={() => void submitAssign(true)}
                  disabled={busy || reason.trim().length < 5}
                  className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600 disabled:opacity-50"
                >
                  Remove officer
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setAssigning(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button>
                <button
                  onClick={() => void submitAssign(false)}
                  disabled={busy || !candidateId || reason.trim().length < 5}
                  className="rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <p className="fixed bottom-5 right-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow">{toast}</p>}
    </main>
  );
}
