"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AdminProfile, adminApi } from "@/lib/api";

type AdminSessionState = {
  profile: AdminProfile | null;
  loading: boolean;
  /** True when the role grants the permission (super admin always passes). */
  can: (permission: string | null) => boolean;
  refresh: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionState | null>(null);

export function useAdminSession() {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error("useAdminSession must be used within AdminSessionProvider");
  return ctx;
}

/**
 * Loads the signed-in admin's profile (role, permissions, mustChangePassword)
 * once for the whole dashboard, replacing the separate `/admin/me` calls the
 * sidebar and topbar used to make.
 */
export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await adminApi.me();
      setProfile(res.data);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const can = useCallback(
    (permission: string | null) => {
      if (permission === null) return true;
      if (!profile) return false;
      if (profile.isSuperAdmin) return true;
      return profile.permissions?.includes(permission) ?? false;
    },
    [profile],
  );

  return (
    <AdminSessionContext.Provider value={{ profile, loading, can, refresh: load }}>
      {children}
    </AdminSessionContext.Provider>
  );
}
