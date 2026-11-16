"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { statusBadge, type Campaign } from "@/components/admin/campaign-composer";
import { formatDate } from "@/lib/utils";

/**
 * The campaign desk. Creation and editing happen in the composer — this page
 * is for finding a campaign and reading its state at a glance: who it is for,
 * how it goes out, how many it reaches, and where it sits in review.
 */
export default function Page() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("ALL");

  useEffect(() => {
    adminApi
      .campaigns()
      .then((r) => setRows(r.data as Campaign[]))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const tabs = [
    ["ALL", "All"],
    ["DRAFT", "Drafts"],
    ["PENDING_APPROVAL", "Pending approval"],
    ["APPROVED", "Approved"],
    ["PUBLISHED", "Published"],
    ["REJECTED", "Rejected"],
  ] as const;
  const visible = rows.filter((row) => tab === "ALL" || row.status === tab);
  const count = (status: string) => rows.filter((row) => row.status === status).length;

  const audienceSummary = (campaign: Campaign) => {
    const rules = campaign.audience?.rules ?? {};
    const parts: string[] = [];
    if (rules.signedUpDaysAgoAtLeast) parts.push(`≥${rules.signedUpDaysAgoAtLeast}d old`);
    if (rules.notInAjo) parts.push("not in Ajo");
    if (rules.inAjo) parts.push("in Ajo");
    if (rules.states?.length) parts.push(rules.states.join("/"));
    if (rules.tierAtLeast) parts.push(`Tier ≥${rules.tierAtLeast}`);
    return parts.length ? parts.join(" · ") : "Everyone";
  };

  return (
    <div className="min-w-0 flex-1 bg-[#F8FAFC]">
      <header className="border-b border-[#E3E8F0] bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
            <p className="mt-1 text-xs text-slate-500">
              Consent-aware campaigns with maker-checker review — drafts are priced against live audience counts before
              they are ever sent.
            </p>
          </div>
          <Link href="/campaigns/new">
            <Button>+ Create campaign</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] space-y-4 p-4 sm:p-8">
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        <nav className="flex flex-wrap gap-1 border-b border-slate-200">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`border-b-2 px-3 py-2 text-xs font-bold ${
                tab === key ? "border-[#012A9D] text-[#012A9D]" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
              {key !== "ALL" && count(key) > 0 && <span className="ml-1 text-slate-400">({count(key)})</span>}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <p className="text-sm font-semibold text-slate-700">No campaigns here yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Create one — the composer shows live audience counts and compliance checks as you build it.
            </p>
            <Link href="/campaigns/new" className="mt-4 inline-block">
              <Button variant="outline">Create campaign</Button>
            </Link>
          </div>
        ) : (
          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-3 font-semibold">Campaign</th>
                    <th className="p-3 font-semibold">Audience</th>
                    <th className="p-3 font-semibold">Channels</th>
                    <th className="p-3 font-semibold">Est. reach</th>
                    <th className="p-3 font-semibold">Scheduled</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3 font-semibold">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((campaign) => (
                    <tr key={campaign.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="p-3">
                        <Link href={`/campaigns/${campaign.id}`} className="block">
                          <p className="font-semibold text-[#012A9D] hover:underline">{campaign.name}</p>
                          <p className="text-slate-400">
                            {campaign.code} · {campaign.objective}
                          </p>
                        </Link>
                      </td>
                      <td className="max-w-[220px] truncate p-3 text-slate-600" title={audienceSummary(campaign)}>
                        {audienceSummary(campaign)}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {campaign.channels.map((channel) => (
                            <span key={channel} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                              {channel.replace("_", "-")}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 tabular-nums">{campaign.estimatedReach.toLocaleString()}</td>
                      <td className="p-3 tabular-nums text-slate-600">
                        {campaign.scheduledAt ? formatDate(campaign.scheduledAt, { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="p-3">{statusBadge(campaign.status)}</td>
                      <td className="p-3 tabular-nums text-slate-500">{formatDate(campaign.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
