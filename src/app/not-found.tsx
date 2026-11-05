import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Route unavailable",
  description: "The requested Rendi Admin route could not be found.",
};

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh overflow-hidden bg-[#0B1220] px-5 py-6 text-white sm:px-8">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_76%_28%,rgba(37,99,235,.22),transparent_34%),radial-gradient(circle_at_18%_88%,rgba(14,165,233,.10),transparent_28%)]" />
      <div aria-hidden className="absolute inset-0 opacity-[.07] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <Link href="/overview" className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1220]">
            <img src="/rendi-logo.svg" alt="" className="h-10 w-10 rounded-xl bg-white" />
            <div className="flex items-center gap-2.5">
              <span className="text-[15px] font-extrabold tracking-tight">RENDI</span>
              <span className="rounded bg-[#2563EB] px-2 py-1 text-[9px] font-bold tracking-wider">ADMIN</span>
            </div>
          </Link>
          <span className="rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-xs font-semibold text-slate-300 backdrop-blur">HTTP 404</span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1fr_420px]">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Route unavailable
            </div>
            <h1 className="text-4xl font-bold leading-[1.08] tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
              The control route could not be resolved.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">
              The URL may be outdated, mistyped, or no longer available to this console. No administrative action was performed.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/overview" className="inline-flex h-12 items-center justify-center rounded-xl bg-[#2563EB] px-6 text-sm font-bold text-white shadow-[0_12px_30px_-10px_rgba(37,99,235,.7)] transition hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1220]">
                Return to control center <span aria-hidden className="ml-2">→</span>
              </Link>
              <Link href="/system-health" className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 bg-white/[.06] px-6 text-sm font-semibold text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1220]">
                Check system health
              </Link>
            </div>
          </div>

          <div aria-hidden className="rounded-2xl border border-white/10 bg-[#101A2D]/90 p-5 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <span>Route diagnostic</span><span className="text-amber-300">Not found</span>
            </div>
            <div className="space-y-4 py-6 font-mono text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-500">status</span><span className="text-red-300">404</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">request</span><span className="text-slate-300">unmatched_route</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">mutation</span><span className="text-emerald-300">none</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">next_action</span><span className="text-blue-300">return_overview</span></div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs leading-5 text-slate-400">No platform data was changed by this request.</div>
          </div>
        </section>

        <footer className="flex flex-col gap-1 border-t border-white/10 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Rendi Admin Control Center</span><span>Restricted to authorised personnel</span>
        </footer>
      </div>
    </main>
  );
}
