"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AdminSelect } from "@/components/ui/admin-select";
import { formatCurrency, formatDate } from "@/lib/utils";

type Rule = {
  id: string;
  transactionType: string;
  currencyCode: string;
  feeType: "FLAT" | "PERCENTAGE" | "HYBRID";
  flatAmount: string;
  /** A fraction of the amount, not a percentage: 0.015 means 1.5%. */
  percentageRate: string;
  minFee: string;
  maxFee?: string | null;
  isActive: boolean;
  updatedAt: string;
};

type Log = {
  id: string;
  action: string;
  actorName?: string;
  createdAt: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
};

type Response = { items: Rule[]; history: Log[]; chargeableTypes?: string[] };

type Form = {
  transactionType: string;
  currencyCode: string;
  feeType: Rule["feeType"];
  flatAmount: string;
  /** Held as a percentage, the way an operator says it: 1.5 means 1.5%. */
  percent: string;
  minFee: string;
  maxFee: string;
  isActive: boolean;
  reason: string;
};

const BLANK: Form = {
  transactionType: "TRANSFER",
  currencyCode: "NGN",
  feeType: "FLAT",
  flatAmount: "0",
  percent: "0",
  minFee: "0",
  maxFee: "",
  isActive: true,
  reason: "",
};

const FALLBACK_TYPES = [
  "DEPOSIT",
  "WITHDRAWAL",
  "TRANSFER",
  "FX_CONVERSION",
  "PAYMENT_LINK",
  "INTERNATIONAL_TRANSFER",
  "MERCHANT_SETTLEMENT",
];

const pretty = (value: string) =>
  value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * The engine stores a rate as a fraction and multiplies the amount by it, so
 * 0.015 is 1.5%. Printing the stored number with a % sign read as 0.015% — a
 * hundredfold understatement of every percentage fee on this page.
 */
const toPercent = (rate: string) => {
  const value = Number(rate) * 100;
  if (Number.isNaN(value)) return "0";
  return `${Number(value.toFixed(4))}`;
};
const toRate = (percent: string) => {
  const value = Number(percent) / 100;
  if (Number.isNaN(value)) return "0";
  // Decimal(18,4) on the column: anything finer is silently truncated.
  return value.toFixed(4);
};

/** What the rule charges, said the way it is actually computed. */
function ruleText(rule: Rule) {
  const money = (amount: string | number) => formatCurrency(amount, rule.currencyCode);
  if (rule.feeType === "FLAT") return `${money(rule.flatAmount)} flat`;
  const percent = `${toPercent(rule.percentageRate)}%`;
  const base = rule.feeType === "HYBRID" ? `${money(rule.flatAmount)} + ${percent}` : percent;
  const caps = [
    Number(rule.minFee) > 0 ? `min ${money(rule.minFee)}` : null,
    rule.maxFee && Number(rule.maxFee) > 0 ? `cap ${money(rule.maxFee)}` : null,
  ].filter(Boolean);
  return caps.length ? `${base} · ${caps.join(" · ")}` : base;
}

/** Mirrors FeesAndLimitsService.calculateFee so the preview cannot disagree. */
function feeOn(amount: number, form: Form) {
  const flat = Number(form.flatAmount) || 0;
  const rate = Number(toRate(form.percent)) || 0;
  let fee = form.feeType === "FLAT" ? flat : form.feeType === "PERCENTAGE" ? amount * rate : flat + amount * rate;
  const min = Number(form.minFee) || 0;
  const max = form.maxFee === "" ? null : Number(form.maxFee);
  if (min > fee) fee = min;
  if (max !== null && !Number.isNaN(max) && fee > max) fee = max;
  return fee;
}

const PREVIEW_AMOUNTS = [1000, 10000, 100000, 1000000];

/** The fields a history entry compares, in the order they are read. */
const AUDITED_FIELDS: Array<[string, string]> = [
  ["feeType", "Fee model"],
  ["flatAmount", "Flat amount"],
  ["percentageRate", "Percentage rate"],
  ["minFee", "Minimum fee"],
  ["maxFee", "Maximum fee"],
  ["isActive", "Status"],
];

function auditValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "percentageRate") return `${toPercent(String(value))}%`;
  if (field === "isActive") return value ? "Live" : "Paused";
  return String(value);
}

