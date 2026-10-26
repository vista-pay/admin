"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { type Admin, type KybInfo, type KybStatus, KybBadge, RiskCell, fmtShort } from "../kyb-shared";

type Member = { id: string; userId: string; name: string; email: string; phone?: string; role: string; isActive: boolean };
type SettlementAccount = { id: string; bankName: string; accountNumber: string; accountName: string; isDefault: boolean };

type BizDetail = {
  id: string;
  name: string;
  registrationNumber?: string | null;
  taxId?: string | null;
  email: string;
  phone?: string | null;
  website?: string | null;
  industry?: string | null;
  businessType?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  accountStatus: string;
  createdAt: string;
  kyb: KybInfo | null;
  members: Member[];
  settlementAccounts: SettlementAccount[];
};

/** The stage moves a reviewer can make from each open state. */
const NEXT_STAGES: Record<KybStatus, { to: KybStatus; label: string }[]> = {
  SUBMITTED: [{ to: "IN_REVIEW", label: "Start review" }],
  IN_REVIEW: [
    { to: "AWAITING_INFORMATION", label: "Request information" },
    { to: "READY_FOR_APPROVAL", label: "Ready for approval" },
  ],
  AWAITING_INFORMATION: [{ to: "IN_REVIEW", label: "Resume review" }],
  READY_FOR_APPROVAL: [{ to: "IN_REVIEW", label: "Back to review" }],
  APPROVED: [],
  REJECTED: [{ to: "IN_REVIEW", label: "Reopen review" }],
};

