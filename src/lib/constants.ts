/**
 * Keep admin authentication same-origin.
 *
 * The upstream API sets the admin credentials in HttpOnly cookies. Calling an
 * absolute API URL from the browser makes those cookies belong to the API
 * host, so the admin host (including its middleware) cannot see the session
 * marker. The server-side proxy owns the upstream URL and relays the cookies
 * onto the admin host instead.
 */
export const API_BASE = "/api/backend";

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
