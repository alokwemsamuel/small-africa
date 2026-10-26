import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { niceTicks } from './scale';

export interface Datum {
  key: string;
  /** Axis label (short), e.g. "Mon 20". */
  label: string;
  /** Tooltip / table label (long), e.g. "Tuesday 20 October". */
  fullLabel: string;
  value: number;
  display: string;
}

/**
 * Single-series column chart (SVG). One colour (the validated chart token), no legend: the
 * title names the series. Bars ≤ 24px with a 4px rounded top and square base, hairline grid,
 * a tooltip on hover and keyboard focus (arrow keys move between days), and a table view.
 */
export function ColumnChart({
  title,
  data,
  tickFormat,
  integer = false,
  height = 220,
}: {
  title: string;
  data: Datum[];
  tickFormat: (v: number) => string;
  /** Whole-number ticks (counts). */
  integer?: boolean;
  height?: number;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = useMemo(() => niceTicks(max, 4, integer), [max, integer]);
  // Draw at the real rendered width, so labels are true 12px text rather than scaled down.
  const box = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => e && setMeasured(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const top = ticks[ticks.length - 1] || 1;

  const W = measured;
  const H = height;
  const pad = { l: 48, r: 8, t: 12, b: 28 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(4, band - 2)); // ≥ 2px surface gap between neighbours
  const y = (v: number) => pad.t + plotH - (v / top) * plotH;
  const labelEvery = Math.ceil(data.length / Math.max(3, Math.floor(plotW / 64)));
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);

  const summary = data.length
    ? `${title}. Highest: ${data[peak]!.fullLabel}, ${data[peak]!.display}. Latest: ${data[data.length - 1]!.fullLabel}, ${data[data.length - 1]!.display}.`
    : `${title}: no data.`;

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex items-center justify-between gap-3">
        <span className="font-sans text-sm font-semibold">{title}</span>
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="text-accent text-xs underline"
          aria-pressed={table}
        >
          {table ? 'Show chart' : 'Show table'}
        </button>
      </figcaption>
      {table ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className="text-muted py-1 text-left text-xs font-semibold uppercase">
                  Day
                </th>
                <th scope="col" className="text-muted py-1 text-right text-xs font-semibold uppercase">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-line border-t">
                  <td className="py-1.5">{d.fullLabel}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full touch-pan-y focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sa-focus)]"
            role="img"
            aria-label={summary}
            aria-describedby={`${id}-tip`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const d = e.key === 'ArrowRight' ? 1 : -1;
                setActive((a) =>
                  Math.min(data.length - 1, Math.max(0, (a ?? (d > 0 ? -1 : data.length)) + d)),
                );
              }
              if (e.key === 'Escape') setActive(null);
            }}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--sa-line)" strokeWidth={1} />
                <text
                  x={pad.l - 8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-[var(--sa-text-muted)] text-[12px] tabular-nums"
                >
                  {tickFormat(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = pad.l + band * i + band / 2;
              const h = Math.max(0, y(0) - y(d.value));
              const r = Math.min(4, h);
              const x = cx - barW / 2;
              const yTop = y(d.value);
              // Rounded data-end, square at the baseline.
              const path =
                h <= 0
                  ? ''
                  : `M${x},${y(0)} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${y(0)} Z`;
              return (
                <g key={d.key}>
                  {path && (
                    <path
                      d={path}
                      fill="var(--sa-chart)"
                      opacity={active === null || active === i ? 1 : 0.55}
                    />
                  )}
                  {i % labelEvery === 0 && (
                    <text
                      x={cx}
                      y={H - 8}
                      textAnchor="middle"
                      className="fill-[var(--sa-text-muted)] text-[12px]"
                    >
                      {d.label}
                    </text>
                  )}
                  {/* Hit target: the whole band, taller than the bar. */}
                  <rect
                    x={pad.l + band * i}
                    y={pad.t}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    onPointerMove={() => setActive(i)}
                  />
                </g>
              );
            })}
          </svg>
          <div
            id={`${id}-tip`}
            role="status"
            className={cn(
              'border-line bg-surface-raised pointer-events-none absolute top-0 rounded-sm border px-3 py-2 text-xs shadow-lg transition-opacity',
              active === null ? 'opacity-0' : 'opacity-100',
            )}
            style={{
              left:
                active === null
                  ? 0
                  : `clamp(0px, calc(${((pad.l + band * active + band / 2) / W) * 100}% - 4rem), calc(100% - 8rem))`,
            }}
          >
            {active !== null && data[active] && (
              <>
                <span className="block text-sm font-semibold tabular-nums">{data[active].display}</span>
                <span className="text-secondary">{data[active].fullLabel}</span>
              </>
            )}
          </div>
        </div>
      )}
    </figure>
  );
}

/** Ranked single-series bars as HTML (labels never clip: they sit beside the bar). */
export function BarList({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number; display: string; detail?: string }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <figure>
      <figcaption className="mb-3 font-sans text-sm font-semibold">{title}</figcaption>
      {items.length === 0 ? (
        <p className="text-secondary text-sm">No sales in this period yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.label} title={i.detail}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{i.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{i.display}</span>
              </div>
              <div className="mt-1 h-2 rounded-full" aria-hidden="true">
                <div
                  className="bg-chart h-2 rounded-r-[4px]"
                  style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}
