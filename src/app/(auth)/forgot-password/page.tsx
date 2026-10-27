"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Step = "request" | "verify" | "done";

const inputCls =
  "mt-2 h-12 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/admin/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
        auth: false,
        skipRedirect: true,
      });
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a reset code");
    } finally {
      setLoading(false);
    }
  }

  async function completeReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 12) { setError("Admin passwords must be at least 12 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await apiFetch("/admin/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), otp: otp.trim(), newPassword: password }),
        auth: false,
        skipRedirect: true,
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[440px] rounded-[20px] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,.10)] sm:p-10">
      {step === "done" ? (
        <>
          <h2 className="text-[28px] font-bold tracking-[-0.03em] text-[#0F172A]">Password updated</h2>
          <p className="mt-2 text-sm leading-6 text-[#475569]">
            Every open admin session was revoked. Sign in with your new password — MFA still applies.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="mt-7 h-[52px] w-full rounded-lg bg-[#2563EB] text-sm font-bold text-white transition hover:bg-[#1D4ED8]"
          >
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <p className="text-[13px] font-semibold text-[#2563EB]">{step === "request" ? "Reset access" : "Check your email"}</p>
          <h2 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#0F172A]">Reset your admin password</h2>
          <p className="mt-2 text-sm leading-6 text-[#475569]">
            {step === "request"
              ? "We'll email a one-time code to your staff account before anything changes."
              : `Enter the 6-digit code sent to ${email.trim()}. It expires in 10 minutes.`}
          </p>

          {step === "request" ? (
            <form onSubmit={requestCode} className="mt-7 space-y-5">
              <label className="block text-sm font-semibold text-[#0F172A]">Work email
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required autoFocus className={inputCls} />
              </label>
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <button disabled={loading} className="h-[52px] w-full rounded-lg bg-[#2563EB] text-sm font-bold text-white transition hover:bg-[#1D4ED8] disabled:opacity-60">
                {loading ? "Sending…" : "Send reset code"}
              </button>
              <button type="button" onClick={() => router.push("/login")} className="h-[52px] w-full rounded-lg border border-[#CBD5E1] text-sm font-semibold text-[#0F172A] hover:bg-slate-50">
                Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={completeReset} className="mt-7 space-y-5">
              <label className="block text-sm font-semibold text-[#0F172A]">Reset code
                <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" required autoFocus className={inputCls} />
              </label>
              <label className="block text-sm font-semibold text-[#0F172A]">New password
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" required className={inputCls} />
              </label>
              <label className="block text-sm font-semibold text-[#0F172A]">Confirm new password
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" autoComplete="new-password" required className={inputCls} />
              </label>
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <button disabled={loading} className="h-[52px] w-full rounded-lg bg-[#2563EB] text-sm font-bold text-white transition hover:bg-[#1D4ED8] disabled:opacity-60">
                {loading ? "Saving…" : "Set new password"}
              </button>
              <button type="button" onClick={() => { setStep("request"); setOtp(""); setError(null); }} className="block w-full text-center text-sm text-[#64748B] hover:underline">
                Use a different email
              </button>
            </form>
          )}
          <div className="mt-6 rounded-xl bg-[#F8FAFC] px-4 py-3.5 text-[13px] leading-5 text-[#64748B]">
            Resetting your password signs out every device and is recorded in the audit trail.
          </div>
        </>
      )}
    </div>
  );
}
