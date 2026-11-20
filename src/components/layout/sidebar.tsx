"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isSuperAdminRoute, pathPermission } from "@/lib/permissions";
import { useAdminSession } from "@/components/providers/session-provider";

type NavChild = { label: string; href: string; badgeKey?: string };
type NavItem = { label: string; href: string; icon: string; badgeKey?: string; children?: NavChild[] };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { label: "Overview", items: [
    { label: "Command center", href: "/overview", icon: "⌂" },
    // Platform earnings: what was charged, where it is held, and the one
    // place it can be paid out to Rendi's own account. Next to the command
    // center because "did we make money" belongs beside "is it working".
    { label: "Money flow", href: "/money-flow", icon: "₦" },
    // The live feed of everything, from every app. Above the queues on
    // purpose: it is the answer to "what is happening right now".
    { label: "Activity", href: "/activity", icon: "◉" },
    { label: "Approvals", href: "/approvals", icon: "⎘", badgeKey: "approvals" },
  ] },
  { label: "Money & risk", items: [
    { label: "Transactions", href: "/transactions", icon: "▤" },
    { label: "Settlements & recon", href: "/reconciliation", icon: "⛓", badgeKey: "reconciliation", children: [
      { label: "Settlements & recon", href: "/reconciliation", badgeKey: "reconciliation" },
      // A community with an unapproved destination cannot be paid, so this
      // queue is somebody's money sitting still — it belongs beside the desk
      // that answers for money leaving the platform.
      { label: "Settlement approvals", href: "/settlement-approvals" },
    ] },
    { label: "Risk & fraud", href: "/compliance", icon: "♢", badgeKey: "compliance" },
  ] },
  { label: "Users", items: [
    { label: "Users", href: "/users", icon: "♧" },
    { label: "KYC reviews", href: "/kyc", icon: "✓", badgeKey: "kyc" },
    { label: "Businesses", href: "/businesses", icon: "▣" },
  ] },
  // One group for community work, in the order the brief asks for it. The
  // Ajo, disputes and subscription tabs that used to sit in their own groups
  // are folded in here rather than duplicated: an operator looking after
  // cooperatives should not have to know that payout approvals live
  // somewhere else.
  //
  // Two items from the brief are deliberately absent until their backend
  // exists — Community Analytics and Reports & Exports. A menu entry that
  // opens nothing is worse than one that is not there yet.
  { label: "Community management", items: [
    // The four community surfaces under one parent. The parent opens the
    // dashboard, which is the overview the other three are reached from
    // anyway — so the row is a destination rather than a chevron that only
    // exists to be clicked.
    { label: "Communities", href: "/community/dashboard", icon: "♜", badgeKey: "communities", children: [
      { label: "Community dashboard", href: "/community/dashboard" },
      { label: "All communities", href: "/community/all" },
      { label: "Registration & approvals", href: "/communities", badgeKey: "communities" },
      { label: "Member management", href: "/community/members" },
    ] },
    { label: "Contributions & Ajo", href: "/ajo-groups", icon: "◌", children: [
      { label: "Ajo groups", href: "/ajo-groups" },
      { label: "Draw audits", href: "/draw-audits" },
      { label: "Payout approvals", href: "/payout-approvals", badgeKey: "payout-approvals" },
      { label: "Organizer settlements", href: "/organizer-settlements" },
    ] },
    { label: "Subscriptions & billing", href: "/subscriptions", icon: "₦", children: [
      { label: "Plans", href: "/community-plans" },
      { label: "Subscribers", href: "/community-subscriptions" },
      { label: "Revenue", href: "/subscription-revenue" },
    ] },
    { label: "Support requests", href: "/support", icon: "◎" },
    { label: "Complaints & disputes", href: "/disputes", icon: "▱", badgeKey: "disputes" },
    { label: "Account officers", href: "/account-officers", icon: "☏" },
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
    { label: "Platform updates", href: "/broadcasts", icon: "✉" },
    { label: "Roles & access", href: "/roles", icon: "▢" },
    { label: "Audit trail", href: "/audit-logs", icon: "◴" },
    { label: "System health", href: "/system-health", icon: "ϟ" },
  ] },
];

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [badges,setBadges]=useState<Record<string,number>>({});
  // Chevron overrides for dropdown items; absent means "derive from the route".
  const [expanded,setExpanded]=useState<Record<string,boolean>>({});
  const { profile, can } = useAdminSession();
  // Each tab is gated by the permission its route maps to; empty groups
  // vanish. A dropdown is filtered child by child — its children can map to
  // different permissions — and survives only while something remains, with
  // its link pointing at the first child the admin may actually open.
  const visible = (href: string) =>
    isSuperAdminRoute(href) ? Boolean(profile?.isSuperAdmin) : can(pathPermission(href));
  const nav = NAV.map((group) => ({
    ...group,
    items: group.items
      .map((item) => {
        if (!item.children) return visible(item.href) ? item : null;
        const children = item.children.filter((child) => visible(child.href));
        if (!children.length) return null;
        // The parent keeps its own page (the hub) when the admin may open
        // it; otherwise it falls back to the first child they may.
        return { ...item, children, href: visible(item.href) ? item.href : children[0].href };
      })
      .filter((item): item is NavItem => item !== null),
  })).filter((group) => group.items.length > 0);
  const refresh = useCallback(
    () => adminApi.navigationBadges().then((r) => setBadges(r.data)).catch(() => undefined),
    [],
  );

  // One fetch on mount, then a once-a-minute poll plus a refetch when the tab
  // regains focus. Deliberately NOT keyed on the route: navigating does not
  // change what is waiting elsewhere, and the previous per-navigation refetch
  // (plus a 30s interval reset on every click) is what made this endpoint so
  // chatty.
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);

  // Entering a badged section is the one navigation that changes a count —
  // it clears that section's badge — so only then is a mark-read + refetch
  // sent.
  useEffect(() => {
    const section = pathname.split("/").filter(Boolean)[0];
    const tracked = NAV.flatMap((group) => group.items.flatMap((item) => [item, ...(item.children ?? [])]))
      .find((item) => item.href === `/${section}`)?.badgeKey;
    if (tracked) adminApi.markNavigationRead(tracked).then(() => void refresh()).catch(() => undefined);
  }, [pathname, refresh]);
  return (
    <>
      {open && <button aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px] lg:hidden" />}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col overflow-y-auto bg-[#0F172A] text-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="sticky top-0 z-10 flex h-[72px] shrink-0 items-center gap-2.5 bg-[#0F172A] px-4">
          <img src="/rendi-logo.svg" alt="Rendi" className="h-8 w-8 rounded-[9px]" />
          <span className="text-[18px] font-extrabold tracking-tight">RENDI</span>
          <span className="rounded-md bg-[#2563EB] px-1.5 py-0.5 text-[10px] font-bold">ADMIN</span>
          <button onClick={onClose} className="ml-auto rounded-md p-2 text-white/70 lg:hidden" aria-label="Close menu">×</button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 pb-4 pt-2">
          {nav.map((group) => (
            <div key={group.label}>
              <p className="mb-1 mt-1 px-3 text-[10px] font-bold uppercase tracking-[0.08em] text-white/45">{group.label}</p>
              {group.items.map((item) => {
                const onChild = (item.children ?? []).some((child) => pathname === child.href || pathname.startsWith(child.href + "/"));
                // A dropdown parent highlights only on its own hub page; on a
                // child page the active child row carries it, so the two
                // never double up.
                const active = item.children
                  ? pathname === item.href && !onChild
                  : pathname === item.href || (item.href !== "/overview" && pathname.startsWith(item.href));
                // Open while the admin is inside the section; the chevron can
                // override either way until they navigate elsewhere.
                const open = expanded[item.label] ?? onChild;
                return (
                  <div key={item.label}>
                    <div className={cn(
                      "mb-1 flex h-8 items-center rounded-lg text-[12px] transition-colors",
                      active ? "bg-[#2563EB] font-semibold text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
                    )}>
                      <Link href={item.href} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-2.5 px-3">
                        <span aria-hidden className="flex w-[18px] items-center justify-center text-base leading-none">{item.icon}</span>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badgeKey&&badges[item.badgeKey]>0&&<span className="min-w-5 rounded-full bg-[#2563EB] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{badges[item.badgeKey]>99?"99+":badges[item.badgeKey]}</span>}
                      </Link>
                      {item.children && (
                        <button
                          aria-label={`${open ? "Collapse" : "Expand"} ${item.label}`}
                          aria-expanded={open}
                          onClick={() => setExpanded((prev) => ({ ...prev, [item.label]: !open }))}
                          className={cn(
                            "mr-1 flex h-7 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                            active ? "text-white hover:bg-white/20" : "text-white/80 hover:bg-white/15 hover:text-white",
                          )}
                        >
                          <svg
                            viewBox="0 0 16 16"
                            className={cn("h-4 w-4 transition-transform duration-150", open && "rotate-90")}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M6 3.5 L11 8 L6 12.5" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {item.children && open && (
                      <ul className="mb-1 ml-[21px] border-l border-white/15 pl-2">
                        {item.children.map((child) => {
                          const childActive = pathname === child.href || pathname.startsWith(child.href + "/");
                          return (
                            <li key={child.href}>
                              <Link href={child.href} onClick={onClose} className={cn(
                                "mb-0.5 flex h-7 items-center gap-2 rounded-lg px-2.5 text-[12px] transition-colors",
                                childActive ? "bg-[#2563EB] font-semibold text-white" : "text-white/60 hover:bg-white/10 hover:text-white",
                              )}>
                                <span className="min-w-0 flex-1 truncate">{child.label}</span>
                                {child.badgeKey&&badges[child.badgeKey]>0&&<span className="min-w-5 rounded-full bg-[#2563EB] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{badges[child.badgeKey]>99?"99+":badges[child.badgeKey]}</span>}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
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
