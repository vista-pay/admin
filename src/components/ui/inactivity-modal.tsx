"use client";

import { Button } from "@/components/ui/button";

export function InactivityModal({
  open,
  countdown,
  onStay,
  onLogout,
}: {
  open: boolean;
  countdown: number;
  onStay: () => void;
  onLogout: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <svg width={20} height={20} viewBox="0 0 16 16" fill="none"><circle cx={8} cy={8} r={6} stroke="currentColor" strokeWidth={1.5}/><path d="M8 5V8L10.5 9" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">Are you still there?</h3>
            <p className="text-sm text-slate-500">You’ve been inactive for 15 minutes.</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          For security, you’ll be logged out in <span className="font-mono text-base font-bold text-[#0F172A]">{countdown}s</span>. Do you want to stay logged in?
        </p>

        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-[#012A9D] transition-all duration-1000" style={{ width: `${(countdown / 60) * 100}%` }} />
        </div>

        <div className="mt-6 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onLogout}>
            Log out now
          </Button>
          <Button className="flex-1" onClick={onStay}>
            Stay logged in
          </Button>
        </div>

        <p className="mt-3 text-center text-xs text-slate-400">Move your mouse or press any key to stay — otherwise you’ll be redirected to login.</p>
      </div>
    </div>
  );
}
