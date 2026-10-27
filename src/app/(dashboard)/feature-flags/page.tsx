"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Flag = {
  id: string; key: string; name: string; description?: string | null; category: string;
  enabled: boolean; rolloutPercentage: number; platforms: string[]; owner?: string | null;
  stage?: string | null; rules?: Record<string, unknown> | null; requiresApproval: boolean;
  version: number; reason: string; updatedAt: string;
};
type ServiceSwitch = {
  id: string; key: string; name: string; subtitle?: string | null; enabled: boolean;
  health: "LIVE" | "DEGRADED" | "PAUSED"; updatedByName?: string | null; updatedAt: string;
};
type ProviderAlert = {
  provider: string; errorRate: number; fallbackProvider: string | null; since: string;
  affectedServiceKeys: string[];
};
type MaintenanceWindow = { id: string; title: string; startsAt: string; endsAt: string };
type Controls = { switches: ServiceSwitch[]; providerAlert: ProviderAlert | null; maintenance: MaintenanceWindow[] };

/** Stroke icons per service key, so the cards read at a glance like the money flows they gate. */
const SERVICE_ICONS: Record<string, string> = {
  bank_transfers_out: "M7 17L17 7M17 7H8M17 7v9",
  add_money: "M12 5v14M5 12h14",
  withdrawals: "M12 3v12m0 0l-4-4m4 4l4-4M4 21h16",
  ajo_payouts: "M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7a3 3 0 110-6c2 0 3 2 3 3s-1 3-3 3zm0 0a3 3 0 100-6c-2 0-3 2-3 3s1 3 3 3z",
  spin_to_pick_draws: "M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  community_loans: "M3 7h18v12H3zM3 11h18M7 15h4",
  bills_airtime: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  new_signups: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6",
};

