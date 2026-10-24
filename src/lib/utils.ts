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
