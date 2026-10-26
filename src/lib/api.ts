import { API_BASE } from "./constants";

type ApiOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined>;
  auth?: boolean;
  skipRedirect?: boolean;
};

/**
 * Admin credentials live in HttpOnly cookies set by the API, so nothing in
 * this file ever holds a token. Script-readable admin tokens (localStorage, a
 * plain cookie) turn any XSS in the console into a full account takeover, and
 * a 7-day cookie carrying a 10-minute token also kept the UI "signed in" long
 * after the session was dead.
 *
 * `SESSION_FLAG_COOKIE` is written by the API too, but carries no credential -
 * it is only a marker so the UI and the Next middleware know a session exists.
 */
export const SESSION_FLAG_COOKIE = "vista_admin_session";

export function hasSessionFlag(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((pair) => pair.trim().startsWith(`${SESSION_FLAG_COOKIE}=`));
}

function clearSessionFlag() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_FLAG_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

function clearAuthAndRedirect() {
  if (typeof window === "undefined") return;
  clearSessionFlag();
  const cur = window.location.pathname;
  if (cur !== "/login" && cur !== "/mfa") {
    window.location.href = "/login";
  }
}

/**
 * Refresh the admin session. Deduplicated so a burst of concurrent 401s
 * produces one refresh round-trip rather than one per request.
 */
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      if (!res.ok) {
        clearSessionFlag();
        return false;
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function buildUrl(path: string, params?: ApiOptions["params"]) {
  const base = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!params) return base;
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") usp.set(k, String(v));
  });
  const qs = usp.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function apiFetch<T>(
  path: string,
  opts: ApiOptions = {}
): Promise<{ data: T; meta?: unknown } & Record<string, unknown>> {
  const { params, auth = true, skipRedirect = false, headers, ...rest } = opts as ApiOptions & { skipRedirect?: boolean };
  const url = buildUrl(path, params);

  const send = () =>
    fetch(url, {
      ...rest,
      // The session cookie is the credential; it must ride along on every call.
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(headers as Record<string, string>),
      },
    });

  let res = await send();

  // Admin access tokens last ten minutes. Refresh once and replay before
  // deciding the operator has been signed out.
  const isAuthRoute = path.includes("/admin/auth/");
  if (res.status === 401 && auth && !isAuthRoute) {
    if (await refreshSession()) {
      res = await send();
    }
  }

  const json = await res.json().catch(() => ({}));

  if (res.status === 401 && auth && !skipRedirect && !isAuthRoute) {
    clearAuthAndRedirect();
    throw new Error("Unauthorized — please sign in again");
  }

  // A forced first-login password change blocks every other admin route; send
  // the operator straight to the change screen instead of surfacing errors.
  if (
    res.status === 403 &&
    json?.code === "PASSWORD_CHANGE_REQUIRED" &&
    typeof window !== "undefined" &&
    window.location.pathname !== "/change-password"
  ) {
    window.location.href = "/change-password";
    throw new Error("Password change required");
  }

  if (!res.ok) {
    const msg = json?.message ?? json?.error ?? `Request failed (${res.status})`;
    throw new Error(Array.isArray(msg) ? msg.join(", ") : msg);
  }

  // Backend wraps in { success, data, meta }
  if (json && typeof json === "object" && "data" in json) {
    return json as { data: T; meta?: unknown } & Record<string, unknown>;
  }
  return { data: json as T };
}

export type AdminProfile = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  role: string;
  roleId: string;
  roleName: string;
  isSuperAdmin: boolean;
  permissions: string[];
  mustChangePassword: boolean;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
};

export type AdminRoleDefinition = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: string[];
  adminCount: number;
  createdAt?: string;
  updatedAt?: string;
};

