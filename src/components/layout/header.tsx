"use client";

import { useRouter } from "next/navigation";

export function Header({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div>
        <h1 className="text-[18px] font-semibold text-[#0F172A] tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions ?? (
          <>
            <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 sm:flex">
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><rect x={2} y={3} width={12} height={10} rx={1.5} stroke="#64748B" strokeWidth={1.2}/><path d="M5 2V4M11 2V4M2 6H14" stroke="#64748B" strokeWidth={1.2} strokeLinecap="round"/></svg>
              <span>Last 30 Days</span>
              <svg width={12} height={12} viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="#64748B" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><path d="M13 8A5 5 0 0 1 3.5 9.5M3 8A5 5 0 0 1 12.5 6.5M3 3V8H8M13 13V8H8" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function DashboardHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <Header
      title={title}
      actions={
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-[7px] text-sm font-medium text-slate-700 hover:bg-slate-50">
            <svg width={14} height={14} viewBox="0 0 16 16" fill="none"><rect x={2} y={3} width={12} height={10} rx={1.5} stroke="#64748B" strokeWidth={1.2}/><path d="M5 2V4M11 2V4M2 6H14" stroke="#64748B" strokeWidth={1.2} strokeLinecap="round"/></svg>
            Last 30 Days
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="#64748B" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button
            onClick={() => router.refresh()}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Refresh"
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><path d="M13 8A5 5 0 0 1 3.5 9.5M3 8A5 5 0 0 1 12.5 6.5M3 3V8H8M13 13V8H8" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      }
    />
  );
}
