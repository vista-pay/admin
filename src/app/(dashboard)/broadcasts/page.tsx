"use client";
import { useCallback, useEffect, useState } from "react";
import { AdminBroadcast, adminApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TD, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { useAdminSession } from "@/components/providers/session-provider";

const STATUS_VARIANT: Record<AdminBroadcast["status"], "success" | "warning" | "error" | "neutral"> = {
  SENT: "success",
  SCHEDULED: "warning",
  FAILED: "error",
  DRAFT: "neutral",
};

const emptyForm = { title: "", body: "" };

export default function BroadcastsPage() {
  const { profile, loading } = useAdminSession();
  const [broadcasts, setBroadcasts] = useState<AdminBroadcast[] | null>(null);
  const [compose, setCompose] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await adminApi.listBroadcasts();
      setBroadcasts(res.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load platform updates");
    }
  }, []);
  useEffect(() => { if (profile?.isSuperAdmin) void load(); }, [profile?.isSuperAdmin, load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 6000); return () => clearTimeout(t); }, [toast]);

  // Delivery runs in the background after sending; keep polling while any
  // broadcast is still SCHEDULED so recipient/delivered counts fill in.
  const hasPending = broadcasts?.some((b) => b.status === "SCHEDULED") ?? false;
  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => { void load(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [hasPending, load]);

  const canSend = form.title.trim().length >= 3 && form.body.trim().length >= 5;

  async function submit() {
    if (!canSend) return;
    setBusy(true);
    try {
      await adminApi.sendBroadcast({ title: form.title.trim(), body: form.body.trim() });
      setCompose(false);
      setForm(emptyForm);
      setToast("Update sent — delivery is running");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send the update"); }
    finally { setBusy(false); }
  }

  if (!loading && !profile?.isSuperAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">⚿</p>
          <h2 className="mt-3 text-lg font-bold text-[#0F172A]">Access restricted</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Platform updates can only be sent by a super admin.
          </p>
        </div>
      </div>
    );
  }

  return <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black">Platform updates</h1>
        <p className="mt-1 text-sm text-slate-600">Send an update to every app user — delivered as a push notification and an in-app message.</p>
      </div>
      <Button onClick={() => { setForm(emptyForm); setCompose(true); }}>New update</Button>
    </header>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    <section className="mt-5">
      {broadcasts === null ? (
        <Card><CardContent className="p-10 text-center text-sm text-slate-500">Loading platform updates…</CardContent></Card>
      ) : broadcasts.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-slate-500">No updates sent yet. Compose your first platform update to reach every app user.</CardContent></Card>
      ) : (
        <Table className="min-w-[760px]">
          <THead>
            <tr>
              <TH>Title</TH>
              <TH>Status</TH>
              <TH>Recipients</TH>
              <TH>Delivered</TH>
              <TH>Sent</TH>
              <TH>By</TH>
            </tr>
          </THead>
          <tbody>
            {broadcasts.map((b) => <TR key={b.id}>
              <TD className="max-w-[360px]">
                <b className="block text-slate-900">{b.title}</b>
                <span className="block truncate text-xs text-slate-500">{b.body}</span>
              </TD>
              <TD>
                <Badge variant={STATUS_VARIANT[b.status]}>{b.status === "SCHEDULED" ? "Sending" : b.status.charAt(0) + b.status.slice(1).toLowerCase()}</Badge>
                {b.status === "FAILED" && b.failureReason && <span className="mt-1 block text-xs text-red-600">{b.failureReason}</span>}
              </TD>
              <TD>{b.recipientCount}</TD>
              <TD>{b.deliveredCount}</TD>
              <TD>{formatDate(b.sentAt ?? b.createdAt)}</TD>
              <TD>{b.createdBy.firstName} {b.createdBy.lastName}</TD>
            </TR>)}
          </tbody>
        </Table>
      )}
    </section>

    {compose && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6">
      <div className="flex justify-between"><h2 className="text-lg font-black">New platform update</h2><button onClick={() => setCompose(false)} className="text-xl">×</button></div>
      <div className="mt-4">
        <Input
          label="Title"
          value={form.title}
          maxLength={120}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g. Scheduled maintenance this weekend"
          hint={`${form.title.length}/120`}
        />
      </div>
      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Message</span>
        <textarea
          rows={5}
          maxLength={500}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="What should every user know?"
          className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#012A9D] focus:outline-none focus:ring-2 focus:ring-[#012A9D]/20"
        />
        <span className="text-xs text-slate-500">{form.body.length}/500</span>
      </label>
      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">Sends immediately to all active users. This cannot be unsent.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => setCompose(false)}>Cancel</Button>
        <Button loading={busy} disabled={!canSend} onClick={submit}>Send to all users</Button>
      </div>
    </div></div>}

    {toast && <div className="fixed bottom-5 right-5 z-[90] max-w-md rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-xl">✓ {toast}</div>}
  </main>;
}
