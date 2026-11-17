"use client";

import { useState } from "react";
import { adminApi, approvalChallengeOf } from "@/lib/api";
import { AdminSelect } from "@/components/ui/admin-select";

/**
 * Every platform decision about a community, as one component.
 *
 * Shared by the verification queue and by the community's own management
 * page. It used to live only on the queue, with the management page carrying
 * a "Manage status →" link — which dropped the operator on a list filtered to
 * the review queue where their community was not, so the actions were
 * effectively unreachable for any community already decided.
 *
 * One component rather than two copies: each action can answer 428 instead of
 * acting when its approval policy demands a second administrator, and that
 * handling is worth having in exactly one place.
 */

export type CommunityForActions = {
  id: string;
  name: string;
  status: string;
  verificationLevel?: string | null;
  categoryType?: string | null;
};

type Action =
  | "suspend"
  | "deactivate"
  | "reactivate"
  | "verify-basic"
  | "verify-full"
  | "request"
  | "approve"
  | "reject";

const TITLE: Record<Action, string> = {
  suspend: "Suspend this community",
  deactivate: "Mark this community inactive",
  reactivate: "Reactivate this community",
  "verify-basic": "Set verification to Basic",
  "verify-full": "Set verification to Fully verified",
  request: "Request verification document",
  approve: "Approve community in limited mode",
  reject: "Reject application",
};

const DONE: Record<Action, string> = {
  suspend: "Community suspended. Officers and members lose access on their next request.",
  deactivate: "Community marked inactive.",
  reactivate: "Community reactivated.",
  "verify-basic": "Verification set to Basic.",
  "verify-full": "Verification set to Fully verified.",
  request: "Document request sent to the community owner.",
  approve: "Community approved in limited mode.",
  reject: "Community application rejected.",
};

/** Mirrors the API's CommunityCategory. A closed list: it drives reporting. */
const CATEGORIES: Array<[string, string]> = [
  ["COOPERATIVE", "Cooperative society"],
  ["AJO_THRIFT", "Ajo / thrift group"],
  ["STAFF_COOPERATIVE", "Staff cooperative"],
  ["TRADE_ASSOCIATION", "Trade association"],
  ["OTHER_COMMUNITY", "Other community group"],
];

const DOCUMENTS = [
  "CAC certificate",
  "Cooperative registration certificate",
  "Constitution or bye-laws",
  "Proof of address",
  "Officer identification",
  "Bank statement",
  "Other supporting document",
];

