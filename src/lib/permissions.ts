/**
 * Permission keys for the admin console, one per sidebar tab (plus the
 * `adjustments` action key). Mirrored by hand from the backend registry at
 * backend/src/common/constants/admin-permissions.ts — keep the two in sync.
 */
export type PermissionDescriptor = { key: string; label: string; group: string };

export const PERMISSION_CATALOG: PermissionDescriptor[] = [
  { key: "overview", label: "Command center", group: "Overview" },
  { key: "transactions", label: "Transactions", group: "Money & risk" },
  { key: "reconciliation", label: "Settlements & recon", group: "Money & risk" },
  { key: "compliance", label: "Risk & fraud", group: "Money & risk" },
  { key: "adjustments", label: "Financial adjustments", group: "Money & risk" },
  { key: "users", label: "Users", group: "Users" },
  { key: "kyc", label: "KYC reviews", group: "Users" },
  { key: "ajo-groups", label: "Ajo groups", group: "Ajo oversight" },
  { key: "draw-audits", label: "Draw audits", group: "Ajo oversight" },
  { key: "payout-approvals", label: "Payout approvals", group: "Ajo oversight" },
  { key: "disputes", label: "Disputes", group: "Ajo oversight" },
  { key: "communities", label: "Communities", group: "Communities" },
  { key: "organizer-settlements", label: "Organizer settlements", group: "Communities" },
  { key: "growth", label: "Growth analytics", group: "Growth & marketing" },
  { key: "campaigns", label: "Campaigns", group: "Growth & marketing" },
  { key: "referrals", label: "Referrals & promos", group: "Growth & marketing" },
  { key: "content", label: "Content & offers", group: "Growth & marketing" },
  { key: "fees", label: "Pricing & fees", group: "Platform" },
  { key: "limits", label: "Transaction limits", group: "Platform" },
  { key: "feature-flags", label: "Feature flags", group: "Platform" },
  { key: "broadcasts", label: "Platform updates", group: "Platform" },
  { key: "roles", label: "Roles & access", group: "Platform" },
  { key: "audit-logs", label: "Audit trail", group: "Platform" },
  { key: "system-health", label: "System health", group: "Platform" },
];

/** Routes that exist outside the tab permissions and are open to any admin. */
const OPEN_ROUTES = new Set(["settings", "change-password"]);

/** Pages without their own sidebar tab borrow the permission of their area. */
const ROUTE_ALIASES: Record<string, string> = {
  businesses: "users",
  "community-plans": "fees",
  limits: "limits",
  providers: "system-health",
  reports: "overview",
};

/**
 * Maps a pathname to the permission key that gates it, or null when the route
 * is open to every authenticated admin.
 */
export function pathPermission(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment || OPEN_ROUTES.has(segment)) return null;
  const alias = ROUTE_ALIASES[segment];
  if (alias) return alias;
  return PERMISSION_CATALOG.some((item) => item.key === segment) ? segment : null;
}
