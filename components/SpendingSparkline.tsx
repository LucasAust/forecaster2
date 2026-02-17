"use client";

interface SparklineProps {
    /** Array of numeric values representing the trend (e.g., monthly spend for the last 3-4 months) */
    data: number[];
    /** Width of the sparkline SVG */
    width?: number;
    /** Height of the sparkline SVG */
    height?: number;
    /** Line color — defaults based on trend direction */
    color?: string;
    /** Show the trend direction arrow */
    showTrend?: boolean;
}

export function SpendingSparkline({
    data,
    width = 64,
    height = 24,
    color,
    showTrend = true,
}: SparklineProps) {
    if (!data || data.length < 2) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 2;

    // Calculate points
    const points = data.map((val, i) => {
        const x = padding + (i / (data.length - 1)) * (width - padding * 2);
        const y = padding + (1 - (val - min) / range) * (height - padding * 2);
        return { x, y };
    });

    // Build SVG path
    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

    // Determine trend
    const first = data[0];
    const last = data[data.length - 1];
    const pctChange = first > 0 ? ((last - first) / first) * 100 : 0;
    const trendUp = last > first * 1.05; // >5% increase
    const trendDown = last < first * 0.95; // >5% decrease
    const stable = !trendUp && !trendDown;

    // Auto color based on trend (for expenses: up = bad = red, down = good = green)
    const lineColor = color || (trendUp ? "#f87171" : trendDown ? "#34d399" : "#a1a1aa");

    // Fill gradient
    const fillPoints = [...points, { x: points[points.length - 1].x, y: height }, { x: points[0].x, y: height }];
    const fillD = fillPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

    const gradientId = `spark-grad-${data.join("-").replace(/\./g, "_")}`;

    return (
        <span className="inline-flex items-center gap-1">
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0">
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                {/* Fill area */}
                <path d={fillD} fill={`url(#${gradientId})`} />
                {/* Line */}
                <path d={pathD} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                {/* End dot */}
                <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2} fill={lineColor} />
            </svg>
            {showTrend && !stable && (
                <span className={`text-[9px] font-medium ${trendUp ? "text-rose-400" : "text-emerald-400"}`}>
                    {trendUp ? "↑" : "↓"}{Math.abs(pctChange).toFixed(0)}%
                </span>
            )}
            {showTrend && stable && (
                <span className="text-[9px] text-zinc-500">—</span>
            )}
        </span>
    );
}
