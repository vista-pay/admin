"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { statusBadge } from "@/components/admin/campaign-composer";
import { formatDate } from "@/lib/utils";

/**
 * Referrals & promotions.
 *
 * Rewards are paid only for qualified, non-abusive activity; a record that
 * fails qualification is voided and its reward is never spent. The abuse
 * panel reports exactly what the referral records say — withheld pending
 * qualification, and voided — rather than a list of detection rules the
 * backend does not expose.
 */

type Program = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  currencyCode: string;
  referrerRewardAmount: string;
  refereeRewardAmount: string;
  qualificationRules: { qualifiesWhen?: string; limits?: string } | null;
  budget: string | null;
  startsAt: string | null;
  endsAt: string | null;
  _count?: { referrals: number };
};

type Promotion = {
  id: string;
  code: string;
  name: string;
  description: string;
  kind: string;
  status: string;
  audience: { summary?: string } | null;
  reward: { summary?: string } | null;
  budget: string | null;
  currencyCode: string;
  startsAt: string | null;
  endsAt: string | null;
  redemptionLimit: number | null;
  redemptionCount: number;
};

type Payload = {
  programs: Program[];
  promotions: Promotion[];
  totals: { referrals: number; qualified: number; paid: number; conversionRate: number };
  kpis?: {
    signups30: { value: number; previous: number; deltaPct: number | null };
    qualified: { value: number; qualifyRate: number };
    rewardsPaid: { totalNgn: number; last30Ngn: number };
    blocked: { value: number; estimatedSavedNgn: number; pendingReview: number };
  };
};

const naira = (value: number | string) => `₦${Number(value).toLocaleString()}`;

