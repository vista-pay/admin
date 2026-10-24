export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:9100/api/v1";

export const APP_NAME = "Rendi";
export const APP_TAGLINE = "Control Center";

export const ADMIN_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  COMPLIANCE_OFFICER: "COMPLIANCE_OFFICER",
  FINANCE_ADMIN: "FINANCE_ADMIN",
  SUPPORT_ADMIN: "SUPPORT_ADMIN",
} as const;

export const NAV_ITEMS = [
  { label: "Overview", href: "/overview", icon: "LayoutDashboard" },
  { label: "Users", href: "/users", icon: "Users" },
  { label: "Transactions", href: "/transactions", icon: "ArrowLeftRight" },
  { label: "Compliance", href: "/compliance", icon: "ShieldAlert" },
  { label: "Providers", href: "/providers", icon: "Plug" },
  { label: "Corridors", href: "/providers?tab=corridors", icon: "Globe" },
  { label: "Reconciliation", href: "/reconciliation", icon: "Scale" },
  { label: "Audit Logs", href: "/audit-logs", icon: "ScrollText" },
] as const;
