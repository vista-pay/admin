"use client";

/**
 * A gradient area trend in the style of the community portal's "How money
 * flows" chart (community/src/components/charts/Charts.tsx), hand-rolled
 * because the admin console deliberately carries no chart dependency.
 *
 * Matches the same visual grammar: smooth monotone curves with a soft
 * gradient under each series, horizontal-only gridlines, compact ₦ axis
 * labels, a hover tooltip naming every series at the nearest day, and a dot
 * legend. The curve is Fritsch–Carlson monotone rather than Catmull-Rom so a
 * run of zero-days renders flat instead of dipping below zero.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type TrendSeries = { key: string; name: string; color: string };

type Datum = Record<string, unknown>;

const compact = new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

const dateLabel = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
};

/** Round up to 1/2/2.5/5 × 10ⁿ so the top gridline lands on a readable number. */
function niceCeil(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const unit = value / power;
  const step = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return step * power;
}

/** Fritsch–Carlson tangents: smooth, but never overshooting the data. */
function monotonePath(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n === 0) return "";
  if (n === 1) return `M${xs[0]},${ys[0]}`;
  const dx = Array.from({ length: n - 1 }, (_, i) => xs[i + 1] - xs[i]);
  const slope = Array.from({ length: n - 1 }, (_, i) => (ys[i + 1] - ys[i]) / dx[i]);
  const m = new Array<number>(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    if (slope[i - 1] * slope[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }
  let d = `M${xs[0]},${ys[0]}`;
  for (let i = 0; i < n - 1; i += 1) {
    const third = dx[i] / 3;
    d += `C${xs[i] + third},${ys[i] + m[i] * third} ${xs[i + 1] - third},${ys[i + 1] - m[i + 1] * third} ${xs[i + 1]},${ys[i + 1]}`;
  }
  return d;
}

export function AreaTrend({
  data,
  x,
  series,
  height = 260,
}: {
  data: Datum[];
  x: string;
  series: TrendSeries[];
  height?: number;
}) {
  const gradientId = useId().replaceAll(":", "");
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pad = { top: 10, right: 10, bottom: 22, left: 54 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = Math.max(0, height - pad.top - pad.bottom);

  const { max, ticks } = useMemo(() => {
    const peak = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
    const top = niceCeil(peak);
    return { max: top, ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => top * f) };
  }, [data, series]);

  const px = (i: number) => pad.left + (data.length < 2 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const py = (v: number) => pad.top + innerH - (v / max) * innerH;

  const paths = useMemo(
    () =>
      series.map((s) => {
        const xs = data.map((_, i) => px(i));
        const ys = data.map((d) => py(Number(d[s.key]) || 0));
        const line = monotonePath(xs, ys);
        const area =
          data.length > 1
            ? `${line}L${xs[xs.length - 1]},${pad.top + innerH}L${xs[0]},${pad.top + innerH}Z`
            : "";
        return { ...s, line, area };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, series, width, max, innerH, innerW],
  );

  // Roughly five date labels, always including the first and last day.
  const labelEvery = Math.max(1, Math.ceil(data.length / 5));
  const xLabels = data
    .map((d, i) => ({ i, label: dateLabel(String(d[x])) }))
    .filter(({ i }) => i % labelEvery === 0 || i === data.length - 1);

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    if (!data.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rel = event.clientX - rect.left - pad.left;
    const idx = Math.round((rel / Math.max(1, innerW)) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, idx)));
  }

  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-slate-500">No movement in this window.</p>;
  }

  const active = hover === null ? null : data[hover];
  // The tooltip flips sides past the midpoint so it never leaves the card.
  const tooltipLeft = hover === null ? 0 : px(hover);
  const flip = hover !== null && tooltipLeft > width / 2;

  return (
    <div ref={wrap} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`Daily trend of ${series.map((s) => s.name).join(" and ")}`}
        >
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={py(t)} y2={py(t)} stroke="#EEF2F7" />
              <text x={pad.left - 8} y={py(t) + 3.5} textAnchor="end" fontSize={11} fill="#64748B">
                ₦{compact.format(t)}
              </text>
            </g>
          ))}

          {paths.map((s) => (
            <g key={s.key}>
              {s.area && <path d={s.area} fill={`url(#${gradientId}-${s.key})`} />}
              <path d={s.line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            </g>
          ))}

          {hover !== null && (
            <g>
              <line x1={px(hover)} x2={px(hover)} y1={pad.top} y2={pad.top + innerH} stroke="#CBD5E1" strokeDasharray="3 3" />
              {series.map((s) => (
                <circle key={s.key} cx={px(hover)} cy={py(Number(data[hover][s.key]) || 0)} r={4} fill={s.color} stroke="#fff" strokeWidth={1.5} />
              ))}
            </g>
          )}

          {xLabels.map(({ i, label }) => (
            <text key={i} x={px(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize={11} fill="#64748B">
              {label}
            </text>
          ))}
        </svg>
      )}

      {active && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ top: 8, left: flip ? undefined : tooltipLeft + 12, right: flip ? width - tooltipLeft + 12 : undefined }}
        >
          <p className="mb-1 font-semibold text-slate-900">{dateLabel(String(active[x]))}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center gap-2 text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.name}:{" "}
              <span className="font-semibold text-slate-900">{full.format(Number(active[s.key]) || 0)}</span>
            </p>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
