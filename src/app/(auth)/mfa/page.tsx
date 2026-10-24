"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { hasSessionFlag } from "@/lib/api";

export default function MfaPage() {
  const router = useRouter(); const { verifyMfa } = useAuth();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(30);
  const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => {
    if (hasSessionFlag()) return router.replace("/overview");
    queueMicrotask(() => {
      setChallenge(sessionStorage.getItem("vista_challenge"));
      setEmail(sessionStorage.getItem("vista_login_email"));
    });
  }, [router]);
  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => (s <= 1 ? 30 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, []);
  const code = digits.join("");
  async function verify(e: React.FormEvent) {
    e.preventDefault(); if (!challenge) return setError("Your sign-in challenge expired. Please sign in again.");
    if (code.length !== 6) return setError("Enter all six digits.");
    setLoading(true); setError(null);
    try { const { mustChangePassword } = await verifyMfa(challenge, code); sessionStorage.clear(); router.push(mustChangePassword ? "/change-password" : "/overview"); }
    catch (e) { setError(e instanceof Error ? e.message : "Verification failed"); }
    finally { setLoading(false); }
  }
  function update(index: number, value: string) { const d = value.replace(/\D/g, "").slice(-1); setDigits((v) => v.map((x, i) => i === index ? d : x)); if (d && index < 5) refs.current[index + 1]?.focus(); }
  return (
    <div className="w-full max-w-[440px] rounded-[20px] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,.10)] sm:p-10">
      <p className="text-[13px] font-semibold text-[#2563EB]">Step 2 of 2</p>
      <h2 className="mt-2 text-[27px] font-bold tracking-[-0.02em] text-[#0F172A]">Verify it&rsquo;s you</h2>
      <p className="mt-2 text-[15px] leading-6 text-[#475569]">Enter the 6&#8209;digit code from your authenticator app, or tap your security key.</p>
      <div className="mt-6 flex items-start gap-3 rounded-xl bg-[#ECFDF5] px-4 py-4">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#059669]" viewBox="0 0 16 16" fill="none"><path d="m2.5 8.5 3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <p className="text-[13.5px] leading-5 text-[#334155]">Signed in with your staff account as<br />{email ?? "your work email"}</p>
      </div>
      <form onSubmit={verify} className="mt-6">
        <div className="grid grid-cols-6 gap-2 sm:gap-3">
          {digits.map((digit, i) => <input key={i} ref={(el) => { refs.current[i] = el; }} value={digit} onChange={(e) => update(i, e.target.value)} onKeyDown={(e) => { if (e.key === "Backspace" && !digit && i) refs.current[i - 1]?.focus(); }} inputMode="numeric" aria-label={`Verification digit ${i + 1}`} className="h-14 min-w-0 rounded-xl border border-[#CBD5E1] text-center text-[22px] font-bold text-[#0F172A] caret-[#2563EB] outline-none transition focus:border-[#2563EB] focus:border-2" />)}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-[#64748B]">
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.5"/><path d="M8 4.8V8l2.2 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          Code refreshes in {seconds}s
        </p>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button disabled={loading} className="mt-6 h-[52px] w-full rounded-lg bg-[#2563EB] text-[15px] font-semibold text-white transition hover:bg-[#1D4ED8] disabled:opacity-60">{loading ? "Verifying…" : "Verify and continue"}</button>
        {/* <button type="button" className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] text-[15px] font-semibold text-[#0F172A] hover:bg-slate-50">
          <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="none"><path d="M10 4.2c-2.9 0-5.2 2.3-5.2 5.2 0 1.6.3 3.2 1 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M10 7c-1.3 0-2.4 1.1-2.4 2.4 0 2 .5 3.9 1.4 5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M10 9.4c0 2.6.8 5 2.1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M12.4 5c1.7.9 2.8 2.6 2.8 4.6 0 1.1-.1 2.2-.4 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          Use security key instead
        </button> */}
      </form>
      <div className="mt-6 rounded-xl bg-[#F8FAFC] px-4 py-3.5 text-[13px] leading-5 text-[#64748B]">
        Device check: managed device · Lagos, NG
        <br />Sessions expire after 15 minutes idle.
      </div>
    </div>
  );
}
