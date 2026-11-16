"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

/**
 * The campaign composer, shared by /campaigns/new and /campaigns/[id].
 *
 * Consent-aware by construction: the audience is structured rules the server
 * prices live — eligible-and-consented, excluded-for-no-consent and
 * excluded-for-risk are three separate figures an operator reads before
 * anything is saved, let alone sent. The same rules travel with the campaign,
 * so the estimate and the eventual send can never disagree about who was
 * meant.
 *
 * Drafts are editable; anything past draft is read-only here because the
 * checker must approve exactly what they read. Editing a rejected campaign
 * reopens it as a draft.
 */

export type CampaignRules = {
  signedUpDaysAgoAtLeast?: number;
  signedUpDaysAgoAtMost?: number;
  notInAjo?: boolean;
  inAjo?: boolean;
  states?: string[];
  tierAtLeast?: number;
};

type CampaignContent = {
  pushTitle?: string;
  pushBody?: string;
  deepLink?: string;
  abVariant?: string;
  frequencyCap?: string;
  conversionGoal?: string;
};

export type Campaign = {
  id: string;
  code: string;
  name: string;
  objective: string;
  status: string;
  channels: string[];
  audience: { rules?: CampaignRules };
  content: CampaignContent;
  estimatedReach: number;
  scheduledAt: string | null;
  rejectionReason: string | null;
  version: number;
  updatedAt: string;
};

type Estimate = {
  matching: number;
  eligible: number;
  noConsent: number;
  excludedRisk: number;
  channelReach: Record<string, number>;
};

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River",
  "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano",
  "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
  "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];

const CHANNEL_META: Array<{ key: string; label: string; icon: string; note?: string }> = [
  { key: "PUSH", label: "Push", icon: "🔔" },
  { key: "IN_APP", label: "In-app banner", icon: "🖼" },
  { key: "SMS", label: "SMS", icon: "📱", note: "carrier cost applies" },
  { key: "EMAIL", label: "Email", icon: "✉️" },
];

/** Phrases the compliance check refuses to let into a money app's marketing. */
const MISLEADING_CLAIMS = /guaranteed|double your money|risk[- ]free|get rich|instant profit|interest[- ]free money/i;

const STATUS_VARIANT: Record<string, "success" | "warning" | "error" | "info" | "neutral" | "default"> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  APPROVED: "info",
  PUBLISHED: "success",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "neutral",
  REJECTED: "error",
  ARCHIVED: "neutral",
};

export function statusBadge(status: string) {
  return <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>{status.toLowerCase().replace(/_/g, " ")}</Badge>;
}

