"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { hasSessionFlag } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (hasSessionFlag()) router.replace("/overview"); }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      const { challengeToken, enrollment, debugOtp } = await login(email, password);
      sessionStorage.setItem("vista_challenge", challengeToken);
      sessionStorage.setItem("vista_login_email", email);
      if (enrollment) sessionStorage.setItem("vista_enrollment", JSON.stringify({ secret: enrollment.secret, uri: enrollment.provisioningUri }));
      if (debugOtp) sessionStorage.setItem("vista_debug_otp", debugOtp);
      router.push("/mfa");
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="w-full max-w-[440px] rounded-[20px] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,.10)] sm:p-10">
      <p className="text-[13px] font-semibold text-[#2563EB]">Step 1 of 2</p>
      <h2 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#0F172A]">Sign in to Rendi Admin</h2>
      <p className="mt-2 text-sm leading-6 text-[#475569]">Use your authorised staff account. Multi-factor verification is required.</p>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <label className="block text-sm font-semibold text-[#0F172A]">Work email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required placeholder="tolu.adebayo@vnetglobal.com" className="mt-2 h-12 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="block text-sm font-semibold text-[#0F172A]">Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required placeholder="••••••••••••" className="mt-2 h-12 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100" />
        </label>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="text-right">
          <button type="button" onClick={() => router.push("/forgot-password")} className="text-sm font-semibold text-[#2563EB] hover:underline">
            Forgot password?
          </button>
        </div>
        <button disabled={loading} className="h-[52px] w-full rounded-lg bg-[#2563EB] text-sm font-bold text-white transition hover:bg-[#1D4ED8] disabled:opacity-60">{loading ? "Signing in…" : "Continue securely"}</button>
        {/* <button type="button" className="h-[52px] w-full rounded-lg border border-[#CBD5E1] text-sm font-semibold text-[#0F172A] hover:bg-slate-50">Continue with Google Workspace</button> */}
      </form>
      <div className="mt-6 rounded-xl bg-[#F8FAFC] px-4 py-3.5 text-[13px] leading-5 text-[#64748B]">Device and session checks are active. Sessions expire after 15 minutes idle.</div>
    </div>
  );
}
