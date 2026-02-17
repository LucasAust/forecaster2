"use client";

import { useMemo } from "react";

import type { Transaction } from "@/types";

interface Props {
    transactions: Transaction[];
}

const INTENSITY = [
    "bg-zinc-800",        // 0 spending
    "bg-emerald-900/60",  // very low
    "bg-emerald-700/60",  // low
    "bg-emerald-500/60",  // medium
    "bg-amber-500/60",    // high
    "bg-rose-500/60",     // very high
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SpendingHeatmap({ transactions }: Props) {
    const { days, maxSpend } = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        // Daily totals
        const dailyTotals: Record<number, number> = {};
        transactions.forEach((tx) => {
            const d = new Date(tx.date);
            if (d.getMonth() === month && d.getFullYear() === year) {
                const day = d.getDate();
                dailyTotals[day] = (dailyTotals[day] || 0) + Math.abs(tx.amount);
            }
        });

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDow = new Date(year, month, 1).getDay();
        const maxSpend = Math.max(...Object.values(dailyTotals), 1);

        const days: { date: number; amount: number; blank: boolean }[] = [];

        // Leading blanks
        for (let i = 0; i < firstDow; i++) {
            days.push({ date: 0, amount: 0, blank: true });
        }

        for (let d = 1; d <= daysInMonth; d++) {
            days.push({ date: d, amount: dailyTotals[d] || 0, blank: false });
        }

        return { days, maxSpend };
    }, [transactions]);

    function getIntensity(amount: number): string {
        if (amount === 0) return INTENSITY[0];
        const ratio = amount / maxSpend;
        if (ratio < 0.15) return INTENSITY[1];
        if (ratio < 0.35) return INTENSITY[2];
        if (ratio < 0.55) return INTENSITY[3];
        if (ratio < 0.8) return INTENSITY[4];
        return INTENSITY[5];
    }

    const now = new Date();
    const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" });

    return (
        <div>
            <p className="text-sm text-zinc-400 mb-4">{monthName}</p>
            <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((d) => (
                    <div key={d} className="text-[10px] font-medium text-zinc-500 pb-1">{d}</div>
                ))}
                {days.map((day, i) => (
                    <div
                        key={i}
                        className={`aspect-square rounded-sm flex items-center justify-center text-[10px] transition-colors ${
                            day.blank ? "" : getIntensity(day.amount)
                        } ${!day.blank && day.date === now.getDate() ? "ring-1 ring-blue-500" : ""}`}
                        title={day.blank ? "" : `Day ${day.date}: $${day.amount.toFixed(0)}`}
                    >
                        {!day.blank && <span className="text-zinc-300">{day.date}</span>}
                    </div>
                ))}
            </div>
            <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-zinc-500">
                <span>Less</span>
                {INTENSITY.map((cls, i) => (
                    <div key={i} className={`h-3 w-3 rounded-sm ${cls}`} />
                ))}
                <span>More</span>
            </div>
        </div>
    );
}
