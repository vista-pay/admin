"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 12) return setError("The new password must be at least 12 characters.");
    if (next !== confirm) return setError("The new passwords do not match.");
    if (next === current) return setError("Choose a password different from the temporary one.");
    setLoading(true);
    setError(null);
    try {
      await adminApi.changePassword({ currentPassword: current, newPassword: next });
      router.replace("/overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Password change failed");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "mt-1 h-12 w-full rounded-lg border border-[#CBD5E1] px-3.5 text-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100";

  return (
    <div className="w-full max-w-[440px] rounded-[20px] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,.10)] sm:p-10">
      <p className="text-[13px] font-semibold text-[#2563EB]">Secure your account</p>
      <h2 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#0F172A]">Set a new password</h2>
      <p className="mt-2 text-sm leading-6 text-[#475569]">
        You signed in with a temporary password. Choose your own before continuing — it must be at least 12 characters.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-xs font-semibold text-[#0F172A]">
          Temporary password
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required className={field} />
        </label>
        <label className="block text-xs font-semibold text-[#0F172A]">
          New password
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required minLength={12} className={field} />
        </label>
        <label className="block text-xs font-semibold text-[#0F172A]">
          Confirm new password
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={12} className={field} />
        </label>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button disabled={loading} className="h-[52px] w-full rounded-lg bg-[#2563EB] text-sm font-bold text-white disabled:opacity-60">
          {loading ? "Saving…" : "Save password and continue"}
        </button>
      </form>
      <div className="mt-5 rounded-lg bg-[#F8FAFC] p-3 text-xs leading-5 text-[#64748B]">
        Use a long, unique passphrase. Every other session on this account is signed out when the password changes.
      </div>
    </div>
  );
}