export function CampaignComposer({ campaign }: { campaign: Campaign | null }) {
  const router = useRouter();
  const editable = !campaign || campaign.status === "DRAFT" || campaign.status === "REJECTED";

  const [name, setName] = useState(campaign?.name ?? "");
  const [objective, setObjective] = useState(campaign?.objective ?? "");
  const [channels, setChannels] = useState<string[]>(campaign?.channels ?? ["PUSH", "IN_APP"]);
  const [rules, setRules] = useState<CampaignRules>(campaign?.audience?.rules ?? {});
  const [content, setContent] = useState<CampaignContent>(campaign?.content ?? {});
  const [scheduledAt, setScheduledAt] = useState(
    campaign?.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : "",
  );

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");

  const [addingRule, setAddingRule] = useState(false);
  const [ruleKind, setRuleKind] = useState("signedUpDaysAgoAtLeast");
  const [ruleValue, setRuleValue] = useState("");

  useEffect(() => {
    adminApi.me().then((r) => setIsSuperAdmin(Boolean(r.data?.isSuperAdmin))).catch(() => undefined);
  }, []);

  // Live estimate: re-priced whenever the audience or channels change.
  const estimateSeq = useRef(0);
  useEffect(() => {
    const seq = ++estimateSeq.current;
    setEstimating(true);
    const handle = setTimeout(() => {
      adminApi
        .estimateCampaignAudience({ rules: rules as Record<string, unknown>, channels })
        .then((r) => {
          if (estimateSeq.current === seq) setEstimate(r.data as Estimate);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => {
          if (estimateSeq.current === seq) setEstimating(false);
        });
    }, 350);
    return () => clearTimeout(handle);
  }, [rules, channels]);

  const ruleChips = useMemo(() => {
    const chips: Array<{ key: keyof CampaignRules; label: string }> = [];
    if (rules.signedUpDaysAgoAtLeast) chips.push({ key: "signedUpDaysAgoAtLeast", label: `Signed up ≥ ${rules.signedUpDaysAgoAtLeast} days` });
    if (rules.signedUpDaysAgoAtMost) chips.push({ key: "signedUpDaysAgoAtMost", label: `Signed up ≤ ${rules.signedUpDaysAgoAtMost} days` });
    if (rules.notInAjo) chips.push({ key: "notInAjo", label: "Not in any Ajo" });
    if (rules.inAjo) chips.push({ key: "inAjo", label: "In an Ajo" });
    if (rules.states?.length) chips.push({ key: "states", label: `State: ${rules.states.join(", ")}` });
    if (rules.tierAtLeast) chips.push({ key: "tierAtLeast", label: `Tier ≥ ${rules.tierAtLeast}` });
    return chips;
  }, [rules]);

  const removeRule = (key: keyof CampaignRules) => setRules((r) => ({ ...r, [key]: undefined }));

  const addRule = () => {
    if (ruleKind === "notInAjo") setRules((r) => ({ ...r, notInAjo: true, inAjo: undefined }));
    else if (ruleKind === "inAjo") setRules((r) => ({ ...r, inAjo: true, notInAjo: undefined }));
    else if (ruleKind === "states") {
      const picked = ruleValue.split(",").map((s) => s.trim()).filter(Boolean);
      if (!picked.length) return;
      setRules((r) => ({ ...r, states: picked }));
    } else {
      const value = Number(ruleValue);
      if (!value || value < 0) return;
      setRules((r) => ({ ...r, [ruleKind]: value }));
    }
    setRuleValue("");
    setAddingRule(false);
  };

  // ── Compliance checks, computed from what is actually configured ──
  const scheduledHourLagos = useMemo(() => {
    if (!scheduledAt) return null;
    const at = new Date(scheduledAt);
    if (Number.isNaN(at.getTime())) return null;
    return Number(new Intl.DateTimeFormat("en", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(at));
  }, [scheduledAt]);
  const misleading = MISLEADING_CLAIMS.test(`${content.pushTitle ?? ""} ${content.pushBody ?? ""}`);
  const quietHours = scheduledHourLagos !== null && (scheduledHourLagos >= 21 || scheduledHourLagos < 7);
  const bigAudience = (estimate?.eligible ?? 0) > 10_000;
  const checks: Array<{ ok: boolean; warn?: boolean; text: string }> = [
    { ok: true, text: "Only users with marketing consent for each channel — the estimate already excludes opt-outs" },
    { ok: true, text: "Opt-out included (“Manage notifications”) on every channel" },
    { ok: !misleading, text: misleading ? "Message contains a guaranteed-return or misleading money claim — rephrase it" : "No guaranteed-return or misleading money claims" },
    { ok: !quietHours, text: quietHours ? "Scheduled inside quiet hours (21:00–07:00 WAT) — move the send time" : "Quiet hours respected (21:00–07:00 WAT)" },
    ...(bigAudience ? [{ ok: false, warn: true, text: "Over 10,000 users → needs Risk or Super Admin approval" }] : []),
  ];

  const payload = () => ({
    name: name.trim(),
    objective: objective.trim(),
    channels,
    audience: { rules },
    content,
    estimatedReach: estimate?.eligible ?? 0,
    ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
  });

  const save = async (): Promise<string | null> => {
    if (!name.trim() || !objective.trim()) {
      setError("Give the campaign a name and an objective before saving.");
      return null;
    }
    setError("");
    setSaving(true);
    try {
      if (campaign) {
        await adminApi.updateCampaign(campaign.id, payload());
        return campaign.id;
      }
      const created = await adminApi.createCampaign(payload());
      return (created.data as { id: string }).id;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the campaign");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    const id = await save();
    if (!id) return;
    setNotice("Draft saved.");
    if (!campaign) router.replace(`/campaigns/${id}`);
    else router.refresh();
  };

  const submitForApproval = async () => {
    const id = await save();
    if (!id) return;
    try {
      await adminApi.submitCampaign(id);
      setNotice("Submitted for approval.");
      router.push("/campaigns");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the campaign");
    }
  };

  const decide = async (status: string) => {
    if (!campaign) return;
    if (status === "REJECTED" && decisionReason.trim().length < 5) {
      setError("Give the maker a reason they can act on.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await adminApi.decideCampaign(campaign.id, { status, reason: decisionReason.trim() || undefined });
      router.push("/campaigns");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The decision was not recorded");
    } finally {
      setSaving(false);
    }
  };

  const num = (value: number | undefined) => (value ?? 0).toLocaleString();

  return (
    <div className="mx-auto max-w-[1240px] p-4 sm:p-8">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {campaign ? `Campaign: “${campaign.name}”` : name ? `New campaign: “${name}”` : "New campaign"}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {campaign && statusBadge(campaign.status)}
            {campaign && <span>{campaign.code} · v{campaign.version} · last saved {formatDate(campaign.updatedAt, { hour: "2-digit", minute: "2-digit" })}</span>}
            <span>campaigns over 10,000 users need a checker</span>
          </div>
          {campaign?.status === "REJECTED" && campaign.rejectionReason && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              Rejected: {campaign.rejectionReason} — editing reopens it as a draft.
            </p>
          )}
        </div>
        {editable ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void saveDraft()} loading={saving}>
              Save draft
            </Button>
            <Button onClick={() => void submitForApproval()} loading={saving}>
              ↗ Submit for approval
            </Button>
          </div>
        ) : campaign?.status === "PENDING_APPROVAL" && isSuperAdmin ? (
          <div className="flex items-start gap-2">
            <input
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              placeholder="Decision note (required to reject)"
              className="h-9 w-64 rounded-lg border border-slate-200 px-3 text-xs"
            />
            <Button variant="destructive" onClick={() => void decide("REJECTED")} loading={saving}>
              Reject
            </Button>
            <Button onClick={() => void decide("APPROVED")} loading={saving}>
              Approve
            </Button>
          </div>
        ) : campaign?.status === "APPROVED" && isSuperAdmin ? (
          <Button onClick={() => void decide("PUBLISHED")} loading={saving}>
            Publish
          </Button>
        ) : campaign?.status === "PUBLISHED" && isSuperAdmin ? (
          <Button variant="outline" onClick={() => void decide("PAUSED")} loading={saving}>
            Pause
          </Button>
        ) : null}
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && !error && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {!editable && campaign && campaign.status === "PENDING_APPROVAL" && !isSuperAdmin && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
          Waiting for a checker. Campaigns pending approval are read-only so the approver reads exactly what was
          submitted.
        </p>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* ── Left column: the four composer sections ── */}
        <div className="space-y-5">
          {/* Name & objective */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Campaign name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!editable}
                  placeholder="Start your first Ajo"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Objective
                <input
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  disabled={!editable}
                  placeholder="Ajo activation for verified users not yet in a group"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                />
              </label>
            </div>
          </section>

          {/* 1 · Audience */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white">1</span>
              Audience
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Segment rules</span>
              {ruleChips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {chip.label}
                  {editable && (
                    <button onClick={() => removeRule(chip.key)} aria-label={`Remove rule ${chip.label}`} className="text-slate-400 hover:text-slate-700">
                      ×
                    </button>
                  )}
                </span>
              ))}
              {ruleChips.length === 0 && <span className="text-xs text-slate-400">none — everyone eligible</span>}
            </div>
            {editable && (
              <div className="mt-3">
                {!addingRule ? (
                  <button onClick={() => setAddingRule(true)} className="rounded-full border border-[#012A9D]/30 px-3 py-1 text-xs font-bold text-[#012A9D] hover:bg-[#012A9D]/5">
                    + Add rule
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={ruleKind} onChange={(e) => { setRuleKind(e.target.value); setRuleValue(""); }} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold">
                      <option value="signedUpDaysAgoAtLeast">Signed up at least N days ago</option>
                      <option value="signedUpDaysAgoAtMost">Signed up within N days</option>
                      <option value="notInAjo">Not in any Ajo</option>
                      <option value="inAjo">In an Ajo</option>
                      <option value="states">State(s)</option>
                      <option value="tierAtLeast">KYC tier at least</option>
                    </select>
                    {(ruleKind === "signedUpDaysAgoAtLeast" || ruleKind === "signedUpDaysAgoAtMost") && (
                      <input value={ruleValue} onChange={(e) => setRuleValue(e.target.value.replace(/\D/g, ""))} placeholder="30" className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-xs" />
                    )}
                    {ruleKind === "tierAtLeast" && (
                      <select value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs">
                        <option value="">Pick a tier</option>
                        <option value="1">Tier 1</option>
                        <option value="2">Tier 2</option>
                        <option value="3">Tier 3</option>
                      </select>
                    )}
                    {ruleKind === "states" && (
                      <input value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} list="ng-states" placeholder="Lagos, Ogun" className="h-9 w-48 rounded-lg border border-slate-200 px-2 text-xs" />
                    )}
                    <datalist id="ng-states">
                      {NIGERIAN_STATES.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                    <Button size="sm" onClick={addRule}>Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingRule(false)}>Cancel</Button>
                  </div>
                )}
              </div>
            )}
            <div className={`mt-4 grid gap-3 sm:grid-cols-3 ${estimating ? "opacity-60" : ""}`}>
              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-xs font-medium text-emerald-800">Eligible &amp; consented</p>
                <strong className="mt-1 block text-2xl text-emerald-900">{num(estimate?.eligible)} users</strong>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Excluded — no consent</p>
                <strong className="mt-1 block text-2xl text-slate-900">{num(estimate?.noConsent)}</strong>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Excluded — frozen / risk</p>
                <strong className="mt-1 block text-2xl text-slate-900">{num(estimate?.excludedRisk)}</strong>
              </div>
            </div>
          </section>

          {/* 2 · Channels */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white">2</span>
              Channels
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CHANNEL_META.map((meta) => {
                const selected = channels.includes(meta.key);
                const reach = estimate?.channelReach?.[meta.key];
                return (
                  <button
                    key={meta.key}
                    disabled={!editable}
                    onClick={() =>
                      setChannels((current) =>
                        current.includes(meta.key) ? current.filter((c) => c !== meta.key) : [...current, meta.key],
                      )
                    }
                    className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-default ${
                      selected ? "border-[#012A9D] bg-[#012A9D]/5" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base">{meta.icon}</span>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-md border text-[11px] ${selected ? "border-[#012A9D] bg-[#012A9D] text-white" : "border-slate-300 bg-white text-transparent"}`}>✓</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-900">{meta.label}</p>
                    <p className="text-[11px] text-slate-500">
                      {reach !== undefined ? `${reach.toLocaleString()} reachable` : "…"}
                      {meta.note ? ` · ${meta.note}` : ""}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3 · Message */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white">3</span>
              Message
            </h2>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-slate-600">
                Push title <span className="text-slate-400">({(content.pushTitle ?? "").length}/40 chars · {"{first_name}"} supported)</span>
                <input
                  value={content.pushTitle ?? ""}
                  maxLength={40}
                  onChange={(e) => setContent((c) => ({ ...c, pushTitle: e.target.value }))}
                  disabled={!editable}
                  placeholder="{first_name}, save with people you trust"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Push body <span className="text-slate-400">({(content.pushBody ?? "").length}/120 chars)</span>
                <input
                  value={content.pushBody ?? ""}
                  maxLength={120}
                  onChange={(e) => setContent((c) => ({ ...c, pushBody: e.target.value }))}
                  disabled={!editable}
                  placeholder="Start an Ajo with friends in minutes. Every contribution and payout is recorded in the app."
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">
                  Deep link
                  <input
                    value={content.deepLink ?? ""}
                    onChange={(e) => setContent((c) => ({ ...c, deepLink: e.target.value }))}
                    disabled={!editable}
                    placeholder="rendi://ajo/create"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  A/B test
                  <input
                    value={content.abVariant ?? ""}
                    onChange={(e) => setContent((c) => ({ ...c, abVariant: e.target.value }))}
                    disabled={!editable}
                    placeholder={'Variant B: "Join an Ajo with an invite code" · 50/50'}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                  />
                </label>
              </div>
            </div>
          </section>

          {/* 4 · Schedule & goal */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white">4</span>
              Schedule &amp; goal
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-medium text-slate-600">
                Send at
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  disabled={!editable}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Frequency cap
                <input
                  value={content.frequencyCap ?? ""}
                  onChange={(e) => setContent((c) => ({ ...c, frequencyCap: e.target.value }))}
                  disabled={!editable}
                  placeholder="Max 2 marketing messages / user / week"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Conversion goal
                <input
                  value={content.conversionGoal ?? ""}
                  onChange={(e) => setContent((c) => ({ ...c, conversionGoal: e.target.value }))}
                  disabled={!editable}
                  placeholder="Creates or joins an Ajo within 7 days"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                />
              </label>
            </div>
          </section>
        </div>

        {/* ── Right rail: preview + compliance ── */}
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">Preview</p>
            <div className="mx-auto w-[280px] rounded-[36px] bg-slate-950 p-3 shadow-xl">
              <div className="rounded-[26px] bg-gradient-to-b from-slate-100 to-slate-200 p-3 pb-16">
                <p className="px-1 text-xs font-semibold text-slate-700">9:41</p>
                <div className="mt-3 rounded-2xl bg-white/95 p-3 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">🔵 RENDI · now</p>
                  <p className="mt-1 text-xs font-bold text-slate-900">
                    {(content.pushTitle || "{first_name}, save with people you trust").replace("{first_name}", "Adaeze")}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                    {content.pushBody || "Start an Ajo with friends in minutes. Every contribution and payout is recorded in the app."}
                  </p>
                </div>
                {channels.includes("IN_APP") && (
                  <div className="mt-3 rounded-2xl bg-slate-950 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-blue-400">New</p>
                    <p className="mt-0.5 text-xs font-bold text-white">{name || "Start your first Ajo"}</p>
                    <span className="mt-2 inline-block rounded-lg bg-[#2563EB] px-3 py-1 text-[10px] font-bold text-white">
                      {content.deepLink?.includes("ajo") ? "Create Ajo" : "Open"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold">Compliance checks</h2>
            <ul className="mt-3 space-y-2.5">
              {checks.map((check) => (
                <li key={check.text} className="flex items-start gap-2 text-xs leading-4">
                  <span className={check.ok ? "text-emerald-600" : check.warn ? "text-amber-500" : "text-red-600"}>
                    {check.ok ? "✓" : check.warn ? "⚠" : "✕"}
                  </span>
                  <span className={check.ok ? "text-slate-600" : check.warn ? "text-amber-700" : "text-red-700"}>{check.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
