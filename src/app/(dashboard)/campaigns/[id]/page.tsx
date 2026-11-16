"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { CampaignComposer, type Campaign } from "@/components/admin/campaign-composer";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState("");
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    adminApi
      .getCampaign(id)
      .then((r) => setCampaign(r.data as Campaign))
      .catch((e: Error) => setError(e.message))
      .finally(() => setSettled(true));
  }, [id]);

  if (!settled) {
    return <div className="flex-1 bg-[#F8FAFC] p-8 text-sm text-slate-500">Loading campaign…</div>;
  }
  if (!campaign) {
    return (
      <div className="flex-1 bg-[#F8FAFC] p-8">
        <p className="text-sm text-red-700">{error || "Campaign not found"}</p>
        <Link href="/campaigns" className="mt-3 inline-block text-sm font-bold text-[#012A9D] hover:underline">
          ← Back to campaigns
        </Link>
      </div>
    );
  }
  return (
    <div className="min-w-0 flex-1 bg-[#F8FAFC]">
      <CampaignComposer campaign={campaign} />
    </div>
  );
}