export default function BusinessReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [biz, setBiz] = useState<BizDetail | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [reason, setReason] = useState("");
  const [newIssue, setNewIssue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<BizDetail>(`/admin/businesses/${id}`);
      setBiz(r.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this business");
    }
  }, [id]);

  useEffect(() => {
    void load();
    apiFetch<{ items?: Admin[] } | Admin[]>("/admin/admins")
      .then((r) => {
        const raw = r.data as { items?: Admin[] } | Admin[];
        setAdmins(Array.isArray(raw) ? raw : (raw.items ?? []));
      })
      .catch(() => setAdmins([]));
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function patch(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      await apiFetch(`/admin/businesses/${id}/kyb`, { method: "PATCH", body: JSON.stringify(body) });
      setToast(success);
      setError("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (!biz) {
    return (
      <div className="min-w-0 flex-1 bg-[#F8FAFC] p-8">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : <p className="text-sm text-slate-500">Loading application…</p>}
      </div>
    );
  }

  const kyb = biz.kyb;
  const open = kyb && kyb.status !== "APPROVED" && kyb.status !== "REJECTED";

  return (
    <div className="min-w-0 flex-1 bg-[#F8FAFC]">
      <main className="mx-auto max-w-[1240px] space-y-5 p-4 sm:p-6 lg:p-8">
        <Link href="/businesses" className="text-sm font-semibold text-[#012A9D] hover:underline">← Businesses</Link>

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-[25px] font-extrabold tracking-tight text-[#0F172A]">{biz.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {kyb?.reference ?? "No KYB application"}
              {biz.registrationNumber ? ` · RC ${biz.registrationNumber}` : ""}
              {kyb ? ` · Submitted ${fmtShort(kyb.submittedAt)}` : ""}
            </p>
          </div>
          {kyb && <KybBadge status={kyb.status} />}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-bold text-[#0F172A]">Legal entity</h2>
              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {(
                  [
                    ["Registered email", biz.email],
                    ["Phone", biz.phone],
                    ["Website", biz.website],
                    ["Tax ID", biz.taxId],
                    ["Business type", biz.businessType],
                    ["Industry", biz.industry],
                    ["Address", [biz.address, biz.city, biz.state, biz.country].filter(Boolean).join(", ")],
                    ["Account status", biz.accountStatus],
                    ["Created", fmtShort(biz.createdAt)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-0.5 font-medium text-[#0F172A]">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="px-5 pt-5 text-base font-bold text-[#0F172A]">Directors & members</h2>
              <p className="px-5 pb-3 pt-1 text-xs text-slate-500">People with access to this business account. Verify their personal KYC under Users.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-2">Name</th>
                    <th className="px-5 py-2">Email</th>
                    <th className="px-5 py-2">Role</th>
                    <th className="px-5 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {biz.members.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">No members attached.</td></tr>
                  ) : (
                    biz.members.map((m) => (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className="px-5 py-3 font-medium text-[#0F172A]">
                          <Link href={`/users/${m.userId}`} className="hover:text-[#012A9D] hover:underline">{m.name}</Link>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{m.email}</td>
                        <td className="px-5 py-3 text-slate-600">{m.role}</td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${m.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{m.isActive ? "Active" : "Inactive"}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-bold text-[#0F172A]">Settlement accounts</h2>
              {biz.settlementAccounts.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No settlement accounts registered.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {biz.settlementAccounts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-2.5">
                      <span className="font-medium text-[#0F172A]">{a.bankName} · {a.accountNumber}</span>
                      <span className="text-xs text-slate-500">{a.accountName}{a.isDefault ? " · Default" : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <aside className="space-y-5">
            {kyb ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="text-base font-bold text-[#0F172A]">KYB application</h2>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {NEXT_STAGES[kyb.status].map((s) => (
                      <button
                        key={s.to}
                        disabled={busy}
                        onClick={() => void patch({ status: s.to }, `Moved to ${s.label.toLowerCase()}.`)}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0F172A] hover:bg-slate-50 disabled:opacity-40"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500">Risk level</label>
                      <select
                        value={kyb.riskLevel}
                        disabled={busy}
                        onChange={(e) => void patch({ riskLevel: e.target.value }, "Risk level updated.")}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500">Assigned reviewer</label>
                      <select
                        value={kyb.assignee?.id ?? ""}
                        disabled={busy}
                        onChange={(e) => void patch({ assignedToId: e.target.value }, e.target.value ? "Reviewer assigned." : "Reviewer unassigned.")}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                      >
                        <option value="">Unassigned</option>
                        {admins.map((a) => (
                          <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={kyb.eddRequired}
                      disabled={busy}
                      onChange={(e) => void patch({ eddRequired: e.target.checked }, "EDD flag updated.")}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Enhanced due diligence required
                  </label>

                  <p className="mt-4 text-sm">
                    Current risk: <RiskCell risk={kyb.riskLevel} edd={kyb.eddRequired} />
                  </p>

                  {kyb.decisionReason && kyb.status === "REJECTED" && (
                    <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">Rejection reason: {kyb.decisionReason}</div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="text-base font-bold text-[#0F172A]">Evidence needs attention</h2>
                  <p className="mt-1 text-xs text-slate-500">Outstanding items the business must resolve before approval.</p>
                  <ul className="mt-3 space-y-2">
                    {kyb.issues.map((issue, i) => (
                      <li key={`${issue}-${i}`} className="flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <span>{issue}</span>
                        <button
                          disabled={busy}
                          onClick={() => void patch({ issues: kyb.issues.filter((_, j) => j !== i) }, "Issue resolved.")}
                          className="font-bold text-amber-700 hover:text-amber-900"
                          aria-label="Remove issue"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                    {kyb.issues.length === 0 && <li className="text-sm text-slate-500">Nothing outstanding.</li>}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={newIssue}
                      onChange={(e) => setNewIssue(e.target.value)}
                      placeholder="e.g. Address proof out of date"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:border-[#012A9D] focus:outline-none"
                    />
                    <button
                      disabled={busy || newIssue.trim().length < 3}
                      onClick={() => {
                        void patch({ issues: [...kyb.issues, newIssue.trim()] }, "Issue recorded.");
                        setNewIssue("");
                      }}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="text-base font-bold text-[#0F172A]">Decision</h2>
                  {open ? (
                    <>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        placeholder="Reason — required to reject, recorded either way"
                        className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-[#012A9D] focus:outline-none"
                      />
                      <div className="mt-3 flex gap-2">
                        <button
                          disabled={busy || reason.trim().length < 5}
                          onClick={() => void patch({ status: "REJECTED", reason: reason.trim() }, "Application rejected.")}
                          className="h-10 flex-1 rounded-lg bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-40"
                        >
                          Reject
                        </button>
                        <button
                          disabled={busy || kyb.issues.length > 0}
                          onClick={() => void patch({ status: "APPROVED", reason: reason.trim() || undefined }, "Business approved.")}
                          className="h-10 flex-1 rounded-lg bg-[#012A9D] px-4 text-sm font-bold text-white disabled:opacity-40"
                        >
                          Approve
                        </button>
                      </div>
                      {kyb.issues.length > 0 && <p className="mt-2 text-xs text-amber-700">Resolve the outstanding evidence issues before approving.</p>}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-slate-600">
                      Decided {kyb.decidedAt ? fmtShort(kyb.decidedAt) : ""} — {kyb.status === "APPROVED" ? "approved" : "rejected"}. Reopen the review to change it.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No KYB application yet for this business.</div>
            )}
          </aside>
        </section>
      </main>
      {toast && <div className="fixed bottom-5 right-5 z-[90] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl">✓ {toast}</div>}
    </div>
  );
}
