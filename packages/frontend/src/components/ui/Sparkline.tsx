import { cn } from '@/lib/utils';

export interface SparklineSeries {
  /** Values in chronological order. */
  values: number[];
  /** Stroke color (any CSS color). Defaults to the primary accent. */
  color?: string;
  /** Fill the area under the line with a faded version of the color. */
  area?: boolean;
  label?: string;
}

export interface SparklineProps {
  series: SparklineSeries[];
  /** Optional explicit max for the y-axis (else derived from the data). */
  max?: number;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Sparkline - a dependency-free inline-SVG line/area chart.
 *
 * Deliberately tiny: we don't pull in a charting library for a single seat-usage
 * trend. Multiple series are overlaid on a shared, normalized y-axis.
 */
export function Sparkline({
  series,
  max,
  width = 600,
  height = 160,
  className,
}: SparklineProps) {
  const padding = 6;
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;

  const allValues = series.flatMap((s) => s.values);
  const derivedMax = Math.max(1, max ?? Math.max(0, ...allValues));
  const longest = Math.max(1, ...series.map((s) => s.values.length));

  const xFor = (i: number, n: number) =>
    padding + (n <= 1 ? usableW / 2 : (i / (n - 1)) * usableW);
  const yFor = (v: number) => padding + usableH - (v / derivedMax) * usableH;

  const toPath = (values: number[]) => {
    if (values.length === 0) return '';
    return values
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i, values.length).toFixed(1)} ${yFor(v).toFixed(1)}`)
      .join(' ');
  };

  const toAreaPath = (values: number[]) => {
    if (values.length === 0) return '';
    const line = toPath(values);
    const lastX = xFor(values.length - 1, values.length).toFixed(1);
    const firstX = xFor(0, values.length).toFixed(1);
    const baseY = (padding + usableH).toFixed(1);
    return `${line} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      role="img"
      aria-label="Seat usage trend"
    >
      {/* faint horizontal gridlines at 0/50/100% */}
      {[0, 0.5, 1].map((t) => {
        const y = padding + usableH - t * usableH;
        return (
          <line
            key={t}
            x1={padding}
            x2={width - padding}
            y1={y}
            y2={y}
            stroke="currentColor"
            className="text-white/10"
            strokeWidth={1}
          />
        );
      })}

      {series.map((s, idx) => {
        const color = s.color || 'rgb(147, 51, 234)';
        return (
          <g key={idx}>
            {s.area && (
              <path d={toAreaPath(s.values)} fill={color} opacity={0.12} stroke="none" />
            )}
            <path
              d={toPath(s.values)}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {/* invisible spacer so single-point series still lay out */}
      <line x1={xFor(longest - 1, longest)} x2={xFor(longest - 1, longest)} y1={0} y2={0} stroke="none" />
    </svg>
  );
}
