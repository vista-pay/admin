"use client";
import { useEffect, useState, useRef } from "react";
import { adminApi, apiFetch } from "@/lib/api";
import { API_BASE } from "@/lib/constants";

type AdminProfile = { id: string; email: string; firstName: string; lastName: string; avatarUrl?: string | null; role: string; isActive?: boolean; lastLoginAt?: string | null };

export default function SettingsPage() {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadProfile() {
    setLoading(true);
    try {
      const r = await apiFetch<AdminProfile>("/admin/me");
      const data = r.data as unknown as AdminProfile;
      setAdmin(data);
      setFirstName(data.firstName ?? "");
      setLastName(data.lastName ?? "");
      if (data.avatarUrl) setAvatarPreview(data.avatarUrl);
    } catch {
      // No client-side fallback: the session token is HttpOnly and cannot be
      // decoded here. /admin/me is the only source of admin identity.
      setAdmin(null);
    } finally { setLoading(false); }
  }

  useEffect(() => { loadProfile(); }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileMsg("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileMsg("Image must be less than 5MB.");
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true); setProfileMsg(null);
    try {
      let avatarUrl = admin?.avatarUrl ?? undefined;
      // For demo, if a new file was selected, convert to data URL and save as avatarUrl
      // In production, you'd upload to S3 and get a URL
      if (avatarFile && avatarPreview) {
        avatarUrl = avatarPreview; // data URL
      }
      const r = await apiFetch<AdminProfile>("/admin/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined, avatarUrl }),
      });
      const updated = r.data as unknown as AdminProfile;
      setAdmin(updated);
      setProfileMsg("Profile updated successfully.");
      setAvatarFile(null);
    } catch (e: unknown) {
      setProfileMsg(e instanceof Error ? e.message : "Failed to update profile");
    } finally { setSavingProfile(false); }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null); setPasswordMsg(null);
    if (newPassword.length < 12) {
      setPasswordError("New password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      await apiFetch("/admin/me/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordMsg("Password changed successfully. Please sign in again with your new password.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (e: unknown) {
      setPasswordError(e instanceof Error ? e.message : "Failed to change password");
    } finally { setChangingPassword(false); }
  }

  const displayAdmin = admin;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#F8FAFC] p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#012A9D] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-[#F8FAFC]">
      <div className="flex h-[68px] items-center border-b border-slate-200 bg-white px-6">
        <h1 className="text-[18px] font-semibold text-[#0F172A]">Settings</h1>
      </div>

      <div className="p-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Profile */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-[#0F172A]">Admin Profile</h3>
            <p className="text-xs text-slate-500">Update your display name and profile picture.</p>

            <form onSubmit={handleSaveProfile} className="mt-6 space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-6">
                <div className="relative">
                  <img
                    src={avatarPreview || "https://i.pravatar.cc/100?img=15"}
                    alt="Admin avatar"
                    className="h-20 w-20 rounded-full object-cover border-2 border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#012A9D] text-white shadow hover:bg-[#011E7A]"
                    title="Change picture"
                  >
                    <svg width={14} height={14} viewBox="0 0 16 16" fill="none"><path d="M11 3L13 5L5 13H3V11L11 3Z" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round"/><path d="M10 4L12 6" stroke="currentColor" strokeWidth={1.3}/></svg>
                  </button>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">{displayAdmin?.email ?? "admin@vistaglobal.io"}</p>
                  <p className="text-xs text-slate-500">{displayAdmin?.role ?? "SUPER_ADMIN"} • Active</p>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-[#0F172A] hover:bg-slate-50">Change picture</button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  {avatarFile && <p className="mt-1 text-xs text-slate-500">{avatarFile.name} • {(avatarFile.size / 1024).toFixed(1)} KB</p>}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">First Name</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Admin" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-[#012A9D] focus:outline-none focus:ring-2 focus:ring-[#012A9D]/10" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Last Name</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="User" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-[#012A9D] focus:outline-none focus:ring-2 focus:ring-[#012A9D]/10" />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <div className="text-xs text-slate-500">Email: <span className="font-medium text-[#0F172A]">{displayAdmin?.email ?? "—"}</span> • Role: <span className="rounded bg-[#012A9D]/10 px-2 py-1 text-xs font-medium text-[#012A9D]">{displayAdmin?.role ?? "—"}</span></div>
              </div>

              {profileMsg && <div className={`rounded-lg px-3 py-2 text-xs ${profileMsg.includes("successfully") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{profileMsg}</div>}

              <button type="submit" disabled={savingProfile} className="w-full rounded-xl bg-[#012A9D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#011E7A] disabled:opacity-50">
                {savingProfile ? "Saving…" : "Save Profile"}
              </button>
            </form>
          </div>

          {/* Reset Password */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-[#0F172A]">Reset Password</h3>
            <p className="text-xs text-slate-500">Change your password. Requires current password and at least 12 characters for the new one.</p>

            <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current Password</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-[#012A9D] focus:outline-none focus:ring-2 focus:ring-[#012A9D]/10" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 12 characters" required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-[#012A9D] focus:outline-none focus:ring-2 focus:ring-[#012A9D]/10" />
                <p className="mt-1 text-xs text-slate-400">Must be at least 12 characters. Use a mix of letters, numbers, and symbols.</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-[#012A9D] focus:outline-none focus:ring-2 focus:ring-[#012A9D]/10" />
              </div>

              {passwordError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{passwordError}</div>}
              {passwordMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{passwordMsg}</div>}

              <button type="submit" disabled={changingPassword} className="w-full rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1E293B] disabled:opacity-50">
                {changingPassword ? "Updating…" : "Change Password"}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-[#0F172A]">Security</h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">Email OTP</p>
                  <p className="text-xs text-slate-500">6-digit code via email, 10m expiry</p>
                </div>
                <span className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Enabled</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">Inactivity Logout</p>
                  <p className="text-xs text-slate-500">15m idle → modal, 60s → auto logout</p>
                </div>
                <span className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Active</span>
              </div>
              <button onClick={async () => { await adminApi.logout().catch(() => undefined); location.href = "/login"; }} className="w-full rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">Sign out of all sessions</button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-[#0F172A]">Environment</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between border-b border-slate-100 py-2"><span className="text-slate-500">API Base</span><span className="font-mono text-xs">{API_BASE}</span></div>
              <div className="flex justify-between border-b border-slate-100 py-2"><span className="text-slate-500">BullBoard</span><a href={API_BASE.replace(/\/api\/v1\/?$/, "") + "/admin/queues"} target="_blank" rel="noreferrer" className="text-xs text-[#012A9D] hover:underline">Open →</a></div>
              <div className="flex justify-between py-2"><span className="text-slate-500">API Docs</span><a href={API_BASE.replace(/\/api\/v1\/?$/, "") + "/api/docs"} target="_blank" rel="noreferrer" className="text-xs text-[#012A9D] hover:underline">Open →</a></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
