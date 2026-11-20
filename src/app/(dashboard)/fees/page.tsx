"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AdminSelect } from "@/components/ui/admin-select";
import { formatCurrency, formatDate } from "@/lib/utils";

type Audience = "EVERYONE" | "MERCHANT";

type Rule = {
  id: string;
  transactionType: string;
  currencyCode: string;
  /** Who the rate is for. A merchant takes MERCHANT where one exists. */
  audience: Audience;
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
  audience: Audience;
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
  audience: "EVERYONE",
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

/**
 * Hidden from this screen: the products are not ones the business is pricing
 * today, so their rows were noise an operator had to read past every visit.
 *
 * This is a console-only filter. Any rule stored against these types is still
 * live in the engine and still charged — delete an entry here to bring the
 * type back into the table, the history and the "New fee rule" list.
 */
const HIDDEN_TYPES = ["FX_CONVERSION", "INTERNATIONAL_TRANSFER"];

/**
 * Who each rate is for, in the operator's words rather than the enum's.
 *
 * EVERYONE is the floor: a payer with no more specific rate pays it. MERCHANT
 * covers business and community wallets — the same two the platform calls a
 * merchant account — and wins for them wherever it exists.
 */
const AUDIENCE_LABEL: Record<Audience, string> = {
  EVERYONE: "Everyone",
  MERCHANT: "Merchants",
};

const AUDIENCE_HINT: Record<Audience, string> = {
  EVERYONE: "Anyone without a more specific rate",
  MERCHANT: "Business and community accounts",
};

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

/** The ₦10,000 column and the mobile card both want this. */
const previewOf = (rule: Rule) =>
  feeOn(10000, {
    ...BLANK,
    feeType: rule.feeType,
    flatAmount: rule.flatAmount,
    percent: toPercent(rule.percentageRate),
    minFee: rule.minFee,
    maxFee: rule.maxFee ?? "",
  });

const PREVIEW_AMOUNTS = [1000, 10000, 100000, 1000000];

/** The fields a history entry compares, in the order they are read. */
const AUDITED_FIELDS: Array<[string, string]> = [
  ["audience", "Applies to"],
  ["feeType", "Fee model"],
  ["flatAmount", "Flat amount"],
  ["percentageRate", "Percentage rate"],
  ["minFee", "Minimum fee"],
  ["maxFee", "Maximum fee"],
  ["isActive", "Status"],
];

function auditValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "audience") return AUDIENCE_LABEL[value as Audience] ?? String(value);
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

  const types = useMemo(() => {
    const all = data?.chargeableTypes?.length ? data.chargeableTypes : FALLBACK_TYPES;
    return all.filter((type) => !HIDDEN_TYPES.includes(type));
  }, [data]);

  const rules = useMemo(
    () => (data?.items ?? []).filter((rule) => !HIDDEN_TYPES.includes(rule.transactionType)),
    [data],
  );

  /** Chargeable types with no rule at all: those transactions are free today. */
  const uncovered = useMemo(
    () =>
      types.filter(
        (type) =>
          !rules.some((rule) => rule.transactionType === type && rule.audience === "EVERYONE"),
      ),
    [types, rules],
  );

  const liveCount = rules.filter((rule) => rule.isActive).length;

  const historyRows = useMemo(
    () =>
      (data?.history ?? []).filter((log) => {
        const type = (log.newValues as Record<string, unknown> | null)?.transactionType;
        return typeof type === "string" ? !HIDDEN_TYPES.includes(type) : true;
      }),
    [data],
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
      audience: rule.audience,
      feeType: rule.feeType,
      flatAmount: rule.flatAmount,
      percent: toPercent(rule.percentageRate),
      minFee: rule.minFee,
      maxFee: rule.maxFee ?? "",
      isActive: rule.isActive,
      reason: "",
    });
  }

  function closeEditor() {
    setEditing(null);
    setEditingId(null);
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
          audience: editing.audience,
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
      closeEditor();
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
          audience: rule.audience,
          feeType: rule.feeType,
          flatAmount: rule.flatAmount,
          percentageRate: rule.percentageRate,
          minFee: rule.minFee,
          maxFee: rule.maxFee ?? undefined,
          isActive: !rule.isActive,
          reason: rule.isActive
            ? `${pretty(rule.transactionType)} ${AUDIENCE_LABEL[rule.audience].toLowerCase()} fee paused from the admin console`
            : `${pretty(rule.transactionType)} ${AUDIENCE_LABEL[rule.audience].toLowerCase()} fee resumed from the admin console`,
        }),
      });
      setToast(
        rule.isActive
          ? `${pretty(rule.transactionType)} is now free for ${AUDIENCE_LABEL[rule.audience].toLowerCase()}.`
          : `${pretty(rule.transactionType)} fee is live again for ${AUDIENCE_LABEL[rule.audience].toLowerCase()}.`,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the rule status");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-950 sm:text-2xl">Pricing &amp; fees</h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
            What Rendi charges on each transaction type. A saved change is live immediately for new
            transactions, reason-gated, and recorded against you in the audit trail.
          </p>
          {rules.length > 0 && (
            <p className="mt-2 text-xs font-semibold text-slate-500">
              {rules.length} rule{rules.length === 1 ? "" : "s"} · {liveCount} live ·{" "}
              {rules.length - liveCount} paused
            </p>
          )}
        </div>
        {/* Full-width and stacked on a phone, inline from `sm` up. */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            onClick={() => setHistory(true)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Change history
          </button>
          <button
            onClick={openNew}
            className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
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

      {/* Two presentations of the same rules: a table where there is room for
          one, and a stack of cards where there is not. Neither scrolls
          sideways — a fee you have to drag into view is a fee nobody checks. */}
      <section className="mt-5 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-bold">Transaction</th>
              <th className="px-4 py-3 font-bold">Applies to</th>
              <th className="px-4 py-3 font-bold">Model</th>
              <th className="px-4 py-3 font-bold">What it charges</th>
              <th className="px-4 py-3 text-right font-bold">Fee on ₦10,000</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="hidden px-4 py-3 font-bold xl:table-cell">Last changed</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-900">{pretty(rule.transactionType)}</p>
                  <p className="text-xs text-slate-500">{rule.currencyCode}</p>
                </td>
                <td className="px-4 py-3">
                  <AudiencePill audience={rule.audience} />
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                  {pretty(rule.feeType)}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-800">{ruleText(rule)}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                  {rule.isActive ? formatCurrency(previewOf(rule), rule.currencyCode) : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusPill active={rule.isActive} />
                </td>
                <td className="hidden px-4 py-3 text-xs text-slate-500 xl:table-cell">
                  {formatDate(rule.updatedAt, { timeStyle: undefined })}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
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
            ))}
          </tbody>
        </table>
        {!rules.length && (
          <p className="p-10 text-center text-sm text-slate-500">
            No fee rules configured — every transaction is currently free.
          </p>
        )}
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:hidden">
        {rules.map((rule) => (
          <article
            key={rule.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-bold text-slate-900">
                  {pretty(rule.transactionType)}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {rule.currencyCode} · {pretty(rule.feeType)}
                </p>
              </div>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatusPill active={rule.isActive} />
                <AudiencePill audience={rule.audience} />
              </span>
            </div>

            <p className="mt-3 font-semibold text-slate-800">{ruleText(rule)}</p>

            <div className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-500">Fee on ₦10,000</span>
              <span className="font-bold tabular-nums text-slate-900">
                {rule.isActive ? formatCurrency(previewOf(rule), rule.currencyCode) : "—"}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">
                {formatDate(rule.updatedAt, { timeStyle: undefined })}
              </span>
              <span className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => void togglePaused(rule)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40"
                >
                  {rule.isActive ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={() => openEdit(rule)}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
                >
                  Edit
                </button>
              </span>
            </div>
          </article>
        ))}
        {!rules.length && (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 sm:col-span-2">
            No fee rules configured — every transaction is currently free.
          </p>
        )}
      </section>

      {uncovered.length > 0 && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
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
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-black text-slate-950">
                  {editingId
                    ? `Edit ${pretty(editing.transactionType)} fee · ${AUDIENCE_LABEL[editing.audience]}`
                    : "New fee rule"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Saved changes are live for new transactions immediately.
                </p>
              </div>
              <button
                onClick={closeEditor}
                aria-label="Close"
                className="shrink-0 text-2xl leading-none text-slate-400"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Transaction type
                {/* The rule is keyed on type + currency + audience, so changing
                    any of the three on an existing rule would silently write a
                    different row and leave this one as it was. */}
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
                Applies to
                {editingId ? (
                  <p className="mt-1 flex h-10 items-center rounded-xl bg-slate-100 px-3 text-sm font-semibold normal-case tracking-normal text-slate-700">
                    {AUDIENCE_LABEL[editing.audience]}
                  </p>
                ) : (
                  <AdminSelect
                    value={editing.audience}
                    onChange={(event) =>
                      setEditing({ ...editing, audience: event.target.value as Audience })
                    }
                    containerClassName="mt-1 w-full"
                  >
                    <option value="EVERYONE">Everyone — anyone without a more specific rate</option>
                    <option value="MERCHANT">Merchants — business and community accounts</option>
                  </AdminSelect>
                )}
                <span className="mt-1 block font-semibold normal-case tracking-normal text-slate-400">
                  {editing.audience === "MERCHANT"
                    ? "Merchants take this instead of the Everyone rate. Pause it to make this transaction type free for them alone."
                    : "The rate a payer falls back to when no merchant rate is set."}
                </span>
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
                    inputMode="decimal"
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
                      inputMode="decimal"
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
                  inputMode="decimal"
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
                  inputMode="decimal"
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
                    <p className="text-sm font-black tabular-nums text-slate-900">
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
                <span className="block text-[11px] leading-4 text-slate-500">
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

            <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button
                onClick={closeEditor}
                className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={busy || editing.reason.trim().length < 5}
                onClick={() => void submit()}
                className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40"
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
            className="ml-auto flex h-full w-full max-w-lg flex-col bg-white"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-5 sm:p-6">
              <div>
                <h2 className="text-lg font-black text-slate-950 sm:text-xl">Fee change history</h2>
                <p className="mt-1 text-xs text-slate-500">
                  The last 30 changes, newest first, with what each one moved.
                </p>
              </div>
              <button
                onClick={() => setHistory(false)}
                aria-label="Close"
                className="shrink-0 text-2xl leading-none text-slate-400"
              >
                ×
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5 sm:p-6">
              {historyRows.map((log) => {
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
                          <li key={key} className="text-xs leading-5 text-slate-600">
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
                      <p className="mt-3 border-t border-slate-100 pt-2 text-xs italic leading-5 text-slate-600">
                        “{after.reason}”
                      </p>
                    )}
                  </div>
                );
              })}
              {!historyRows.length && (
                <p className="text-sm text-slate-500">No fee changes recorded yet.</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-5 z-[90] rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-xl sm:inset-x-auto sm:right-5">
          ✓ {toast}
        </div>
      )}
    </main>
  );
}

/**
 * Marks which payers a row is for. Only drawn with colour for MERCHANT: the
 * ordinary rate is the default case and badging every row the same shade
 * would make the one exception harder to spot, not easier.
 */
function AudiencePill({ audience }: { audience: Audience }) {
  return (
    <span
      title={AUDIENCE_HINT[audience]}
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-bold ${
        audience === "MERCHANT" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {AUDIENCE_LABEL[audience]}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
    >
      {active ? "Live" : "Paused — free"}
    </span>
  );
}

const field =
  "mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-blue-500";
