"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminSelect } from "@/components/ui/admin-select";
import type { CommunityFilterOptions, CommunityFilters } from "@/lib/api";

/**
 * The one filter rail the Community Dashboard and All Communities share.
 *
 * Shared because the API narrows the community set before it aggregates, so
 * the dashboard's figures are the totals *for the rows the list shows*. Two
 * rails would be two interpretations of "Lagos cooperatives", and the first
 * time they disagreed the header would contradict the table under it.
 */

export const CATEGORY_LABELS: Record<string, string> = {
  COOPERATIVE: "Cooperative society",
  AJO_THRIFT: "Ajo / thrift group",
  STAFF_COOPERATIVE: "Staff cooperative",
  TRADE_ASSOCIATION: "Trade association",
  OTHER_COMMUNITY: "Other community group",
};

export const STATUS_LABELS: Record<string, string> = {
  VERIFIED: "Active",
  PENDING: "Pending approval",
  SUSPENDED: "Suspended",
  INACTIVE: "Inactive",
  REJECTED: "Rejected",
};

export const VERIFICATION_LABELS: Record<string, string> = {
  PENDING: "Pending verification",
  BASIC: "Basic verified",
  FULL: "Fully verified",
};

/**
 * Filter state, seeded from the query string.
 *
 * Seeded so a tile on the dashboard can link into the list already narrowed
 * (`/community/all?status=SUSPENDED`) — a count that cannot be clicked
 * through to its rows is a dead end.
 */
export function useCommunityFilters() {
  const params = useSearchParams();
  const initial = useMemo<CommunityFilters>(
    () => ({
      status: params.get("status") ?? undefined,
      category: params.get("category") ?? undefined,
      state: params.get("state") ?? undefined,
      lga: params.get("lga") ?? undefined,
      verification: params.get("verification") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      search: params.get("search") ?? undefined,
    }),
    [params],
  );
  const [filters, setFilters] = useState<CommunityFilters>(initial);
  const [options, setOptions] = useState<CommunityFilterOptions | null>(null);
  return { filters, setFilters, options, setOptions };
}

export function CommunityFilterRail({
  filters,
  onChange,
  options,
  className = "",
}: {
  filters: CommunityFilters;
  onChange: (next: CommunityFilters) => void;
  options: CommunityFilterOptions | null;
  className?: string;
}) {
  const set = (key: keyof CommunityFilters, value: string) =>
    onChange({ ...filters, [key]: value || undefined });

  // LGAs narrow to the chosen state. Offering all of them regardless would
  // list hundreds, most returning nothing.
  const lgas = (options?.lgas ?? []).filter(
    (row) => !filters.state || row.state?.toLowerCase() === filters.state.toLowerCase(),
  );
  const active = Object.entries(filters).filter(([, value]) => Boolean(value));

  return (
    <div className={className}>
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
        <input
          value={filters.search ?? ""}
          onChange={(e) => set("search", e.target.value)}
          placeholder="Name, Rendi ID, registration number or email"
          className="h-11 min-w-0 flex-1 rounded-xl border px-4 text-sm outline-none focus:border-blue-500"
        />
        <AdminSelect aria-label="Filter by status" value={filters.status ?? ""} onChange={(e) => set("status", e.target.value)} containerClassName="w-full lg:w-[165px]">
          <option value="">Any status</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </AdminSelect>
        <AdminSelect aria-label="Filter by category" value={filters.category ?? ""} onChange={(e) => set("category", e.target.value)} containerClassName="w-full lg:w-[195px]">
          <option value="">Any type</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
              {options?.categories.find((c) => c.category === value)
                ? ` (${options.categories.find((c) => c.category === value)!.communities})`
                : ""}
            </option>
          ))}
        </AdminSelect>
        <AdminSelect aria-label="Filter by verification" value={filters.verification ?? ""} onChange={(e) => set("verification", e.target.value)} containerClassName="w-full lg:w-[180px]">
          <option value="">Any verification</option>
          {Object.entries(VERIFICATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </AdminSelect>
        {/* States and LGAs come from the API rather than a hard-coded list of
            36 and 774, so the rail only offers places a community exists. */}
        <AdminSelect aria-label="Filter by state" value={filters.state ?? ""} onChange={(e) => onChange({ ...filters, state: e.target.value || undefined, lga: undefined })} containerClassName="w-full lg:w-[150px]">
          <option value="">Any state</option>
          {(options?.states ?? []).map((state) => <option key={state} value={state}>{state}</option>)}
        </AdminSelect>
        <AdminSelect aria-label="Filter by local government area" value={filters.lga ?? ""} onChange={(e) => set("lga", e.target.value)} containerClassName="w-full lg:w-[150px]" disabled={!lgas.length}>
          <option value="">{lgas.length ? "Any LGA" : "No LGAs recorded"}</option>
          {lgas.map((row) => <option key={row.lga} value={row.lga}>{row.lga}</option>)}
        </AdminSelect>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
          Registered
          <input type="date" value={filters.from ?? ""} onChange={(e) => set("from", e.target.value)} className="h-9 rounded-lg border px-2 text-xs font-normal outline-none focus:border-blue-500" />
          to
          <input type="date" value={filters.to ?? ""} onChange={(e) => set("to", e.target.value)} className="h-9 rounded-lg border px-2 text-xs font-normal outline-none focus:border-blue-500" />
        </label>
        {active.length > 0 && (
          <button onClick={() => onChange({})} className="rounded-lg border px-3 py-1.5 text-xs font-bold text-slate-700">
            Clear {active.length} filter{active.length === 1 ? "" : "s"}
          </button>
        )}
        {(options?.uncategorised ?? 0) > 0 && !filters.category && (
          <span className="text-xs text-slate-500">
            {options!.uncategorised} {options!.uncategorised === 1 ? "community has" : "communities have"} no category set
          </span>
        )}
      </div>
    </div>
  );
}
