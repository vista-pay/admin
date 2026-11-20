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
/**
 * A failed call, with the API's machine-readable discriminator kept.
 *
 * It used to be a bare `Error` carrying only the message, which threw away
 * the two fields that let a page *do* something about a failure: `code` and
 * `details`. That mattered the moment maker-checker landed — a gated action
 * answers 428 with `code: "ADMIN_APPROVAL_REQUIRED"` and a challenge naming
 * the request it raised, and without those a page can only show the sentence
 * and leave the operator to go hunting for the queue.
 *
 * `instanceof Error` still holds, so every existing `catch` that reads
 * `.message` keeps working unchanged.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** e.g. "ADMIN_APPROVAL_REQUIRED", "APPROVAL_REQUIRED", "SESSION_EXPIRED". */
    readonly code: string | null,
    /** The API's `errors` payload — a challenge, a field map, whatever it sent. */
    readonly details: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Shape the API sends with a 428 on a gated console action. */
export type AdminApprovalChallenge = {
  requestId: string;
  reference: string;
  actionKey: string;
  actionName: string;
  summary: string;
  status: string;
  approvals: { given: number; required: number };
  approverRoles: string[];
  amount: string | null;
  currencyCode: string | null;
  expiresAt: string | null;
  raised: boolean;
};

/**
 * The challenge, when a failure is "this needs a second administrator".
 * Null for anything else, so a caller can branch in one line.
 */
export function approvalChallengeOf(error: unknown): AdminApprovalChallenge | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code !== "ADMIN_APPROVAL_REQUIRED") return null;
  return (error.details as AdminApprovalChallenge) ?? null;
}

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
    throw new ApiError(
      Array.isArray(msg) ? msg.join(", ") : msg,
      res.status,
      typeof json?.code === "string" ? json.code : null,
      json?.errors ?? null,
    );
  }

  // Backend wraps in { success, data, meta }
  if (json && typeof json === "object" && "data" in json) {
    return json as { data: T; meta?: unknown } & Record<string, unknown>;
  }
  return { data: json as T };
}

/** One line in the central activity feed. */
/** What the two header inboxes return. Shared by the badge and the dropdown. */
export type InboxEntry = {
  kind?: "TICKET" | "DISPUTE";
  id: string;
  title: string;
  from: string;
  status: string;
  priority: string;
  at: string;
  /** Nobody on the desk has opened it yet — what the badge is counting. */
  unread?: boolean;
  /** Where clicking it goes — built by the API so the link cannot drift. */
  href: string;
};

/**
 * The badge counts what the desk has not read, not what is open. An open
 * ticket an agent has already picked up is work in progress, not a
 * notification, and counting it was what kept the red dot lit permanently.
 */
export type SupportInbox = {
  unreadTickets: number;
  unreadDisputes: number;
  total: number;
  items: InboxEntry[];
};

export type AccountOfficerInboxEntry = {
  communityId: string;
  name: string;
  preview: string;
  unread: number;
  at: string;
  href: string;
};

export type AccountOfficerInbox = {
  communitiesWaiting: number;
  total: number;
  items: AccountOfficerInboxEntry[];
};

export type ActivityRow = {
  id: string;
  event: string;
  category: "COMMUNITY" | "MEMBER" | "MONEY" | "ADMIN" | "SECURITY" | "SYSTEM" | "SUPPORT";
  /** Which application the action came from. The column no other table has. */
  surface:
    | "MOBILE_APP"
    | "COMMUNITY_PORTAL"
    | "BUSINESS_PORTAL"
    | "PAY"
    | "ADMIN_CONSOLE"
    | "SYSTEM"
    | "WEBHOOK"
    | "UNKNOWN";
  severity: "INFO" | "NOTICE" | "WARNING" | "CRITICAL";
  outcome: "SUCCESS" | "FAILED";
  actorType: string;
  actorLabel: string | null;
  summary: string;
  reason: string | null;
  targetType: string;
  targetId: string | null;
  communityId: string | null;
  community: { id: string; publicId: string | null; name: string } | null;
  /** Decimal string, or null on anything that is not a money event. */
  amount: string | null;
  currencyCode: string | null;
  transactionReference: string | null;
  /** The APV reference that authorised this, where one did. */
  approvalRequestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceId: string | null;
  requestId: string | null;
  createdAt: string;
};

