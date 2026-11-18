"use client";

import { usePathname } from "next/navigation";
import { useAdminSession } from "@/components/providers/session-provider";
import { GlobalSearch } from "./global-search";
import { HeaderInboxes } from "./header-inboxes";

const labels:Record<string,string>={overview:"Overview / Command center",transactions:"Money & risk / Transactions",reconciliation:"Money & risk / Settlements & reconciliation",compliance:"Money & risk / Risk & fraud",users:"Users / Directory",kyc:"Users / KYC reviews","ajo-groups":"Ajo oversight / Ajo groups","draw-audits":"Ajo oversight / Draw audits","payout-approvals":"Ajo oversight / Payout approvals",disputes:"Ajo oversight / Disputes",support:"Community management / Support requests",communities:"Communities / Verification queue","community-plans":"Communities / Subscription plans","community-subscriptions":"Communities / Subscribers","subscription-revenue":"Communities / Subscription revenue","account-officers":"Overview / Account officers","organizer-settlements":"Communities / Organizer settlements",fees:"Platform / Pricing & fees","feature-flags":"Platform / Feature flags & services",broadcasts:"Platform / Platform updates",roles:"Platform / Roles & access","audit-logs":"Platform / Audit trail","system-health":"Platform / System health"};

export function GlobalTopbar(){
  const pathname=usePathname();const { profile }=useAdminSession();
  const section=pathname.split("/").filter(Boolean)[0]||"overview";
  const initials=`${profile?.firstName?.[0]??"A"}${profile?.lastName?.[0]??""}`;
  return <header className="hidden h-16 shrink-0 items-center gap-4 border-b border-[#E1E7F0] bg-white px-6 lg:flex"><p className="w-[280px] shrink-0 truncate text-xs font-semibold text-slate-600">{labels[section]??section.replaceAll("-"," ")}</p><GlobalSearch /><span className="whitespace-nowrap rounded-full bg-red-50 px-3 py-1 text-[10px] font-bold text-red-500">● &nbsp;PRODUCTION</span><HeaderInboxes /><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">{initials}</span><div className="min-w-[108px] text-xs"><b className="block truncate">{profile?`${profile.firstName} ${profile.lastName}`:"Administrator"}</b><span className="block truncate text-[10px] text-slate-500">{profile?.roleName??""}</span></div><span className="text-slate-500">⌄</span></header>
}