// Typed helpers for admin domain
export const adminApi = {
  me: () => apiFetch<AdminProfile>("/admin/me"),
  login: (body: { email: string; password: string }) =>
    apiFetch<{ challengeToken: string; mfaRequired: boolean }>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
      auth: false,
    }),
  // Sets the HttpOnly session cookies; returns no token material.
  verifyMfa: (body: { challengeToken: string; code: string }) =>
    apiFetch<{ authenticated: boolean; expiresIn: number; mustChangePassword?: boolean }>("/admin/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify(body),
      auth: false,
    }),
  refresh: () =>
    apiFetch<{ authenticated: boolean; expiresIn: number }>("/admin/auth/refresh", {
      method: "POST",
      body: "{}",
      auth: false,
    }),
  logout: () =>
    apiFetch<{ message: string }>("/admin/auth/logout", {
      method: "POST",
      body: "{}",
      skipRedirect: true,
    }),
  overview: async (days = 30) => {
    try {
      return await apiFetch<unknown>("/admin/dashboard", { params: { days } });
    } catch (error) {
      if (!(error instanceof Error) || !/Cannot GET|404|not found/i.test(error.message)) throw error;
      const legacy = await apiFetch<Record<string, unknown>>("/admin/overview");
      const base = legacy.data as Record<string, unknown>;
      const legacyMetrics = (base.metrics as Record<string, unknown>) ?? {};
      return { data: { ...base, metrics: { walletFloat: 0, monthlyActiveUsers: 0, contributionCollectionRate: 0, ...legacyMetrics }, trends: { periodDays: days, series: [] }, attention: { payoutApprovals: { count: 0, amount: "0", oldestAt: null }, kycReviews: { count: Number(legacyMetrics.pendingKyc ?? 0), oldestAt: null }, riskAlerts: { count: Number(legacyMetrics.openComplianceAlerts ?? 0) }, reconciliationBreaks: { count: 0, amount: "0" }, disputes: { count: Number(legacyMetrics.openDisputes ?? 0) }, communityVerifications: { count: Number(legacyMetrics.pendingCommunityReviews ?? 0) } }, providers: [], topCommunities: [], signupChannels: {} } };
    }
  },
  growth: (days = 30) => apiFetch<unknown>("/admin/growth", { params: { days } }),
  listUsers: (params: { page?: number; limit?: number; search?: string }) =>
    apiFetch<unknown>("/admin/users", { params: params as Record<string, string | number | boolean | undefined> }),
  getUser: (id: string) => apiFetch<unknown>(`/admin/users/${id}`),
  freezeUser: (id: string, reason: string) =>
    apiFetch<unknown>(`/admin/users/${id}/freeze`, { method: "POST", body: JSON.stringify({ reason }) }),
  unfreezeUser: (id: string, reason: string) =>
    apiFetch<unknown>(`/admin/users/${id}/unfreeze`, { method: "POST", body: JSON.stringify({ reason }) }),
  transactions: (params: Record<string, string | number | boolean | undefined>) =>
    apiFetch<unknown>("/admin/transactions", { params }),
  providers: () => apiFetch<unknown>("/admin/providers"),
  corridors: () => apiFetch<unknown>("/admin/corridors"),
  auditLogs: (params: { page?: number; limit?: number }) =>
    apiFetch<unknown>("/admin/audit-logs", { params: params as Record<string, string | number | boolean | undefined> }),
  compliance: () => apiFetch<unknown>("/admin/compliance"),
  actOnFraudAlert: (id: string, action: "ESCALATE" | "RELEASE" | "FREEZE", notes?: string) => apiFetch<unknown>(`/admin/compliance/alerts/${id}/action`, { method: "POST", body: JSON.stringify({ action, notes }) }),
  ajoGroups: () => apiFetch<unknown>("/admin/ajo-groups"),
  drawAudits: () => apiFetch<unknown>("/admin/draw-audits"),
  payoutApprovals: () => apiFetch<unknown>("/admin/payout-approvals"),
  disputes: () => apiFetch<unknown>("/admin/disputes"),
  organizerSettlements: () => apiFetch<unknown>("/admin/organizer-settlements"),
  admins: () => apiFetch<unknown>("/admin/admins"),
  inviteAdmin: (body: { email: string; firstName: string; lastName: string; roleId: string }) =>
    apiFetch<{ id: string; email: string; debugTempPassword?: string }>("/admin/admins", { method: "POST", body: JSON.stringify(body) }),
  updateAdminAccess: (id: string, body: { roleId?: string; isActive?: boolean; reason: string }) =>
    apiFetch<unknown>(`/admin/admins/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  roles: () => apiFetch<AdminRoleDefinition[]>("/admin/roles"),
  permissionsCatalog: () => apiFetch<{ key: string; label: string; group: string }[]>("/admin/permissions"),
  createRole: (body: { name: string; description?: string; permissions: string[] }) =>
    apiFetch<AdminRoleDefinition>("/admin/roles", { method: "POST", body: JSON.stringify(body) }),
  updateRole: (id: string, body: { name?: string; description?: string; permissions?: string[]; reason: string }) =>
    apiFetch<AdminRoleDefinition>(`/admin/roles/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteRole: (id: string, reason: string) =>
    apiFetch<{ message: string }>(`/admin/roles/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    apiFetch<{ message: string }>("/admin/me/change-password", { method: "POST", body: JSON.stringify(body) }),
  systemHealth: () => apiFetch<unknown>("/admin/system-health"),
  getTransaction: async (id: string) => {
    try {
      return await apiFetch<unknown>(`/admin/transactions/${id}`);
    } catch (error) {
      if (!(error instanceof Error) || !/Cannot GET|404|not found/i.test(error.message)) throw error;
      const response = await apiFetch<unknown>("/admin/transactions", { params: { page: 1, limit: 100 } });
      const payload = response.data as { items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
      const items = Array.isArray(payload) ? payload : payload.items ?? [];
      const found = items.find(item => item.id === id || item.transactionReference === id);
      if (!found) throw new Error("Transaction details are not available yet. The record may be older than the current API lookup window.");
      return { data: found };
    }
  },
  requeryTransaction: (id: string) =>
    apiFetch<unknown>(`/admin/transactions/${id}/requery`, { method: "POST", body: "{}" }),
  requestTransactionReversal: (id: string, reason: string) =>
    apiFetch<unknown>(`/admin/transactions/${id}/reversal-requests`, { method: "POST", body: JSON.stringify({ reason }) }),
  decideTransactionReversal: (id: string, requestId: string, approve: boolean, reason: string) =>
    apiFetch<unknown>(`/admin/transactions/${id}/reversal-requests/${requestId}`, { method: "PATCH", body: JSON.stringify({ approve, reason }) }),
  campaigns: () => apiFetch<unknown>("/admin/campaigns"),
  promotions: () => apiFetch<unknown>("/admin/promotions"),
  referrals: () => apiFetch<unknown>("/admin/referrals"),
  content: () => apiFetch<unknown>("/admin/content"),
  featureFlags: () => apiFetch<unknown>("/admin/feature-flags"),
  approvalPolicies: () => apiFetch<unknown>("/admin/approval-policies"),
  navigationBadges: () => apiFetch<Record<string, number>>("/admin/navigation/badges"),
  markNavigationRead: (section: string) => apiFetch<unknown>(`/admin/navigation/${section}/read`, { method: "POST", body: "{}" }),

  // ── Communities (cooperatives and associations) ──────────────────────
  listCommunities: (params: { status?: string; page?: number; limit?: number }) =>
    apiFetch<unknown>("/admin/communities", {
      params: params as Record<string, string | number | boolean | undefined>,
    }),
  getCommunity: (id: string) => apiFetch<unknown>(`/admin/communities/${id}`),
  /**
   * Verify or reject. `organizerFeesEnabled` is a separate policy decision
   * from verification: a community can be legitimate and still not be
   * permitted to charge its members an organizer fee.
   */
  reviewCommunity: (
    id: string,
    body: { approve: boolean; reason?: string; organizerFeesEnabled?: boolean },
  ) =>
    apiFetch<unknown>(`/admin/communities/${id}/review`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