export type ActivityPage = {
  items: ActivityRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type ActivitySummary = {
  windowHours: number;
  since: string;
  total: number;
  failures: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  bySurface: Record<string, number>;
};

/** A console action waiting for a second administrator. */
export type ApprovalRequest = {
  id: string;
  reference: string;
  actionKey: string;
  actionName: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED" | "CANCELLED" | "EXPIRED";
  summary: string;
  reason: string;
  targetEntity: string;
  targetId: string | null;
  payload: Record<string, unknown>;
  amount: string | null;
  currencyCode: string | null;
  approvals: { given: number; required: number };
  approverRoles: string[];
  requestedBy: { id: string; firstName: string; lastName: string; email: string };
  decisions: Array<{
    id: string;
    approve: boolean;
    reason: string;
    roleKey: string;
    /** The super admin deciding their own. Flagged, never hidden. */
    selfApproved: boolean;
    createdAt: string;
    admin: { id: string; firstName: string; lastName: string; email: string };
  }>;
  executionReference: string | null;
  /** Approved but the action would not run. Not the same as never approved. */
  executionError: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type ApprovalRequestPage = {
  items: ApprovalRequest[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/** A gateable action, with the policy in force for it. */
export type ApprovalAction = {
  key: string;
  name: string;
  description: string;
  targetEntity: string;
  permission: string;
  defaultMakerChecker: boolean;
  policy: {
    id: string;
    makerCheckerRequired: boolean;
    minimumApprovers: number;
    approverRoles: string[];
    amountThreshold: string | null;
    currencyCode: string | null;
    isActive: boolean;
    updatedBy: string;
    updatedAt: string;
  } | null;
  /** Would this action actually be stopped right now? */
  enforced: boolean;
};

// ── Community Management module ──────────────────────────────────────────

export type CommunityStatusValue = "PENDING" | "VERIFIED" | "SUSPENDED" | "REJECTED" | "INACTIVE";
export type VerificationLevel = "PENDING" | "BASIC" | "FULL";
export type CommunityCategoryValue =
  | "COOPERATIVE"
  | "AJO_THRIFT"
  | "STAFF_COOPERATIVE"
  | "TRADE_ASSOCIATION"
  | "OTHER_COMMUNITY";

/** The five filters the dashboard and the All Communities list share. */
export type CommunityFilters = {
  from?: string;
  to?: string;
  state?: string;
  lga?: string;
  category?: string;
  status?: string;
  verification?: string;
  search?: string;
};

export type CommunityDashboard = {
  communities: {
    total: number;
    active: number;
    pendingApproval: number;
    suspended: number;
    inactive: number;
    rejected: number;
  };
  members: { total: number };
  registrations: { today: number; last7Days: number; last30Days: number };
  ajo: { activeGroups: number; ongoingCycles: number };
  contributions: {
    collected: string;
    payments: number;
    expected: string;
    actual: string;
    /** Null when nothing is due — a rate with no denominator, not 0%. */
    collectionRate: number | null;
    shortfall: string;
  };
  savings: { balance: string; accounts: number };
  loans: { running: number; outstanding: string; overdue: number };
  support: { openComplaints: number; openDisputes: number };
  revenue: { subscriptionsPaid: string };
  attention: {
    overdueContributions: Array<{
      id: string;
      publicId: string | null;
      name: string;
      state: string | null;
      lga: string | null;
      overdueCount: number;
      shortfall: string;
      capped: boolean;
    }>;
  };
};

/** Contributions expected against collected, per day. */
export type CommunityTrends = {
  periodDays: number;
  series: Array<{ date: string; expectedNgn: number; collectedNgn: number; registrations: number }>;
  totals: { expected: string; collected: string; registrations: number };
};

export type CommunityRow = {
  id: string;
  publicId: string | null;
  name: string;
  status: CommunityStatusValue;
  verificationLevel: VerificationLevel;
  categoryType: CommunityCategoryValue | null;
  category: string | null;
  state: string | null;
  lga: string | null;
  city: string | null;
  country: string;
  registrationNumber: string | null;
  healthScore: number | null;
  healthScoredAt: string | null;
  suspensionReason: string | null;
  rejectionReason: string | null;
  suspendedAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  owner: { email: string; phone: string };
  subscription: { status: string; plan: { code: string; name: string } } | null;
  _count: { members: number; ajoGroups: number };
};

export type CommunityFilterOptions = {
  states: string[];
  lgas: Array<{ lga: string; state: string | null }>;
  categories: Array<{ category: string; communities: number }>;
  uncategorised: number;
};

export type DirectoryMember = {
  id: string;
  memberCode: string | null;
  status: string;
  title: string | null;
  joinedAt: string;
  suspendedScopes: string[];
  suspensionReason: string | null;
  adminAccessSuspendedAt: string | null;
  adminAccessSuspensionReason: string | null;
  role: { name: string; label: string | null };
  community: { id: string; publicId: string | null; name: string; status: string; state: string | null; lga: string | null };
  user: {
    id: string;
    email: string;
    phone: string;
    vistaTag: string | null;
    status: string;
    createdAt: string;
    profile: { firstName: string; lastName: string } | null;
    kycRecord: { tier: string; status: string } | null;
  };
  name: string;
  /** How many communities this person belongs to, platform-wide. */
  communityCount: number;
  isOfficer: boolean;
};

/** One person, everywhere they are. */
export type MemberProfile = {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    vistaTag: string | null;
    userType: string;
    status: string;
    createdAt: string;
    kycRecord: { tier: string; status: string; reviewedAt: string | null } | null;
    wallet: { walletNumber: string; accounts: Array<{ currencyCode: string; available: string; held: string }> } | null;
  };
  memberships: Array<{
    id: string;
    memberCode: string | null;
    status: string;
    title: string | null;
    joinedAt: string;
    suspendedScopes: string[];
    suspensionReason: string | null;
    adminAccessSuspendedAt: string | null;
    adminAccessSuspensionReason: string | null;
    role: { name: string; label: string | null };
    community: { id: string; publicId: string | null; name: string; status: string; state: string | null; lga: string | null };
    isOfficer: boolean;
  }>;
  contributions: { paid: string; payments: number };
  savings: { balance: string; accounts: number };
  loans: Array<{
    id: string;
    loanReference: string;
    status: string;
    principal: string;
    totalRepayable: string;
    amountRepaid: string;
    outstanding: string;
    currencyCode: string;
    dueDate: string | null;
    communityId: string | null;
  }>;
  complaints: Array<{
    id: string;
    reference: string;
    subject: string;
    status: string;
    complaintType: string | null;
    communityId: string | null;
    lastActivityAt: string;
  }>;
  /** Accounts that look like this one. Leads to investigate, never findings. */
  duplicateLeads: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
    createdAt: string;
    matchedOn: string[];
  }>;
};

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

export type AdminBroadcast = {
  id: string;
  title: string;
  body: string;
  status: "DRAFT" | "SCHEDULED" | "SENT" | "FAILED";
  sentAt?: string | null;
  recipientCount: number;
  deliveredCount: number;
  failureReason?: string | null;
  createdAt: string;
  createdBy: { firstName: string; lastName: string; email: string };
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
/** One suggestion in the console's global search. */
export type AdminSearchType = "USER" | "TRANSACTION" | "COMMUNITY" | "BUSINESS" | "AJO_GROUP";

export interface AdminSearchResult {
  type: AdminSearchType;
  id: string;
  title: string;
  subtitle: string | null;
  meta: string | null;
  /** Where the console should go. Decided by the API, not guessed here. */
  href: string;
}

export interface AdminSearchResponse {
  query: string;
  results: AdminSearchResult[];
  /** True when there was more than the dropdown asked for. */
  truncated: boolean;
}

/** A settlement destination awaiting Rendi's decision. */
export interface SettlementAccountRow {
  id: string;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  isDefault: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedAt: string | null;
  reviewReason: string | null;
  createdAt: string;
  /** False is the finding an approver is really looking for. */
  nameMatchesOwner: boolean;
  owner: { kind: "COMMUNITY" | "BUSINESS"; id: string; name: string } | null;
  community: { id: string; name: string; publicId: string | null; status: string; email: string; phone: string } | null;
}

export const adminApi = {
  settlementAccounts: (params: { status?: string; page?: number; limit?: number } = {}) =>
    apiFetch<{
      items: SettlementAccountRow[];
      total: number;
      page: number;
      limit: number;
      pending: number;
    }>(`/admin/settlement-accounts?${new URLSearchParams(
      Object.entries(params).reduce<Record<string, string>>((acc, [key, value]) => {
        if (value !== undefined) acc[key] = String(value);
        return acc;
      }, {}),
    )}`),
  approveSettlementAccount: (accountId: string, reason?: string) =>
    apiFetch<{ id: string; status: string }>(`/admin/settlement-accounts/${accountId}/approve`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    }),
  rejectSettlementAccount: (accountId: string, reason: string) =>
    apiFetch<{ id: string; status: string }>(`/admin/settlement-accounts/${accountId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  me: () => apiFetch<AdminProfile>("/admin/me"),
  /**
   * Type-ahead across every source the signed-in role may open. `signal` lets
   * the caller drop a reply for a query the admin has already typed past.
   */
  search: (q: string, signal?: AbortSignal) =>
    apiFetch<AdminSearchResponse>(`/admin/search?q=${encodeURIComponent(q)}`, { signal }),
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
  /** Where platform earnings are, and what is available to sweep. */
  revenueFlow: (days = 30, currency = "NGN") =>
    apiFetch<unknown>("/admin/platform-revenue/flow", { params: { days, currency } }),
  revenueSweeps: (page = 1, limit = 20) =>
    apiFetch<unknown>("/admin/platform-revenue/sweeps", { params: { page, limit } }),
  /**
   * Answers 428 ADMIN_APPROVAL_REQUIRED on the first call — the caller is
   * expected to read `ApiError.code` and show the approval it raised rather
   * than treating it as a failure.
   */
  requestRevenueSweep: (body: {
    amount: string;
    currencyCode: string;
    reason: string;
    destinationId?: string;
  }) =>
    apiFetch<unknown>("/admin/platform-revenue/sweeps", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  payoutDestinations: (currency = "NGN") =>
    apiFetch<unknown>("/admin/platform-revenue/destinations", { params: { currency } }),
  /** Also 428s on the first call — registering a destination is gated too. */
  addPayoutDestination: (body: {
    label: string;
    accountNumber: string;
    bankCode: string;
    bankName?: string;
    currencyCode?: string;
    isDefault?: boolean;
    reason: string;
  }) =>
    apiFetch<unknown>("/admin/platform-revenue/destinations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  retirePayoutDestination: (id: string) =>
    apiFetch<unknown>(`/admin/platform-revenue/destinations/${id}`, { method: "DELETE" }),
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
  // ── Growth & marketing ────────────────────────────────────────────────
  growthUsers: (params: { days?: number; channel?: string; stage?: string; search?: string; page?: number; limit?: number }) =>
    apiFetch<unknown>("/admin/growth/users", { params: params as Record<string, string | number | boolean | undefined> }),
  campaigns: () => apiFetch<unknown>("/admin/campaigns"),
  getCampaign: (id: string) => apiFetch<unknown>(`/admin/campaigns/${id}`),
  createCampaign: (body: Record<string, unknown>) =>
    apiFetch<unknown>("/admin/campaigns", { method: "POST", body: JSON.stringify(body) }),
  updateCampaign: (id: string, body: Record<string, unknown>) =>
    apiFetch<unknown>(`/admin/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  decideCampaign: (id: string, body: { status: string; reason?: string }) =>
    apiFetch<unknown>(`/admin/campaigns/${id}/status`, { method: "PATCH", body: JSON.stringify(body) }),
  submitCampaign: (id: string) =>
    apiFetch<unknown>(`/admin/campaigns/${id}/submit`, { method: "POST", body: "{}" }),
  /** Live audience + per-channel reach counts for the composer. */
  estimateCampaignAudience: (body: { rules: Record<string, unknown>; channels?: string[] }) =>
    apiFetch<unknown>("/admin/campaigns/estimate", { method: "POST", body: JSON.stringify(body) }),
  promotions: () => apiFetch<unknown>("/admin/promotions"),
  createPromotion: (body: Record<string, unknown>) =>
    apiFetch<unknown>("/admin/promotions", { method: "POST", body: JSON.stringify(body) }),
  decidePromotion: (id: string, body: { status: string; reason?: string }) =>
    apiFetch<unknown>(`/admin/promotions/${id}/status`, { method: "PATCH", body: JSON.stringify(body) }),
  submitPromotion: (id: string) =>
    apiFetch<unknown>(`/admin/promotions/${id}/submit`, { method: "POST", body: "{}" }),
  referrals: () => apiFetch<unknown>("/admin/referrals"),
  createReferralProgram: (body: Record<string, unknown>) =>
    apiFetch<unknown>("/admin/referrals/programs", { method: "POST", body: JSON.stringify(body) }),
  /** Edits apply immediately but pull the programme back to pending approval. */
  updateReferralProgram: (id: string, body: Record<string, unknown>) =>
    apiFetch<unknown>(`/admin/referrals/programs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  decideReferralProgram: (id: string, body: { status: string; reason?: string }) =>
    apiFetch<unknown>(`/admin/referrals/programs/${id}/status`, { method: "PATCH", body: JSON.stringify(body) }),
  content: () => apiFetch<unknown>("/admin/content"),
  createContentItem: (body: Record<string, unknown>) =>
    apiFetch<unknown>("/admin/content/items", { method: "POST", body: JSON.stringify(body) }),
  createPartnerOffer: (body: Record<string, unknown>) =>
    apiFetch<unknown>("/admin/content/offers", { method: "POST", body: JSON.stringify(body) }),
  decideContent: (kind: "item" | "offer", id: string, body: { status: string; reason?: string }) =>
    apiFetch<unknown>(`/admin/content/${kind}/${id}/status`, { method: "PATCH", body: JSON.stringify(body) }),
  submitContent: (kind: "item" | "offer", id: string) =>
    apiFetch<unknown>(`/admin/content/${kind}/${id}/submit`, { method: "POST", body: "{}" }),
  featureFlags: () => apiFetch<unknown>("/admin/feature-flags"),
  approvalPolicies: () => apiFetch<unknown>("/admin/approval-policies"),
  listBroadcasts: () => apiFetch<AdminBroadcast[]>("/admin/broadcasts"),
  sendBroadcast: (body: { title: string; body: string }) =>
    apiFetch<AdminBroadcast>("/admin/broadcasts", { method: "POST", body: JSON.stringify(body) }),
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
    body: {
      approve: boolean;
      reason?: string;
      organizerFeesEnabled?: boolean;
      /** The name exactly as the registration document carries it. */
      legalName?: string;
    },
  ) =>
    apiFetch<unknown>(`/admin/communities/${id}/review`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** Request more verification evidence from the community's owner. */
  requestCommunityDocument: (id: string, body: { documentType: string; note?: string }) =>
    apiFetch<unknown>(`/admin/communities/${id}/request-document`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Community Management module ──────────────────────────────────────
  communityDashboard: (filters: CommunityFilters) =>
    apiFetch<CommunityDashboard>("/admin/community-oversight/dashboard", {
      params: filters as Record<string, string | number | boolean | undefined>,
    }),
  communityTrends: (filters: CommunityFilters, days?: number) =>
    apiFetch<CommunityTrends>("/admin/community-oversight/trends", {
      params: { ...filters, days } as Record<string, string | number | boolean | undefined>,
    }),
  communityDirectory: (params: CommunityFilters & { page?: number; limit?: number; sort?: string }) =>
    apiFetch<{ items: CommunityRow[]; total: number; page: number; limit: number; totalPages: number }>(
      "/admin/community-oversight/communities",
      { params: params as Record<string, string | number | boolean | undefined> },
    ),
  communityFilterOptions: () =>
    apiFetch<CommunityFilterOptions>("/admin/community-oversight/filters"),
  memberDirectory: (params: { q?: string; communityId?: string; view?: string; page?: number; limit?: number }) =>
    apiFetch<{ items: DirectoryMember[]; total: number; page: number; limit: number; totalPages: number }>(
      "/admin/community-oversight/members",
      { params: params as Record<string, string | number | boolean | undefined> },
    ),
  memberProfile: (userId: string) =>
    apiFetch<MemberProfile>(`/admin/community-oversight/members/${userId}`),

  // One method per tab of the per-community page. Typed loosely on purpose:
  // each tab's shape is large, read-only and rendered once, so mirroring it
  // here would be a second schema to keep in step for no checking that the
  // page does not already do at the point of use.
  communityTab: <T = unknown>(
    id: string,
    tab:
      | "overview"
      | "membership"
      | "administrators"
      | "contributions"
      | "savings"
      | "ajo"
      | "loans"
      | "transactions"
      | "complaints"
      | "audit"
      | "settings",
    params?: Record<string, string | number | boolean | undefined>,
  ) => apiFetch<T>(`/admin/communities/${id}/${tab}`, { params }),

  // ── Community platform status ────────────────────────────────────────
  // These bite immediately: the API checks a community's status on every
  // portal and mobile call, so a decision here is in force on the affected
  // members' next request rather than at their next sign-in. Each may answer
  // 428 when its approval policy requires a second administrator — see
  // `approvalChallengeOf`.
  suspendCommunity: (id: string, reason: string) =>
    apiFetch<unknown>(`/admin/communities/${id}/suspend`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  deactivateCommunity: (id: string, reason: string) =>
    apiFetch<unknown>(`/admin/communities/${id}/deactivate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  reactivateCommunity: (id: string, reason: string) =>
    apiFetch<unknown>(`/admin/communities/${id}/reactivate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  /** Pending / Basic / Full. Independent of the lifecycle status. */
  setCommunityVerificationLevel: (
    id: string,
    body: { level: "PENDING" | "BASIC" | "FULL"; reason: string; legalName?: string },
  ) =>
    apiFetch<unknown>(`/admin/communities/${id}/verification-level`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  setCommunityCategory: (id: string, body: { categoryType: string; reason?: string }) =>
    apiFetch<unknown>(`/admin/communities/${id}/category`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  /**
   * Pause an officer's powers without touching their membership or their
   * post — they keep both, only the actions the post carries stop.
   */
  suspendCommunityAdministrator: (id: string, memberId: string, reason: string) =>
    apiFetch<unknown>(`/admin/communities/${id}/administrators/${memberId}/suspend`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  restoreCommunityAdministrator: (id: string, memberId: string, reason: string) =>
    apiFetch<unknown>(`/admin/communities/${id}/administrators/${memberId}/restore`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  // ── Central activity feed ────────────────────────────────────────────
  // Everything that happened across the mobile app, the community portal,
  // the business and pay surfaces and this console — including which of them
  // it came from. The socket event `activity.created` carries only an id, a
  // category and a severity; the content comes from here, where the
  // permission guards apply.
  activity: (params: {
    page?: number;
    limit?: number;
    category?: string;
    severity?: string;
    surface?: string;
    outcome?: string;
    event?: string;
    communityId?: string;
    actorUserId?: string;
    actorAdminId?: string;
    from?: string;
    to?: string;
    search?: string;
  }) =>
    apiFetch<ActivityPage>("/admin/activity", {
      params: params as Record<string, string | number | boolean | undefined>,
    }),
  activitySummary: (hours?: number) =>
    apiFetch<ActivitySummary>("/admin/activity/summary", { params: { hours } }),

  // ── Maker-checker on console actions ─────────────────────────────────
  approvalRequests: (params: { status?: string; actionKey?: string; mine?: boolean; page?: number; limit?: number }) =>
    apiFetch<ApprovalRequestPage>("/admin/approval-requests", {
      params: {
        ...params,
        mine: params.mine ? "true" : undefined,
      } as Record<string, string | number | boolean | undefined>,
    }),
  approvalRequest: (id: string) => apiFetch<ApprovalRequest>(`/admin/approval-requests/${id}`),
  /** Which actions can be gated, and whether each is gated right now. */
  approvalCatalogue: () => apiFetch<ApprovalAction[]>("/admin/approval-requests/catalogue"),
  decideApproval: (id: string, body: { approve: boolean; reason: string }) =>
    apiFetch<ApprovalRequest>(`/admin/approval-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  cancelApproval: (id: string, reason: string) =>
    apiFetch<ApprovalRequest>(`/admin/approval-requests/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  upsertApprovalPolicy: (body: {
    actionKey: string;
    name: string;
    description?: string;
    makerCheckerRequired: boolean;
    minimumApprovers: number;
    approverRoles: string[];
    amountThreshold?: string;
    currencyCode?: string;
    isActive: boolean;
    reason: string;
  }) =>
    apiFetch<unknown>("/admin/approval-policies", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Community subscriptions (who is on which tier, and revenue) ───────
  listCommunitySubscribers: (params: { search?: string; planId?: string; page?: number; limit?: number }) =>
    apiFetch<unknown>("/admin/communities/subscriptions", {
      params: params as Record<string, string | number | boolean | undefined>,
    }),
  /**
   * Same billing semantics as the community changing plan themselves: an
   * upgrade debits the community wallet now, a downgrade waits for the paid
   * period unless `immediate`. The reason lands in both audit trails.
   */
  /**
   * Ends a trial that is already running. Taking `trialDays` off the plan
   * only affects the next community to join it — the dates are stamped on
   * the subscription when it starts.
   */
  endCommunityTrial: (communityId: string) =>
    apiFetch<unknown>(`/admin/communities/${communityId}/subscription/end-trial`, {
      method: "POST",
      body: "{}",
    }),

  changeCommunityPlan: (communityId: string, body: { planId: string; immediate?: boolean; reason: string }) =>
    apiFetch<unknown>(`/admin/communities/${communityId}/subscription/change-plan`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  subscriptionRevenue: (months?: number) =>
    apiFetch<unknown>("/admin/communities/subscriptions/revenue", { params: { months } }),
  /**
   * Communities that pressed "Contact support" on the Enterprise card.
   * Enterprise carries no self-serve price, so this queue is where those
   * sales conversations start.
   */
  enterpriseEnquiries: () =>
    apiFetch<unknown>("/admin/communities/subscriptions/enterprise-enquiries"),
  /**
   * Enterprise enquiries are ordinary support tickets, so the thread, the
   * reply and the status change all go through the support desk rather than
   * a parallel queue only this page knows about.
   */
  supportTicket: (reference: string) =>
    apiFetch<unknown>(`/admin/support/tickets/${reference}`),
  replySupportTicket: (reference: string, body: { body: string; isInternal?: boolean }) =>
    apiFetch<unknown>(`/admin/support/tickets/${reference}/reply`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateSupportTicketStatus: (reference: string, body: { status: string; priority?: string }) =>
    apiFetch<unknown>(`/admin/support/tickets/${reference}/status`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // ── Media ─────────────────────────────────────────────────────────────
  /**
   * Mints a Cloudinary signature for a banner image. The browser uploads the
   * file straight to Cloudinary with these fields; only the resulting
   * secure_url is stored on the banner.
   */
  bannerUploadSignature: () =>
    apiFetch<{
      cloudName: string;
      apiKey: string;
      timestamp: number;
      signature: string;
      folder: string;
      publicId: string;
      uploadUrl: string;
      expiresAt: string;
    }>("/admin/media/banner-upload-signature", { method: "POST", body: "{}" }),

  // ── The two header inboxes ────────────────────────────────────────────
  // Cheap by design: counts plus a handful of rows, polled from every page.
  supportInbox: () => apiFetch<SupportInbox>("/admin/support/inbox"),
  accountOfficerInbox: () => apiFetch<AccountOfficerInbox>("/admin/account-officers/inbox"),
  listSupportTickets: (status?: string) =>
    apiFetch<unknown>(`/admin/support/tickets${status ? `?status=${status}` : ""}`),

  // ── Account officers (dedicated support) ──────────────────────────────
  listAccountOfficerCommunities: () => apiFetch<unknown>("/admin/account-officers"),
  accountOfficerCandidates: () => apiFetch<unknown>("/admin/account-officers/candidates"),
  assignAccountOfficer: (communityId: string, body: { adminUserId: string | null; note?: string; reason: string }) =>
    apiFetch<unknown>(`/admin/account-officers/${communityId}`, { method: "PUT", body: JSON.stringify(body) }),
  accountOfficerThread: (communityId: string) =>
    apiFetch<unknown>(`/admin/account-officers/${communityId}/messages`),
  replyAccountOfficerThread: (
    communityId: string,
    text: string,
    attachments: Array<{ fileName: string; fileUrl: string; mimeType: string; sizeBytes: number }> = [],
  ) =>
    apiFetch<unknown>(`/admin/account-officers/${communityId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, ...(attachments.length ? { attachments } : {}) }),
    }),
  /** Short-lived Cloudinary signature for a file sent in an officer thread. */
  accountOfficerUploadSignature: () =>
    apiFetch<{
      cloudName: string;
      apiKey: string;
      timestamp: number;
      signature: string;
      folder: string;
      publicId: string;
      uploadUrl: string;
    }>("/admin/media/account-officer-upload-signature", { method: "POST", body: "{}" }),
};
