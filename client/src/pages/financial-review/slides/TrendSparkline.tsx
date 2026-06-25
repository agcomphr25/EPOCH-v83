export interface TrendPoint {
  month: string;
  label: string;
  value: number | null;
}

interface TrendSparklineProps {
  data: TrendPoint[];
  color?: string;
  valueFormatter?: (value: number) => string;
  emptyLabel?: string;
}

export default function TrendSparkline({
  data,
  color = '#2563eb',
  valueFormatter = (value) => String(value),
  emptyLabel = 'Trend unavailable',
}: TrendSparklineProps) {
  const points = data.filter((point) => typeof point.value === 'number');

  if (points.length < 2) {
    return (
      <div className="flex h-full min-h-[260px] items-center justify-center rounded-lg bg-gray-50 text-gray-400 dark:bg-gray-900/50">
        {emptyLabel}
      </div>
    );
  }

  const values = points.map((point) => point.value as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? 500 : (index / (points.length - 1)) * 1000;
    const y = 260 - (((point.value as number) - min) / spread) * 220;
    return { x, y, point };
  });
  const polyline = coordinates.map(({ x, y }) => `${x},${y}`).join(' ');

  return (
    <div className="flex h-full min-h-[300px] flex-col rounded-lg bg-gray-50 px-6 py-5 dark:bg-gray-900/50">
      <svg viewBox="0 0 1000 300" className="min-h-[230px] flex-1 overflow-visible" role="img">
        <line x1="0" y1="260" x2="1000" y2="260" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth="3" />
        <polyline
          fill="none"
          points={polyline}
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="12"
        />
        {coordinates.map(({ x, y, point }) => (
          <g key={point.month}>
            <circle cx={x} cy={y} r="14" fill={color} />
            <circle cx={x} cy={y} r="7" fill="white" />
          </g>
        ))}
      </svg>
      <div className="grid grid-cols-6 gap-2 text-center">
        {data.map((point) => (
          <div key={point.month} className="min-w-0">
            <div className="truncate text-xs text-gray-400">{point.label}</div>
            <div className="truncate text-sm font-semibold text-gray-700 dark:text-gray-200">
              {typeof point.value === 'number' ? valueFormatter(point.value) : '-'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