const pretty = (v: string) => v.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function CommunityStatusActions({
  community,
  onDone,
  onError,
}: {
  community: CommunityForActions;
  /** Called with a message after anything succeeds — including a 428. */
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [legalName, setLegalName] = useState("");
  const [documentType, setDocumentType] = useState(DOCUMENTS[0]);
  const [busy, setBusy] = useState(false);

  // Every decision but "approve" and "request document" needs a written
  // reason: it is shown to the community verbatim and stored on the record,
  // so the current state explains itself.
  const needsReason = action !== null && action !== "approve" && action !== "request";
  const minReason = action === "reject" ? 5 : 10;
  const close = () => { setAction(null); setNote(""); setLegalName(""); };

  /** A gated action answers 428 rather than acting. Report it as an approval. */
  function report(e: unknown, fallback: string) {
    const challenge = approvalChallengeOf(e);
    if (challenge) {
      const outstanding = challenge.approvals.required - challenge.approvals.given;
      onDone(
        `Submitted for approval as ${challenge.reference}. ${outstanding} more approval${outstanding === 1 ? "" : "s"} needed before it takes effect.`,
      );
      return;
    }
    onError(e instanceof Error ? e.message : fallback);
  }

  /** Categorisation is a correction, not a sanction, so it needs no reason. */
  async function saveCategory(categoryType: string) {
    setBusy(true);
    try {
      await adminApi.setCommunityCategory(community.id, { categoryType });
      onDone("Category set.");
    } catch (e) {
      report(e, "Could not set the category");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!action) return;
    if (needsReason && note.trim().length < minReason) return;
    setBusy(true);
    const reason = note.trim();
    try {
      if (action === "suspend") await adminApi.suspendCommunity(community.id, reason);
      else if (action === "deactivate") await adminApi.deactivateCommunity(community.id, reason);
      else if (action === "reactivate") await adminApi.reactivateCommunity(community.id, reason);
      else if (action === "verify-basic") await adminApi.setCommunityVerificationLevel(community.id, { level: "BASIC", reason });
      else if (action === "verify-full") await adminApi.setCommunityVerificationLevel(community.id, { level: "FULL", reason, ...(legalName.trim() ? { legalName: legalName.trim() } : {}) });
      else if (action === "request") await adminApi.requestCommunityDocument(community.id, { documentType, note: reason || undefined });
      else await adminApi.reviewCommunity(community.id, { approve: action === "approve", reason: reason || undefined, organizerFeesEnabled: false });
      onDone(DONE[action]);
    } catch (e) {
      report(e, "Action failed");
    } finally {
      setBusy(false);
      close();
    }
  }

  const decided = ["VERIFIED", "SUSPENDED", "INACTIVE"].includes(community.status);
  const verification = community.verificationLevel ?? "PENDING";

  return (
    <>
      {community.status === "PENDING" && (
        <>
          <p className="mb-3 rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            ⓘ Limited approval allows membership and dues while organizer fees and financial services stay restricted.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setAction("request")} className="h-11 rounded-xl border border-slate-300 text-sm font-bold transition hover:bg-slate-50">▢ &nbsp;Request document</button>
            <button onClick={() => setAction("approve")} className="h-11 rounded-xl bg-blue-600 text-sm font-bold text-white transition hover:bg-blue-700">✓ &nbsp;Approve limited</button>
            <button onClick={() => setAction("reject")} className="col-span-2 h-11 rounded-xl bg-red-600 text-sm font-bold text-white transition hover:bg-red-700">Reject application</button>
          </div>
        </>
      )}

      {decided && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {verification !== "BASIC" && verification !== "FULL" && (
              <button onClick={() => setAction("verify-basic")} className="h-11 rounded-xl border border-slate-300 text-sm font-bold transition hover:bg-slate-50">Set Basic</button>
            )}
            {verification !== "FULL" && (
              <button onClick={() => setAction("verify-full")} className="h-11 rounded-xl border border-slate-300 text-sm font-bold transition hover:bg-slate-50">Set Fully verified</button>
            )}
            {community.status === "VERIFIED" && (
              <>
                <button onClick={() => setAction("deactivate")} className="h-11 rounded-xl border border-slate-300 text-sm font-bold transition hover:bg-slate-50">Mark inactive</button>
                <button onClick={() => setAction("suspend")} className="col-span-2 h-11 rounded-xl bg-red-600 text-sm font-bold text-white transition hover:bg-red-700">Suspend community</button>
              </>
            )}
            {(community.status === "SUSPENDED" || community.status === "INACTIVE") && (
              <button onClick={() => setAction("reactivate")} className="col-span-2 h-11 rounded-xl bg-emerald-600 text-sm font-bold text-white transition hover:bg-emerald-700">✓ &nbsp;Reactivate community</button>
            )}
            {/* Available after a decision too: the governance shelf is asked
                for again whenever a certificate expires or a verification
                tier is being raised. */}
            <button onClick={() => setAction("request")} className="col-span-2 h-11 rounded-xl border border-slate-300 text-sm font-bold transition hover:bg-slate-50">▢ &nbsp;Request document</button>
            <AdminSelect
              aria-label="Set the community category"
              value={community.categoryType ?? ""}
              onChange={(e) => { const v = e.target.value; if (v) void saveCategory(v); }}
              containerClassName="col-span-2 w-full"
            >
              <option value="">{community.categoryType ? `Category: ${pretty(community.categoryType)}` : "Set a category…"}</option>
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </AdminSelect>
          </div>
          <p className="mt-2.5 text-[11px] leading-5 text-slate-500">
            Suspending stops all activity across the portal and the mobile app on the next request. Members keep read
            access to their own contributions, savings and records, and to the notice explaining why. Balances are
            untouched.
          </p>
        </>
      )}

      {community.status === "REJECTED" && (
        <p className="rounded-xl bg-slate-100 p-3 text-xs leading-5 text-slate-600">
          This registration was not approved, so there is no status to manage. The community would have to apply again.
        </p>
      )}

      {action && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-black leading-tight text-slate-950">{TITLE[action]}</h2>
              <button onClick={close} aria-label="Close" className="-mt-1 shrink-0 rounded-lg p-1 text-xl leading-none text-slate-400 hover:bg-slate-100">×</button>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This decision is attributed to your admin account and written to the central activity stream.
              {needsReason && " The reason is shown to the community word for word."}
            </p>
            {action === "suspend" && (
              <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">
                Every officer and member of {community.name} loses access on their next request. Their own records stay
                readable, and their personal wallets are untouched.
              </p>
            )}
            {action === "request" && (
              <AdminSelect aria-label="Document required" value={documentType} onChange={(e) => setDocumentType(e.target.value)} containerClassName="mt-4 w-full">
                {DOCUMENTS.map((d) => <option key={d}>{d}</option>)}
              </AdminSelect>
            )}
            {action === "verify-full" && (
              <input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Legal name exactly as the document carries it (optional)" className="mt-4 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" />
            )}
            {action !== "approve" && (
              <textarea
                autoFocus
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={action === "request" ? "Optional instructions for the owner" : action === "reject" ? "Reason for rejection" : `Why (at least ${minReason} characters)`}
                className="mt-3 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-blue-500"
              />
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={close} className="h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold">Cancel</button>
              <button
                disabled={busy || (needsReason && note.trim().length < minReason)}
                onClick={submit}
                className={`h-11 rounded-xl px-5 text-sm font-bold text-white transition disabled:opacity-40 ${action === "reject" || action === "suspend" ? "bg-red-600 hover:bg-red-700" : action === "reactivate" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"}`}
              >
                {busy ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Pause or restore one officer's powers.
 *
 * Alongside the status actions because it is the same kind of decision — a
 * platform decision about a community, gated the same way — and the two were
 * written as one dialog pattern on the queue page before this.
 */
export function OfficerAccessDialog({
  communityId,
  officer,
  onClose,
  onDone,
  onError,
}: {
  communityId: string;
  officer: { id: string; name: string; role: string; title?: string | null; adminAccessSuspendedAt?: string | null; adminAccessSuspensionReason?: string | null };
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const paused = Boolean(officer.adminAccessSuspendedAt);

  async function submit() {
    if (reason.trim().length < 10) return;
    setBusy(true);
    try {
      if (paused) {
        await adminApi.restoreCommunityAdministrator(communityId, officer.id, reason.trim());
        onDone(`${officer.name} has their powers back.`);
      } else {
        await adminApi.suspendCommunityAdministrator(communityId, officer.id, reason.trim());
        onDone(`${officer.name} can no longer act for this community.`);
      }
    } catch (e) {
      const challenge = approvalChallengeOf(e);
      if (challenge) onDone(`Submitted for approval as ${challenge.reference}.`);
      else onError(e instanceof Error ? e.message : "Could not change the officer's access");
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-black leading-tight text-slate-950">
            {paused ? `Restore ${officer.name}` : `Pause ${officer.name}`}
          </h2>
          <button onClick={onClose} aria-label="Close" className="-mt-1 shrink-0 rounded-lg p-1 text-xl leading-none text-slate-400 hover:bg-slate-100">×</button>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {paused
            ? `${officer.name} gets back the actions their post carries.`
            : `${officer.name} keeps the post of ${officer.title ?? pretty(officer.role)} and their membership. What stops is the actions the post carries, from their next request. The reason is shown to them word for word.`}
        </p>
        {paused && officer.adminAccessSuspensionReason && (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            <b>Paused because:</b> {officer.adminAccessSuspensionReason}
          </p>
        )}
        <textarea autoFocus rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (at least 10 characters)" className="mt-3 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-blue-500" />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold">Cancel</button>
          <button
            disabled={busy || reason.trim().length < 10}
            onClick={submit}
            className={`h-11 rounded-xl px-5 text-sm font-bold text-white transition disabled:opacity-40 ${paused ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