function timeHHMM(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function dayMon(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function platformsLabel(platforms: string[]) {
  if (!platforms.length) return "All";
  if (platforms.includes("INTERNAL")) return "Internal only";
  const names: Record<string, string> = { ANDROID: "Android", IOS: "iOS", WEB: "Web" };
  return platforms.map((p) => names[p] ?? p).join(" · ");
}

function flagStatus(f: Flag): { label: string; cls: string } {
  if (!f.enabled) return { label: "Paused", cls: "bg-red-50 text-red-600" };
  if (f.stage === "PILOT") return { label: "Pilot", cls: "bg-blue-50 text-blue-700" };
  if (f.stage === "STAFF_ONLY" || f.rolloutPercentage === 0) return { label: "Staff only", cls: "bg-slate-200 text-slate-700" };
  if (f.rolloutPercentage === 100) return { label: "Fully live", cls: "bg-emerald-50 text-emerald-700" };
  return { label: "Rolling out", cls: "bg-blue-50 text-blue-700" };
}

export default function FeatureFlagsPage() {
  const [controls, setControls] = useState<Controls | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  // Switch pause/resume confirmation (reason-gated)
  const [pendingSwitch, setPendingSwitch] = useState<ServiceSwitch | null>(null);
  const [switchReason, setSwitchReason] = useState("");

  // Flag configure modal
  const [selected, setSelected] = useState<Flag | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [rollout, setRollout] = useState(0);
  const [flagReason, setFlagReason] = useState("");

  // Schedule maintenance modal
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [mTitle, setMTitle] = useState("");
  const [mStart, setMStart] = useState("");
  const [mEnd, setMEnd] = useState("");
  const [mNote, setMNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [controlsRes, flagsRes] = await Promise.all([
        apiFetch<Controls>("/admin/service-controls"),
        apiFetch<Flag[]>("/admin/feature-flags"),
      ]);
      setControls(controlsRes.data);
      setFlags(flagsRes.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load service controls");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function saveSwitch() {
    if (!pendingSwitch || switchReason.trim().length < 5) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/service-controls/${pendingSwitch.key}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !pendingSwitch.enabled, reason: switchReason.trim() }),
      });
      setToast(`${pendingSwitch.name} ${pendingSwitch.enabled ? "paused" : "resumed"}.`);
      setPendingSwitch(null);
      setSwitchReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Switch update failed");
    } finally {
      setBusy(false);
    }
  }

  function openFlag(f: Flag) {
    setSelected(f);
    setEnabled(f.enabled);
    setRollout(f.rolloutPercentage);
    setFlagReason("");
  }

  async function saveFlag() {
    if (!selected || flagReason.trim().length < 5) return;
    setBusy(true);
    try {
      await apiFetch("/admin/feature-flags", {
        method: "POST",
        body: JSON.stringify({
          key: selected.key, name: selected.name, description: selected.description ?? undefined,
          category: selected.category, enabled, rolloutPercentage: rollout,
          platforms: selected.platforms, owner: selected.owner ?? undefined, stage: selected.stage ?? undefined,
          rules: selected.rules ?? {}, requiresApproval: selected.requiresApproval, reason: flagReason.trim(),
        }),
      });
      setToast(`${selected.name} updated successfully.`);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Flag update failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveMaintenance() {
    if (mTitle.trim().length < 3 || !mStart || !mEnd) return;
    setBusy(true);
    try {
      await apiFetch("/admin/maintenance-windows", {
        method: "POST",
        body: JSON.stringify({
          title: mTitle.trim(),
          startsAt: new Date(mStart).toISOString(),
          endsAt: new Date(mEnd).toISOString(),
          note: mNote.trim() || undefined,
        }),
      });
      setToast("Maintenance window scheduled.");
      setShowMaintenance(false);
      setMTitle(""); setMStart(""); setMEnd(""); setMNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not schedule maintenance");
    } finally {
      setBusy(false);
    }
  }

  const alert = controls?.providerAlert ?? null;

  return (
    <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">Feature flags &amp; services</h1>
          <p className="mt-1 text-sm text-slate-600">
            Kill-switches pause a service platform-wide in seconds · every change needs a reason and is shown to users when customer-facing
          </p>
        </div>
        <button
          onClick={() => setShowMaintenance(true)}
          className="flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          Schedule maintenance
        </button>
      </header>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {alert && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="mt-0.5 text-amber-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
          </span>
          <p>
            <b>{alert.provider} payouts degraded ({alert.errorRate}% errors).</b>{" "}
            {alert.fallbackProvider
              ? <>Auto-routing new withdrawals to {alert.fallbackProvider} since {timeHHMM(alert.since)} — no action needed unless errors exceed 5%.</>
              : <>No healthy fallback provider is available — investigate now.</>}
          </p>
        </div>
      )}

      {/* Kill-switch cards */}
      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(controls?.switches ?? []).map((s) => {
          const paused = s.health === "PAUSED";
          const degraded = s.health === "DEGRADED";
          return (
            <article key={s.id} className={`rounded-2xl border bg-white p-4 ${paused ? "border-red-300 ring-1 ring-red-200" : ""}`}>
              <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${paused ? "bg-red-50 text-red-600" : degraded ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-700"}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={SERVICE_ICONS[s.key] ?? "M13 2L3 14h9l-1 8 10-12h-9l1-8z"} />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{s.name}</b>
                  <p className="truncate text-xs text-slate-500">{s.subtitle}</p>
                </div>
                <button
                  onClick={() => { setPendingSwitch(s); setSwitchReason(""); }}
                  aria-label={`Toggle ${s.name}`}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${s.enabled ? "bg-blue-600" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${s.enabled ? "left-6" : "left-1"}`} />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className={`rounded-full px-2 py-1 text-xs font-bold ${paused ? "bg-red-50 text-red-600" : degraded ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                  ● {paused ? "Paused" : degraded ? "Degraded" : "Live"}
                </span>
                <small className="text-slate-500">
                  {paused && s.updatedByName ? `${s.updatedByName} · ${dayMon(s.updatedAt)}` : degraded && alert ? `auto · ${timeHHMM(alert.since)}` : "—"}
                </small>
              </div>
            </article>
          );
        })}
      </section>

      {/* Feature rollouts */}
      <section className="mt-5 rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black">Feature rollouts</h2>
          <span className="text-xs text-slate-500">Gradual release by % of users, platform or region</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-100 text-[11px] uppercase text-slate-600">
              <tr>{["Flag key", "What it does", "Audience", "Platforms", "Owner", "Status"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr>
            </thead>
            <tbody>
              {flags.map((f) => {
                const status = flagStatus(f);
                return (
                  <tr key={f.id} onClick={() => openFlag(f)} className="cursor-pointer border-t hover:bg-slate-50">
                    <td className="px-3 py-3 font-bold">{f.key}</td>
                    <td className="px-3 py-3">{f.description ?? f.name}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-16 rounded bg-slate-100">
                          <span className="block h-full rounded bg-blue-600" style={{ width: `${f.rolloutPercentage}%` }} />
                        </span>
                        <b>{f.rolloutPercentage}%</b>
                      </div>
                    </td>
                    <td className="px-3 py-3">{platformsLabel(f.platforms)}</td>
                    <td className="px-3 py-3">{f.owner ?? "—"}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${status.cls}`}>● {status.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!flags.length && <p className="p-10 text-center text-sm text-slate-500">No feature flags configured.</p>}
      </section>

      {/* Pause / resume a service (reason-gated) */}
      {pendingSwitch && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="flex justify-between">
              <div>
                <h2 className="text-lg font-black">{pendingSwitch.enabled ? "Pause" : "Resume"} {pendingSwitch.name}</h2>
                <p className="text-xs text-slate-500">
                  {pendingSwitch.enabled
                    ? "Pausing stops this service platform-wide within seconds. Customers see a maintenance message."
                    : "Resuming re-opens the service to all customers immediately."}
                </p>
              </div>
              <button onClick={() => setPendingSwitch(null)} className="text-xl">×</button>
            </div>
            <textarea
              autoFocus rows={4} value={switchReason} onChange={(e) => setSwitchReason(e.target.value)}
              placeholder="Required change reason (shown in the audit trail)"
              className="mt-4 w-full rounded-xl border p-3 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPendingSwitch(null)} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
              <button
                disabled={busy || switchReason.trim().length < 5}
                onClick={saveSwitch}
                className={`rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-40 ${pendingSwitch.enabled ? "bg-red-600" : "bg-blue-600"}`}
              >
                {busy ? "Saving…" : pendingSwitch.enabled ? "Pause service" : "Resume service"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configure a rollout flag */}
      {selected && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="flex justify-between">
              <div>
                <h2 className="text-lg font-black">Configure {selected.name}</h2>
                <p className="text-xs text-slate-500">{selected.key} · current version {selected.version}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-xl">×</button>
            </div>
            <label className="mt-5 flex items-center justify-between rounded-xl border p-3 text-sm font-bold">
              Enabled
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5" />
            </label>
            <label className="mt-4 block text-xs font-bold text-slate-600">
              Rollout percentage · {rollout}%
              <input type="range" min="0" max="100" value={rollout} onChange={(e) => setRollout(Number(e.target.value))} className="mt-2 w-full" />
            </label>
            <textarea
              rows={4} value={flagReason} onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Required change reason" className="mt-4 w-full rounded-xl border p-3 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
              <button disabled={busy || flagReason.trim().length < 5} onClick={saveFlag} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                {busy ? "Saving…" : "Apply change"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule maintenance */}
      {showMaintenance && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="flex justify-between">
              <div>
                <h2 className="text-lg font-black">Schedule maintenance</h2>
                <p className="text-xs text-slate-500">Recorded in the audit trail and shown on this console</p>
              </div>
              <button onClick={() => setShowMaintenance(false)} className="text-xl">×</button>
            </div>
            <input
              autoFocus value={mTitle} onChange={(e) => setMTitle(e.target.value)}
              placeholder="Title (e.g. NIP rail maintenance)" className="mt-5 w-full rounded-xl border p-3 text-sm"
            />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-slate-600">
                Starts
                <input type="datetime-local" value={mStart} onChange={(e) => setMStart(e.target.value)} className="mt-1 w-full rounded-xl border p-2.5 text-sm" />
              </label>
              <label className="block text-xs font-bold text-slate-600">
                Ends
                <input type="datetime-local" value={mEnd} onChange={(e) => setMEnd(e.target.value)} className="mt-1 w-full rounded-xl border p-2.5 text-sm" />
              </label>
            </div>
            <textarea
              rows={3} value={mNote} onChange={(e) => setMNote(e.target.value)}
              placeholder="Note (optional)" className="mt-3 w-full rounded-xl border p-3 text-sm"
            />
            {controls?.maintenance.length ? (
              <p className="mt-3 text-xs text-slate-500">
                Upcoming: {controls.maintenance.map((m) => `${m.title} (${dayMon(m.startsAt)})`).join(" · ")}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowMaintenance(false)} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button>
              <button
                disabled={busy || mTitle.trim().length < 3 || !mStart || !mEnd}
                onClick={saveMaintenance}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy ? "Saving…" : "Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-5 right-5 z-[90] rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-xl">✓ {toast}</div>}
    </main>
  );
}
