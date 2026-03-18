"use client";

import type { ConfidenceBand } from "@/types";

function formatCurrency(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1000) {
        return `$${(n / 1000).toFixed(1)}k`;
    }
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function monthLabel(ym: string): string {
    const [year, month] = ym.split("-");
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function RangeBar({
    p10,
    p50,
    p90,
    color,
}: {
    p10: number;
    p50: number;
    p90: number;
    color: "emerald" | "red" | "amber";
}) {
    const max = Math.max(Math.abs(p10), Math.abs(p50), Math.abs(p90), 1);
    const left = (Math.abs(p10) / max) * 100;
    const mid = (Math.abs(p50) / max) * 100;
    const right = (Math.abs(p90) / max) * 100;

    const bgMap = {
        emerald: "bg-emerald-500/20",
        red: "bg-red-500/20",
        amber: "bg-amber-500/20",
    };
    const fillMap = {
        emerald: "bg-emerald-500",
        red: "bg-red-500",
        amber: "bg-amber-500",
    };

    return (
        <div className="flex items-center gap-3">
            <span className="w-16 text-right text-xs text-zinc-500 tabular-nums">
                {formatCurrency(p10)}
            </span>
            <div className={`relative h-2 flex-1 rounded-full ${bgMap[color]}`}>
                <div
                    className={`absolute inset-y-0 left-0 rounded-full ${fillMap[color]} opacity-40`}
                    style={{ width: `${right}%` }}
                />
                <div
                    className={`absolute top-1/2 -translate-y-1/2 h-3 w-1 rounded-sm ${fillMap[color]}`}
                    style={{ left: `${mid}%` }}
                    title={`P50: ${formatCurrency(p50)}`}
                />
            </div>
            <span className="w-16 text-xs text-zinc-500 tabular-nums">
                {formatCurrency(p90)}
            </span>
        </div>
    );
}

function netColor(band: ConfidenceBand): "emerald" | "red" | "amber" {
    if (band.net.p10 > 0) return "emerald";
    if (band.net.p90 < 0) return "red";
    return "amber";
}

export function ConfidenceBands({ bands }: { bands: ConfidenceBand[] }) {
    if (!bands || bands.length === 0) return null;

    return (
        <div className="glass-card rounded-2xl p-6">
            <h2 className="mb-1 text-lg font-semibold text-white">
                Confidence Bands
            </h2>
            <p className="mb-5 text-sm text-zinc-500">
                Pessimistic (P10) → Expected (P50) → Optimistic (P90)
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {bands.map((band) => {
                    const nc = netColor(band);
                    const netBg =
                        nc === "emerald"
                            ? "bg-emerald-500/10 border-emerald-500/20"
                            : nc === "red"
                              ? "bg-red-500/10 border-red-500/20"
                              : "bg-amber-500/10 border-amber-500/20";
                    const netText =
                        nc === "emerald"
                            ? "text-emerald-400"
                            : nc === "red"
                              ? "text-red-400"
                              : "text-amber-400";

                    return (
                        <div
                            key={band.month}
                            className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4"
                        >
                            <h3 className="text-sm font-medium text-zinc-300">
                                {monthLabel(band.month)}
                            </h3>

                            {/* Income */}
                            <div>
                                <span className="text-xs font-medium text-emerald-400/70 uppercase tracking-wider">
                                    Income
                                </span>
                                <RangeBar
                                    p10={band.income.p10}
                                    p50={band.income.p50}
                                    p90={band.income.p90}
                                    color="emerald"
                                />
                                <p className="mt-1 text-center text-xs text-zinc-500">
                                    {formatCurrency(band.income.p10)} – <span className="text-zinc-300 font-medium">{formatCurrency(band.income.p50)}</span> – {formatCurrency(band.income.p90)}
                                </p>
                            </div>

                            {/* Expenses */}
                            <div>
                                <span className="text-xs font-medium text-red-400/70 uppercase tracking-wider">
                                    Expenses
                                </span>
                                <RangeBar
                                    p10={band.expenses.p10}
                                    p50={band.expenses.p50}
                                    p90={band.expenses.p90}
                                    color="red"
                                />
                                <p className="mt-1 text-center text-xs text-zinc-500">
                                    {formatCurrency(band.expenses.p10)} – <span className="text-zinc-300 font-medium">{formatCurrency(band.expenses.p50)}</span> – {formatCurrency(band.expenses.p90)}
                                </p>
                            </div>

                            {/* Net */}
                            <div className={`rounded-lg border p-3 ${netBg}`}>
                                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Net Cash Flow
                                </span>
                                <div className="mt-1 flex items-baseline justify-between">
                                    <span className="text-xs text-zinc-500">
                                        {formatCurrency(band.net.p10)}
                                    </span>
                                    <span className={`text-lg font-bold ${netText}`}>
                                        {formatCurrency(band.net.p50)}
                                    </span>
                                    <span className="text-xs text-zinc-500">
                                        {formatCurrency(band.net.p90)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
