export type OverviewMetrics = {
  metrics: {
    totalUsers: number;
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    failureRate: string;
    openComplianceAlerts: number;
  };
  volumesNgn: {
    totalProcessed: string;
    totalDeposits: string;
    totalWithdrawals: string;
  };
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type AdminUser = {
  id: string;
  email: string;
  phone: string;
  name: string;
  userType: string;
  status: string;
  kycTier: string;
  kycStatus: string;
  walletNumber?: string;
  balances: { currency: string; available: string; held: string }[];
  createdAt: string;
};

export type Transaction = {
  id: string;
  type: string;
  status: string;
  amount: string;
  currencyCode: string;
  createdAt: string;
  [k: string]: unknown;
};

export type AdminRole = "SUPER_ADMIN" | "COMPLIANCE_OFFICER" | "FINANCE_ADMIN" | "SUPPORT_ADMIN";
