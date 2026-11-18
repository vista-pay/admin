export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(
  amount: string | number,
  currency = "NGN",
  opts: { compact?: boolean } = {}
) {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(num)) return `${currency} 0.00`;
  const fmt = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: 2,
  });
  try {
    return fmt.format(num);
  } catch {
    return `${currency} ${num.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  }
}

export function formatDate(date: string | Date, opts: Intl.DateTimeFormatOptions = {}) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    ...opts,
  }).format(d);
}

export function truncate(str: string, len = 20) {
  if (str.length <= len) return str;
  return str.slice(0, len) + "…";
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

/**
 * Whole days between today and the given date, counted on the calendar.
 *
 * Counting raw elapsed milliseconds and rounding up turns any fraction of a
 * day into a whole one, so a period ending tomorrow reads "2 days left" and a
 * 30-day period can claim 32 days remaining. Both numbers come off the same
 * calendar as the date printed beside them. Today is 0, tomorrow is 1.
 */
export function daysUntil(iso: string) {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return 0;
  // Pinned to the communities' own calendar rather than the console's, so a
  // date and the count beside it agree wherever the page is rendered.
  const civil = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const asUtcMidnight = (d: Date) => Date.parse(`${civil.format(d)}T00:00:00Z`);
  return Math.round((asUtcMidnight(target) - asUtcMidnight(new Date())) / 86_400_000);
}
