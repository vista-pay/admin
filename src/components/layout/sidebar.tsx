"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { pathPermission } from "@/lib/permissions";
import { useAdminSession } from "@/components/providers/session-provider";

type NavItem = { label: string; href: string; icon: string; badgeKey?: string };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { label: "Overview", items: [{ label: "Command center", href: "/overview", icon: "⌂" }] },
  { label: "Money & risk", items: [
    { label: "Transactions", href: "/transactions", icon: "▤" },
    { label: "Settlements & recon", href: "/reconciliation", icon: "⛓", badgeKey: "reconciliation" },
    { label: "Risk & fraud", href: "/compliance", icon: "♢", badgeKey: "compliance" },
  ] },
  { label: "Users", items: [
    { label: "Users", href: "/users", icon: "♧" },
    { label: "KYC reviews", href: "/kyc", icon: "✓", badgeKey: "kyc" },
    { label: "Businesses", href: "/businesses", icon: "▣" },
  ] },
  { label: "Ajo oversight", items: [
    { label: "Ajo groups", href: "/ajo-groups", icon: "◌" },
    { label: "Draw audits", href: "/draw-audits", icon: "⤨" },
    { label: "Payout approvals", href: "/payout-approvals", icon: "□", badgeKey: "payout-approvals" },
    { label: "Disputes", href: "/disputes", icon: "▱", badgeKey: "disputes" },
  ] },
  { label: "Communities", items: [
    { label: "Communities", href: "/communities", icon: "♜", badgeKey: "communities" },
    { label: "Organizer settlements", href: "/organizer-settlements", icon: "%" },
  ] },
  { label: "Growth & marketing", items: [
    { label: "Growth analytics", href: "/growth", icon: "⌁" },
    { label: "Campaigns", href: "/campaigns", icon: "◁" },
    { label: "Referrals & promos", href: "/referrals", icon: "☆" },
    { label: "Content & offers", href: "/content", icon: "▧" },
  ] },
  { label: "Platform", items: [
    { label: "Pricing & fees", href: "/fees", icon: "▣" },
    { label: "Feature flags", href: "/feature-flags", icon: "☷" },
    { label: "Roles & access", href: "/roles", icon: "▢" },
    { label: "Audit trail", href: "/audit-logs", icon: "◴" },
    { label: "System health", href: "/system-health", icon: "ϟ" },
  ] },
];

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [badges,setBadges]=useState<Record<string,number>>({});
  const { profile, can } = useAdminSession();
  // Each tab is gated by the permission its route maps to; empty groups vanish.
  const nav = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(pathPermission(item.href))),
  })).filter((group) => group.items.length > 0);
  useEffect(()=>{
    let active=true;
    const refresh=()=>adminApi.navigationBadges().then(r=>{if(active)setBadges(r.data)}).catch(()=>undefined);
    const section=pathname.split("/").filter(Boolean)[0];
    const tracked=NAV.flatMap(group=>group.items).find(item=>item.href===`/${section}`)?.badgeKey;
    if(tracked)adminApi.markNavigationRead(tracked).then(refresh).catch(refresh);else refresh();
    const timer=window.setInterval(refresh,30_000);
    const visible=()=>{if(document.visibilityState==="visible")refresh()};document.addEventListener("visibilitychange",visible);
    return()=>{active=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible)};
  },[pathname]);
  return (
    <>
      {open && <button aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px] lg:hidden" />}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col overflow-y-auto bg-[#0F172A] text-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="sticky top-0 z-10 flex h-[72px] shrink-0 items-center gap-2.5 bg-[#0F172A] px-4">
          <img src="/rendi-brand-symbol.png" alt="Rendi" className="h-8 w-8 rounded-[9px]" />
          <span className="text-[18px] font-extrabold tracking-tight">RENDI</span>
          <span className="rounded-md bg-[#2563EB] px-1.5 py-0.5 text-[10px] font-bold">ADMIN</span>
          <button onClick={onClose} className="ml-auto rounded-md p-2 text-white/70 lg:hidden" aria-label="Close menu">×</button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 pb-4 pt-2">
          {nav.map((group) => (
            <div key={group.label}>
              <p className="mb-1 mt-1 px-3 text-[10px] font-bold uppercase tracking-[0.08em] text-white/45">{group.label}</p>
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/overview" && pathname.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href} onClick={onClose} className={cn(
                    "mb-1 flex h-8 items-center gap-2.5 rounded-lg px-3 text-[12px] transition-colors",
                    active ? "bg-[#2563EB] font-semibold text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
                  )}>
                    <span aria-hidden className="flex w-[18px] items-center justify-center text-base leading-none">{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badgeKey&&badges[item.badgeKey]>0&&<span className="min-w-5 rounded-full bg-[#2563EB] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{badges[item.badgeKey]>99?"99+":badges[item.badgeKey]}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sticky bottom-0 border-t border-white/10 bg-[#0F172A] p-3">
          <div className="flex items-center gap-2.5 rounded-xl p-1.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xs font-bold text-[#0F172A]">{`${profile?.firstName?.[0]??"A"}${profile?.lastName?.[0]??""}`}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{profile?`${profile.firstName} ${profile.lastName}`:"Administrator"}</p><p className="text-[10px] text-white/55">{profile?.roleName??""}</p></div>
            <button onClick={async () => { await adminApi.logout().catch(() => undefined); router.replace("/login"); }} className="rounded-lg p-2 text-white/60 hover:bg-white/10" title="Sign out">↪</button>
          </div>
        </div>
      </aside>
    </>
  );
}
