"use client";

import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { adminApi, hasSessionFlag } from "@/lib/api";

type AuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ challengeToken: string; enrollment?: { secret: string; provisioningUri: string }; debugOtp?: string }>;
  verifyMfa: (challengeToken: string, code: string) => Promise<{ mustChangePassword: boolean }>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useAuthState(): AuthState {
  // The session itself lives in HttpOnly cookies the browser never exposes to
  // JavaScript; this only tracks whether one exists.
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsAuthenticated(hasSessionFlag());
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await adminApi.login({ email, password });
    const data = res.data as { challengeToken: string; mfaEnrollment?: { secret: string; provisioningUri: string }; debugOtp?: string };
    return { challengeToken: data.challengeToken, enrollment: data.mfaEnrollment, debugOtp: data.debugOtp };
  }, []);

  const verifyMfa = useCallback(async (challengeToken: string, code: string) => {
    // The API replies with Set-Cookie only - there is no token to store here.
    const res = await adminApi.verifyMfa({ challengeToken, code });
    setIsAuthenticated(hasSessionFlag());
    return { mustChangePassword: Boolean(res.data?.mustChangePassword) };
  }, []);

  const logout = useCallback(async () => {
    // Revoke the refresh token server-side; dropping a cookie alone would
    // leave a usable session behind.
    try {
      await adminApi.logout();
    } catch {
      // Already expired or unreachable - the cookies are cleared either way.
    }
    setIsAuthenticated(false);
  }, []);

  return {
    isAuthenticated,
    isLoading,
    login,
    verifyMfa,
    logout,
  };
}
