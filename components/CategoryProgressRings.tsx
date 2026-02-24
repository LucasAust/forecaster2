"use client";

import { useMemo } from "react";
import { CATEGORY_COLORS, inferCategory } from "@/lib/categories";
import { useSync } from "@/contexts/SyncContext";

import type { Transaction } from "@/types";

interface Props {
    transactions: Transaction[];
    monthlyTarget: number;
}

/** Renders an SVG progress ring for a single category */
function ProgressRing({ label, spent, budget, color }: { label: string; spent: number; budget: number; color: string }) {
    const radius = 36;
    const stroke = 6;
    const circumference = 2 * Math.PI * radius;
    const pct = budget > 0 ? Math.min(spent / budget, 1) : 0;
    const offset = circumference * (1 - pct);

    const health: "green" | "yellow" | "red" =
        pct < 0.7 ? "green" : pct < 0.9 ? "yellow" : "red";

    const healthColors = {
        green: "text-emerald-400",
        yellow: "text-amber-400",
        red: "text-rose-400",
    };

    return (
        <div className="flex flex-col items-center gap-2 min-w-[100px]">
            <div className="relative">
                <svg width={90} height={90} className="-rotate-90">
                    {/* Background ring */}
                    <circle
                        cx={45} cy={45} r={radius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={stroke}
                        className="text-zinc-800"
                    />
                    {/* Progress ring */}
                    <circle
                        cx={45} cy={45} r={radius}
                        fill="none"
                        stroke={color}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-sm font-bold ${healthColors[health]}`}>
                        {Math.round(pct * 100)}%
                    </span>
                </div>
            </div>
            <span className="text-xs text-zinc-400 text-center truncate max-w-[90px]" title={label}>{label}</span>
            <span className="text-xs text-zinc-500">${spent.toFixed(0)}</span>
        </div>
    );
}

export function CategoryProgressRings({ transactions, monthlyTarget }: Props) {
    const { loadingStage } = useSync();

    const categoryData = useMemo(() => {
        const totals: Record<string, number> = {};

        transactions.forEach((tx) => {
            const cat = (Array.isArray(tx.category) ? tx.category[0] : tx.category) || "Uncategorized";
            totals[cat] = (totals[cat] || 0) + Math.abs(tx.amount);
        });

        const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);

        return Object.entries(totals)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 8)
            .map(([cat, amount]) => ({
                name: cat,
                spent: amount,
                // Proportional budget based on historical ratio
                budget: monthlyTarget > 0
                    ? (amount / grandTotal) * monthlyTarget
                    : amount * 1.2, // Default: 20% headroom
                color: CATEGORY_COLORS[cat] || "#71717a",
            }));
    }, [transactions, monthlyTarget]);

    if ((loadingStage === 'transactions' || loadingStage === 'forecast') && categoryData.length === 0) {
        return (
            <div className="flex flex-wrap justify-center gap-6 animate-pulse">
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="flex flex-col items-center gap-2 min-w-[100px]">
                        <div className="h-[90px] w-[90px] rounded-full bg-zinc-800/60" />
                        <div className="h-2.5 w-16 rounded bg-zinc-800/60" />
                        <div className="h-2 w-10 rounded bg-zinc-800/50" />
                    </div>
                ))}
            </div>
        );
    }

    if (categoryData.length === 0) {
        return <p className="text-sm text-zinc-500 text-center py-8">No category data yet.</p>;
    }

    return (
        <div className="flex flex-wrap justify-center gap-6">
            {categoryData.map((cat) => (
                <ProgressRing
                    key={cat.name}
                    label={cat.name}
                    spent={cat.spent}
                    budget={cat.budget}
                    color={cat.color}
                />
            ))}
        </div>
    );
}
