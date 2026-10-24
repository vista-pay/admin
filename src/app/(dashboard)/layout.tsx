"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { hasSessionFlag } from "@/lib/api";
import { pathPermission } from "@/lib/permissions";
import { useInactivity } from "@/hooks/use-inactivity";
import { InactivityModal } from "@/components/ui/inactivity-modal";
import { GlobalTopbar } from "@/components/layout/global-topbar";
import { AdminSessionProvider, useAdminSession } from "@/components/providers/session-provider";

/**
 * Enforces the signed-in admin's access inside the dashboard shell: a pending
 * forced password change bounces to /change-password, and a route outside the
 * role's permissions shows a restricted panel (the API 403s regardless).
 */
function AccessGate({ children }: { children: React.ReactNode }) {
  const { profile, loading, can } = useAdminSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.mustChangePassword) router.replace("/change-password");
  }, [loading, profile, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#012A9D] border-t-transparent" />
      </div>
    );
  }

  if (!can(pathPermission(pathname))) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">⚿</p>
          <h2 className="mt-3 text-lg font-bold text-[#0F172A]">Access restricted</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Your role{profile?.roleName ? ` (${profile.roleName})` : ""} does not include this area. Ask a super
            administrator if you need it.
          </p>
          <button onClick={() => router.replace("/overview")} className="mt-5 h-10 rounded-lg bg-[#2563EB] px-5 text-sm font-bold text-white">
            Back to overview
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { showModal, countdown, stayLoggedIn, logout } = useInactivity();

  useEffect(() => {
    if (!hasSessionFlag()) {
      router.replace("/login");
      return;
    }
    queueMicrotask(() => setReady(true));
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#012A9D] border-t-transparent" />
      </div>
    );
  }

  return (
    <AdminSessionProvider>
      <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="flex h-screen flex-1 flex-col overflow-y-auto">
          <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
            <button onClick={() => setMenuOpen(true)} aria-label="Open navigation" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-700">☰</button>
            <img src="/rendi-brand-symbol.png" alt="Rendi" className="h-7 w-7 rounded-md" />
            <span className="text-sm font-extrabold text-[#0F172A]">RENDI</span>
            <span className="rounded bg-[#2563EB] px-1.5 py-0.5 text-[9px] font-bold text-white">ADMIN</span>
          </div>
          <GlobalTopbar />
          <div className="flex flex-1 flex-col">
            <AccessGate>{children}</AccessGate>
          </div>
        </div>
        <InactivityModal open={showModal} countdown={countdown} onStay={stayLoggedIn} onLogout={logout} />
      </div>
    </AdminSessionProvider>
  );
}
