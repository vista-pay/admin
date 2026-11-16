"use client";

import { CampaignComposer } from "@/components/admin/campaign-composer";

export default function Page() {
  return (
    <div className="min-w-0 flex-1 bg-[#F8FAFC]">
      <CampaignComposer campaign={null} />
    </div>
  );
}