export default function Page() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [creatingProgram, setCreatingProgram] = useState(false);
  const [creatingPromotion, setCreatingPromotion] = useState(false);

  const load = useCallback(() => {
    adminApi
      .referrals()
      .then((r) => setData(r.data as Payload))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    adminApi.me().then((r) => setIsSuperAdmin(Boolean(r.data?.isSuperAdmin))).catch(() => undefined);
  }, [load]);

  // The programme the card shows: the live one if there is one, else the
  // most recently created — an admin mid-setup should see their draft.
  const program =
    data?.programs.find((p) => ["APPROVED", "PUBLISHED", "ACTIVE"].includes(p.status)) ?? data?.programs[0] ?? null;
  const kpis = data?.kpis;
  const programPerReferral = program ? Number(program.referrerRewardAmount) + Number(program.refereeRewardAmount) : 0;
  const budgetUsedPct =
    program?.budget && Number(program.budget) > 0 && kpis
      ? Math.min(100, Math.round((kpis.rewardsPaid.last30Ngn / Number(program.budget)) * 100))
      : null;

  const decidePromotion = async (promotion: Promotion, status: string) => {
    const reason =
      status === "REJECTED" ? window.prompt("Reason for rejecting (shown to the maker):")?.trim() : undefined;
    if (status === "REJECTED" && (!reason || reason.length < 5)) return;
    setBusy(true);
    setError("");
    try {
      if (status === "PENDING_APPROVAL") await adminApi.submitPromotion(promotion.id);
      else await adminApi.decidePromotion(promotion.id, { status, reason });
      setNotice(`"${promotion.name}" moved to ${status.toLowerCase().replace(/_/g, " ")}.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The decision was not recorded");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-0 flex-1 bg-[#F8FAFC]">
      <header className="border-b border-[#E3E8F0] bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Referrals &amp; promotions</h1>
            <p className="mt-1 text-xs text-slate-500">
              Rewards are paid only for qualified, non-abusive activity · budgets stop automatically when exhausted
            </p>
          </div>
          <Button onClick={() => setCreatingPromotion(true)}>+ New promotion</Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] space-y-4 p-4 sm:p-8">
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {notice && !error && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}
        {!data ? (
          <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
        ) : (
          <>
            {/* ── KPI cards ── */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Referral sign-ups (30d)</p>
                <strong className="mt-2 block text-2xl">{(kpis?.signups30.value ?? 0).toLocaleString()}</strong>
                <p className="mt-2 text-[11px] text-slate-500">
                  {kpis?.signups30.deltaPct !== null && kpis?.signups30.deltaPct !== undefined ? (
                    <span className={kpis.signups30.deltaPct >= 0 ? "font-bold text-emerald-700" : "font-bold text-red-700"}>
                      {kpis.signups30.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(kpis.signups30.deltaPct)}%
                    </span>
                  ) : (
                    "—"
                  )}{" "}
                  vs previous 30 days
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Qualified referrals</p>
                <strong className="mt-2 block text-2xl">{(kpis?.qualified.value ?? 0).toLocaleString()}</strong>
                <p className="mt-2 text-[11px] text-slate-500">{kpis?.qualified.qualifyRate ?? 0}% of all referrals qualify</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Rewards paid</p>
                <strong className="mt-2 block text-2xl">{naira(kpis?.rewardsPaid.totalNgn ?? 0)}</strong>
                <p className="mt-2 text-[11px] text-slate-500">
                  {naira(kpis?.rewardsPaid.last30Ngn ?? 0)} in the last 30 days
                  {program ? ` · ${naira(program.referrerRewardAmount)} + ${naira(program.refereeRewardAmount)} each` : ""}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Blocked as abuse</p>
                <strong className="mt-2 block text-2xl">{(kpis?.blocked.value ?? 0).toLocaleString()}</strong>
                <p className="mt-2 text-[11px] text-slate-500">≈{naira(kpis?.blocked.estimatedSavedNgn ?? 0)} in rewards never paid</p>
              </article>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
              {/* ── The programme ── */}
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold">{program ? `“${program.name}” programme` : "Referral programme"}</h2>
                  {program && statusBadge(program.status)}
                </div>
                {!program ? (
                  <div className="mt-6 text-center">
                    <p className="text-sm text-slate-500">No referral programme yet.</p>
                    <Button variant="outline" className="mt-3" onClick={() => setCreatingProgram(true)}>
                      Create programme
                    </Button>
                  </div>
                ) : (
                  <>
                    <dl className="mt-4 space-y-3 text-sm">
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-xs text-slate-500">Referrer reward</dt>
                        <dd className="font-bold">{naira(program.referrerRewardAmount)} to wallet</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-xs text-slate-500">New user reward</dt>
                        <dd className="font-bold">{naira(program.refereeRewardAmount)} to wallet</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="shrink-0 text-xs text-slate-500">Qualifies when</dt>
                        <dd className="text-right text-xs font-semibold text-slate-700">
                          {program.qualificationRules?.qualifiesWhen ?? "Set by the qualification rules"}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-xs text-slate-500">Limits</dt>
                        <dd className="text-right text-xs font-semibold text-slate-700">
                          {program.qualificationRules?.limits ?? "—"}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-xs text-slate-500">Referrals recorded</dt>
                        <dd className="font-bold tabular-nums">{(program._count?.referrals ?? 0).toLocaleString()}</dd>
                      </div>
                      {program.budget && (
                        <div>
                          <div className="flex items-baseline justify-between gap-4">
                            <dt className="text-xs text-slate-500">30-day spend vs budget</dt>
                            <dd className="text-xs font-bold tabular-nums">
                              {naira(kpis?.rewardsPaid.last30Ngn ?? 0)} of {naira(program.budget)}
                            </dd>
                          </div>
                          {budgetUsedPct !== null && (
                            <div className="mt-2 h-2 rounded bg-slate-100">
                              <div
                                className={`h-2 rounded ${budgetUsedPct >= 90 ? "bg-amber-500" : "bg-[#012A9D]"}`}
                                style={{ width: `${budgetUsedPct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </dl>
                    <Button variant="outline" className="mt-5 w-full" onClick={() => setEditingProgram(program)}>
                      ✎ Edit programme (needs approval)
                    </Button>
                  </>
                )}
              </article>

              {/* ── Abuse & review ── */}
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-bold">Abuse &amp; review</h2>
                <p className="mt-1 text-xs text-slate-500">
                  A reward is paid only after the referred user qualifies. Everything below is live from the referral
                  records.
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 p-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Withheld pending qualification</p>
                      <p className="text-xs text-slate-500">
                        Rewards are not paid until the friend completes the qualification rules — money-in-then-out and
                        same-device patterns never qualify.
                      </p>
                    </div>
                    <span className="text-lg font-black tabular-nums text-amber-600">
                      {(kpis?.blocked.pendingReview ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 p-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Voided as abusive or unqualified</p>
                      <p className="text-xs text-slate-500">
                        Permanently refused — the reward is returned to the budget rather than paid.
                      </p>
                    </div>
                    <span className="text-lg font-black tabular-nums text-red-600">
                      {(kpis?.blocked.value ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 p-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Paid to date</p>
                      <p className="text-xs text-slate-500">Qualified on both sides and credited to wallets.</p>
                    </div>
                    <span className="text-lg font-black tabular-nums text-emerald-600">
                      {(data.totals.paid ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </article>
            </section>

            {/* ── Promotions ── */}
            <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-4">
                <h2 className="text-sm font-bold">Promotions</h2>
              </div>
              {data.promotions.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-400">
                  No promotions yet. Create one with “New promotion” above — it starts as a draft and goes through
                  approval before anything is spent.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="p-3 font-semibold">Promotion</th>
                        <th className="p-3 font-semibold">Mechanic</th>
                        <th className="p-3 font-semibold">Audience</th>
                        <th className="p-3 font-semibold">Budget used</th>
                        <th className="p-3 font-semibold">Ends</th>
                        <th className="p-3 font-semibold">Status</th>
                        <th className="p-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.promotions.map((promotion) => {
                        const usedPct = promotion.redemptionLimit
                          ? Math.min(100, Math.round((promotion.redemptionCount / promotion.redemptionLimit) * 100))
                          : null;
                        return (
                          <tr key={promotion.id} className="border-t border-slate-100">
                            <td className="p-3">
                              <p className="font-semibold text-slate-900">{promotion.name}</p>
                              <p className="text-slate-400">{promotion.code}</p>
                            </td>
                            <td className="max-w-[220px] p-3 text-slate-600">
                              <p className="truncate" title={promotion.description}>
                                {promotion.reward?.summary ?? promotion.description}
                              </p>
                              <p className="text-[10px] uppercase tracking-wide text-slate-400">{promotion.kind}</p>
                            </td>
                            <td className="max-w-[160px] truncate p-3 text-slate-600" title={promotion.audience?.summary}>
                              {promotion.audience?.summary ?? "All users"}
                            </td>
                            <td className="p-3">
                              {usedPct !== null ? (
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-20 rounded bg-slate-100">
                                    <div
                                      className={`h-1.5 rounded ${usedPct >= 90 ? "bg-amber-500" : "bg-[#012A9D]"}`}
                                      style={{ width: `${usedPct}%` }}
                                    />
                                  </div>
                                  <span className="tabular-nums font-semibold">{usedPct}%</span>
                                </div>
                              ) : (
                                <span className="text-slate-400">no cap</span>
                              )}
                            </td>
                            <td className="p-3 tabular-nums text-slate-600">
                              {promotion.endsAt
                                ? formatDate(promotion.endsAt)
                                : promotion.startsAt && new Date(promotion.startsAt) > new Date()
                                  ? `Starts ${formatDate(promotion.startsAt)}`
                                  : "—"}
                            </td>
                            <td className="p-3">
                              {usedPct !== null && usedPct >= 90 && promotion.status !== "REJECTED" ? (
                                <Badge variant="warning">{usedPct}% of budget</Badge>
                              ) : (
                                statusBadge(promotion.status)
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {(promotion.status === "DRAFT" || promotion.status === "REJECTED") && (
                                <button
                                  disabled={busy}
                                  onClick={() => void decidePromotion(promotion, "PENDING_APPROVAL")}
                                  className="font-bold text-[#012A9D] hover:underline"
                                >
                                  Submit
                                </button>
                              )}
                              {promotion.status === "PENDING_APPROVAL" && isSuperAdmin && (
                                <span className="inline-flex gap-2">
                                  <button
                                    disabled={busy}
                                    onClick={() => void decidePromotion(promotion, "APPROVED")}
                                    className="font-bold text-emerald-700 hover:underline"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    disabled={busy}
                                    onClick={() => void decidePromotion(promotion, "REJECTED")}
                                    className="font-bold text-red-600 hover:underline"
                                  >
                                    Reject
                                  </button>
                                </span>
                              )}
                              {promotion.status === "APPROVED" && isSuperAdmin && (
                                <button
                                  disabled={busy}
                                  onClick={() => void decidePromotion(promotion, "PUBLISHED")}
                                  className="font-bold text-[#012A9D] hover:underline"
                                >
                                  Publish
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </>
        )}
      </main>

      {(editingProgram || creatingProgram) && (
        <ProgramModal
          program={editingProgram}
          onClose={() => {
            setEditingProgram(null);
            setCreatingProgram(false);
          }}
          onSaved={(message) => {
            setEditingProgram(null);
            setCreatingProgram(false);
            setNotice(message);
            load();
          }}
        />
      )}
      {creatingPromotion && (
        <PromotionModal
          onClose={() => setCreatingPromotion(false)}
          onSaved={() => {
            setCreatingPromotion(false);
            setNotice("Promotion draft created. Submit it for approval when it is ready.");
            load();
          }}
        />
      )}
    </div>
  );
}

/**
 * Create or edit the referral programme. An edit is applied immediately but
 * pulls the programme back to pending approval — rewards decide what the
 * platform pays, so a second admin reads every change.
 */
function ProgramModal({
  program,
  onClose,
  onSaved,
}: {
  program: Program | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(program?.name ?? "Invite a friend");
  const [referrer, setReferrer] = useState(program ? Number(program.referrerRewardAmount).toString() : "500");
  const [referee, setReferee] = useState(program ? Number(program.refereeRewardAmount).toString() : "500");
  const [qualifiesWhen, setQualifiesWhen] = useState(
    program?.qualificationRules?.qualifiesWhen ?? "Friend verifies Tier 1 + adds ₦5,000 within 14 days",
  );
  const [limits, setLimits] = useState(program?.qualificationRules?.limits ?? "20 rewards / user / month");
  const [budget, setBudget] = useState(program?.budget ? Number(program.budget).toString() : "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (program && reason.trim().length < 5) {
      setError("Say why the programme is changing — the checker and the audit trail read it.");
      return;
    }
    setBusy(true);
    setError("");
    const body = {
      name,
      referrerRewardAmount: referrer || "0",
      refereeRewardAmount: referee || "0",
      qualificationRules: { qualifiesWhen, limits },
      ...(budget ? { budget } : {}),
    };
    try {
      if (program) {
        await adminApi.updateReferralProgram(program.id, { ...body, reason: reason.trim() });
        onSaved("Programme updated — it is now pending approval.");
      } else {
        await adminApi.createReferralProgram(body);
        onSaved("Programme draft created.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the programme");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <h2 className="text-lg font-black">{program ? "Edit referral programme" : "New referral programme"}</h2>
        <p className="mt-1 text-xs text-slate-500">
          {program
            ? "Changes apply as a new pending-approval version. Rewards keep paying on the old terms until a checker approves."
            : "Starts as a draft; a checker approves it before any reward is paid."}
        </p>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        <div className="mt-4 space-y-3 text-xs font-medium text-slate-600">
          <label className="block">
            Programme name
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              Referrer reward (₦)
              <input value={referrer} onChange={(e) => setReferrer(e.target.value.replace(/[^\d.]/g, ""))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
            <label className="block">
              New user reward (₦)
              <input value={referee} onChange={(e) => setReferee(e.target.value.replace(/[^\d.]/g, ""))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
          </div>
          <label className="block">
            Qualifies when
            <input value={qualifiesWhen} onChange={(e) => setQualifiesWhen(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              Limits
              <input value={limits} onChange={(e) => setLimits(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
            <label className="block">
              Monthly budget (₦, optional)
              <input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} placeholder="5000000" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
          </div>
          {program && (
            <label className="block">
              Reason for the change <span className="text-red-600">*</span>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm" />
            </label>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            {program ? "Submit change for approval" : "Create draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PromotionModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("FEE_WAIVER");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState("");
  const [reward, setReward] = useState("");
  const [budget, setBudget] = useState("");
  const [redemptionLimit, setRedemptionLimit] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim() || description.trim().length < 5 || !reward.trim()) {
      setError("Name, a description of at least five characters, and the mechanic are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await adminApi.createPromotion({
        name: name.trim(),
        description: description.trim(),
        kind,
        audience: { summary: audience.trim() || "All users" },
        reward: { summary: reward.trim() },
        ...(budget ? { budget } : {}),
        ...(redemptionLimit ? { redemptionLimit: Number(redemptionLimit) } : {}),
        ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}),
        ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the promotion");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <h2 className="text-lg font-black">New promotion</h2>
        <p className="mt-1 text-xs text-slate-500">Starts as a draft and goes through approval before anything is spent.</p>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        <div className="mt-4 space-y-3 text-xs font-medium text-slate-600">
          <label className="block">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Zero Ajo platform fee — first cycle" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              Kind
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
                <option value="FEE_WAIVER">Fee waiver</option>
                <option value="CASHBACK">Cashback</option>
                <option value="BONUS">Bonus</option>
                <option value="FEATURED">Featured placement</option>
              </select>
            </label>
            <label className="block">
              Audience
              <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="New organizers" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
          </div>
          <label className="block">
            Mechanic
            <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Rendi fee waived for new groups" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="block">
            Description
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it is, who it is for, and how it ends" className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              Budget (₦, optional)
              <input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
            <label className="block">
              Redemption limit
              <input value={redemptionLimit} onChange={(e) => setRedemptionLimit(e.target.value.replace(/\D/g, ""))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              Starts
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
            <label className="block">
              Ends
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </label>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            Create draft
          </Button>
        </div>
      </div>
    </div>
  );
}