export default function FeesPage() {
  const [data, setData] = useState<Response | null>(null);
  const [editing, setEditing] = useState<Form | null>(null);
  /** Set when editing an existing rule: its key may not be changed. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(
    () =>
      apiFetch<Response>("/admin/fees")
        .then((response) => {
          setData(response.data);
          setError("");
        })
        .catch((cause: Error) => setError(cause.message)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const types = data?.chargeableTypes?.length ? data.chargeableTypes : FALLBACK_TYPES;
  const rules = useMemo(() => data?.items ?? [], [data]);

  /** Chargeable types with no rule at all: those transactions are free today. */
  const uncovered = useMemo(
    () => types.filter((type) => !rules.some((rule) => rule.transactionType === type)),
    [types, rules],
  );

  function openNew() {
    setEditingId(null);
    setEditing({ ...BLANK, transactionType: uncovered[0] ?? types[0] ?? "TRANSFER" });
  }

  function openEdit(rule: Rule) {
    setEditingId(rule.id);
    setEditing({
      transactionType: rule.transactionType,
      currencyCode: rule.currencyCode,
      feeType: rule.feeType,
      flatAmount: rule.flatAmount,
      percent: toPercent(rule.percentageRate),
      minFee: rule.minFee,
      maxFee: rule.maxFee ?? "",
      isActive: rule.isActive,
      reason: "",
    });
  }

  async function submit() {
    if (!editing || editing.reason.trim().length < 5) return;
    setBusy(true);
    try {
      await apiFetch("/admin/fees", {
        method: "POST",
        body: JSON.stringify({
          transactionType: editing.transactionType,
          currencyCode: editing.currencyCode.toUpperCase(),
          feeType: editing.feeType,
          flatAmount: editing.flatAmount || "0",
          percentageRate: toRate(editing.percent),
          minFee: editing.minFee || "0",
          maxFee: editing.maxFee === "" ? undefined : editing.maxFee,
          isActive: editing.isActive,
          reason: editing.reason.trim(),
        }),
      });
      setToast("Fee rule saved. It applies to new transactions from now.");
      setEditing(null);
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Fee update failed");
    } finally {
      setBusy(false);
    }
  }

  async function togglePaused(rule: Rule) {
    setBusy(true);
    try {
      await apiFetch("/admin/fees", {
        method: "POST",
        body: JSON.stringify({
          transactionType: rule.transactionType,
          currencyCode: rule.currencyCode,
          feeType: rule.feeType,
          flatAmount: rule.flatAmount,
          percentageRate: rule.percentageRate,
          minFee: rule.minFee,
          maxFee: rule.maxFee ?? undefined,
          isActive: !rule.isActive,
          reason: rule.isActive
            ? `${pretty(rule.transactionType)} fee paused from the admin console`
            : `${pretty(rule.transactionType)} fee resumed from the admin console`,
        }),
      });
      setToast(
        rule.isActive
          ? `${pretty(rule.transactionType)} is now free — no fee is charged.`
          : `${pretty(rule.transactionType)} fee is live again.`,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the rule status");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-950">Pricing &amp; fees</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            What Rendi charges on each transaction type. A saved change is live immediately for new
            transactions, reason-gated, and recorded against you in the audit trail.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setHistory(true)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700"
          >
            Change history
          </button>
          <button
            onClick={openNew}
            className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white"
          >
            New fee rule
          </button>
        </div>
      </header>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-bold">Transaction</th>
                <th className="px-4 py-3 font-bold">Model</th>
                <th className="px-4 py-3 font-bold">What it charges</th>
                <th className="px-4 py-3 text-right font-bold">Fee on ₦10,000</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Last changed</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const preview = feeOn(10000, {
                  ...BLANK,
                  feeType: rule.feeType,
                  flatAmount: rule.flatAmount,
                  percent: toPercent(rule.percentageRate),
                  minFee: rule.minFee,
                  maxFee: rule.maxFee ?? "",
                });
                return (
                  <tr key={rule.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{pretty(rule.transactionType)}</p>
                      <p className="text-xs text-slate-500">{rule.currencyCode}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                      {pretty(rule.feeType)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{ruleText(rule)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      {rule.isActive ? formatCurrency(preview, rule.currencyCode) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-bold ${rule.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {rule.isActive ? "Live" : "Paused — free"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDate(rule.updatedAt, { timeStyle: undefined })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(rule)}
                        className="font-bold text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void togglePaused(rule)}
                        className="ml-3 font-bold text-slate-500 hover:underline disabled:opacity-40"
                      >
                        {rule.isActive ? "Pause" : "Resume"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rules.length && (
          <p className="p-10 text-center text-sm text-slate-500">
            No fee rules configured — every transaction is currently free.
          </p>
        )}
      </section>

      {uncovered.length > 0 && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>No rule on {uncovered.map(pretty).join(", ")}.</strong> A transaction type with no
          matching rule is charged nothing — that is a decision, so make it deliberately.
        </p>
      )}

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-black text-slate-950">How a fee is worked out</h2>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>
              <strong className="text-slate-900">1.</strong> The rule matching the transaction type
              and currency is found. No match means no fee.
            </li>
            <li>
              <strong className="text-slate-900">2.</strong> Flat charges the fixed amount;
              percentage charges a share of the amount; hybrid charges both added together.
            </li>
            <li>
              <strong className="text-slate-900">3.</strong> The minimum raises the result, then the
              cap lowers it. The cap wins when both apply.
            </li>
          </ol>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-black text-slate-950">What a change reaches</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            New transactions only. Existing ledger entries are never repriced, and a fee already
            charged is never refunded by editing the rule. Every save records the previous and new
            configuration, your reason and your name — pausing a rule is recorded the same way, and
            makes that transaction type free rather than zero-rated.
          </p>
        </article>
      </section>

      {editing && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {editingId ? `Edit ${pretty(editing.transactionType)} fee` : "New fee rule"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Saved changes are live for new transactions immediately.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditing(null);
                  setEditingId(null);
                }}
                aria-label="Close"
                className="text-2xl leading-none text-slate-400"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Transaction type
                {/* The rule is keyed on type + currency, so changing either on
                    an existing rule would silently write a different row. */}
                {editingId ? (
                  <p className="mt-1 flex h-10 items-center rounded-xl bg-slate-100 px-3 text-sm font-semibold normal-case tracking-normal text-slate-700">
                    {pretty(editing.transactionType)}
                  </p>
                ) : (
                  <AdminSelect
                    value={editing.transactionType}
                    onChange={(event) =>
                      setEditing({ ...editing, transactionType: event.target.value })
                    }
                    containerClassName="mt-1 w-full"
                  >
                    {types.map((type) => (
                      <option key={type} value={type}>
                        {pretty(type)}
                      </option>
                    ))}
                  </AdminSelect>
                )}
              </label>

              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Currency
                {editingId ? (
                  <p className="mt-1 flex h-10 items-center rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-700">
                    {editing.currencyCode}
                  </p>
                ) : (
                  <input
                    value={editing.currencyCode}
                    onChange={(event) =>
                      setEditing({ ...editing, currencyCode: event.target.value.toUpperCase() })
                    }
                    maxLength={3}
                    className={field}
                  />
                )}
              </label>

              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:col-span-2">
                Fee model
                <AdminSelect
                  value={editing.feeType}
                  onChange={(event) =>
                    setEditing({ ...editing, feeType: event.target.value as Rule["feeType"] })
                  }
                  containerClassName="mt-1 w-full"
                >
                  <option value="FLAT">Flat — a fixed amount per transaction</option>
                  <option value="PERCENTAGE">Percentage — a share of the amount</option>
                  <option value="HYBRID">Hybrid — a fixed amount plus a share</option>
                </AdminSelect>
              </label>

              {editing.feeType !== "PERCENTAGE" && (
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Flat amount ({editing.currencyCode})
                  <input
                    type="number"
                    min="0"
                    value={editing.flatAmount}
                    onChange={(event) => setEditing({ ...editing, flatAmount: event.target.value })}
                    className={field}
                  />
                </label>
              )}

              {editing.feeType !== "FLAT" && (
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Percentage of the amount
                  <div className="relative mt-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={editing.percent}
                      onChange={(event) => setEditing({ ...editing, percent: event.target.value })}
                      className={`${field} mt-0 pr-8`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-bold text-slate-400">
                      %
                    </span>
                  </div>
                  <span className="mt-1 block font-semibold normal-case tracking-normal text-slate-400">
                    Stored as {toRate(editing.percent)}
                  </span>
                </label>
              )}

              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Minimum fee ({editing.currencyCode})
                <input
                  type="number"
                  min="0"
                  value={editing.minFee}
                  onChange={(event) => setEditing({ ...editing, minFee: event.target.value })}
                  className={field}
                />
              </label>

              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Maximum fee ({editing.currencyCode})
                <input
                  type="number"
                  min="0"
                  placeholder="No cap"
                  value={editing.maxFee}
                  onChange={(event) => setEditing({ ...editing, maxFee: event.target.value })}
                  className={field}
                />
              </label>
            </div>

            {/* The question an operator is actually asking: what will a
                customer be charged? Computed the way the engine computes it. */}
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                What this charges
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PREVIEW_AMOUNTS.map((amount) => (
                  <div key={amount}>
                    <p className="text-[11px] text-slate-500">
                      on {formatCurrency(amount, editing.currencyCode, { compact: true })}
                    </p>
                    <p className="text-sm font-black text-slate-900">
                      {formatCurrency(feeOn(amount, editing), editing.currencyCode)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5">
              <input
                type="checkbox"
                checked={editing.isActive}
                onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })}
                className="mt-0.5 h-4 w-4 accent-blue-600"
              />
              <span>
                <span className="block text-[13px] font-semibold text-slate-800">
                  Charge this fee
                </span>
                <span className="block text-[11px] text-slate-500">
                  Unticked, the rule is kept but nothing is charged on this transaction type.
                </span>
              </span>
            </label>

            <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Reason for the change
              <textarea
                rows={3}
                value={editing.reason}
                onChange={(event) => setEditing({ ...editing, reason: event.target.value })}
                placeholder="Recorded in the audit trail against your name"
                className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-blue-500"
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditing(null);
                  setEditingId(null);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={busy || editing.reason.trim().length < 5}
                onClick={() => void submit()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save fee rule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {history && (
        <div className="fixed inset-0 z-[80] bg-slate-950/50" onClick={() => setHistory(false)}>
          <aside
            onClick={(event) => event.stopPropagation()}
            className="ml-auto h-full w-full max-w-lg overflow-y-auto bg-white p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">Fee change history</h2>
                <p className="mt-1 text-xs text-slate-500">
                  The last 30 changes, newest first, with what each one moved.
                </p>
              </div>
              <button
                onClick={() => setHistory(false)}
                aria-label="Close"
                className="text-2xl leading-none text-slate-400"
              >
                ×
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {(data?.history ?? []).map((log) => {
                const after = (log.newValues ?? {}) as Record<string, unknown>;
                const before = log.oldValues as Record<string, unknown> | null;
                const changes = AUDITED_FIELDS.filter(
                  ([key]) => before && String(before[key] ?? "") !== String(after[key] ?? ""),
                );
                return (
                  <div key={log.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">
                        {after.transactionType ? pretty(String(after.transactionType)) : pretty(log.action)}
                        {after.currencyCode ? ` · ${after.currencyCode}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(log.createdAt)}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">by {log.actorName ?? "Unknown"}</p>
                    {changes.length > 0 ? (
                      <ul className="mt-3 space-y-1">
                        {changes.map(([key, label]) => (
                          <li key={key} className="text-xs text-slate-600">
                            {label}:{" "}
                            <span className="font-semibold text-slate-500 line-through">
                              {auditValue(key, before?.[key])}
                            </span>{" "}
                            → <span className="font-bold text-slate-900">{auditValue(key, after[key])}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">
                        {before
                          ? "Saved with no change to the charged amounts."
                          : "No previous configuration was recorded against this change."}
                      </p>
                    )}
                    {typeof after.reason === "string" && (
                      <p className="mt-3 border-t border-slate-100 pt-2 text-xs italic text-slate-600">
                        “{after.reason}”
                      </p>
                    )}
                  </div>
                );
              })}
              {!data?.history.length && (
                <p className="text-sm text-slate-500">No fee changes recorded yet.</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[90] rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-xl">
          ✓ {toast}
        </div>
      )}
    </main>
  );
}

const field =
  "mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-blue-500";
