"use client";

import { useMemo, useState } from "react";
import { useSync } from "@/contexts/SyncContext";
import { processForecastData } from "@/lib/api";
import { inferCategory, CATEGORY_COLORS } from "@/lib/categories";
import { getDisplayMerchant } from "@/lib/merchants";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { clsx } from "clsx";

import type { ForecastTimelinePoint, Transaction, PredictedTransaction } from "@/types";

interface CalendarDay {
    date: Date;
    dateStr: string;
    isCurrentMonth: boolean;
    isToday: boolean;
    transactions: (Transaction | PredictedTransaction)[];
    totalExpenses: number;
    totalIncome: number;
    runningBalance: number;
}

export function BillCalendar() {
    const { forecast, balance, transactions, loadingStage } = useSync();
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

    // Build balance map from forecast data
    const forecastMap = useMemo(() => {
        if (!forecast) return new Map<string, ForecastTimelinePoint>();
        const processed = processForecastData(forecast, balance);
        const map = new Map<string, ForecastTimelinePoint>();
        for (const day of processed) {
            map.set(day.fullDate, day);
        }
        return map;
    }, [forecast, balance]);

    // Also map past (actual) transactions by date
    const actualMap = useMemo(() => {
        if (!transactions?.length) return new Map<string, Transaction[]>();
        const map = new Map<string, Transaction[]>();
        for (const tx of transactions) {
            const d = tx.date || tx.authorized_date;
            if (!d) continue;
            if (!map.has(d)) map.set(d, []);
            map.get(d)!.push(tx);
        }
        return map;
    }, [transactions]);

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startPad = firstDay.getDay(); // 0=Sun
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const days: CalendarDay[] = [];

        // Pad start
        for (let i = startPad - 1; i >= 0; i--) {
            const d = new Date(year, month, -i);
            const ds = d.toISOString().split("T")[0];
            days.push({
                date: d, dateStr: ds, isCurrentMonth: false, isToday: false,
                transactions: [], totalExpenses: 0, totalIncome: 0, runningBalance: 0,
            });
        }

        // Month days
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const d = new Date(year, month, day);
            const ds = d.toISOString().split("T")[0];
            const isToday = d.getTime() === today.getTime();
            const isPast = d <= today;

            let txs: (Transaction | PredictedTransaction)[] = [];
            let totalExpenses = 0;
            let totalIncome = 0;
            let runningBal = 0;

            if (isPast) {
                // Use actual transactions
                const actual = actualMap.get(ds) || [];
                txs = actual;
                for (const tx of actual) {
                    if (tx.amount > 0) totalExpenses += tx.amount;
                    else totalIncome += Math.abs(tx.amount);
                }
            } else {
                // Use forecast
                const fc = forecastMap.get(ds);
                if (fc) {
                    txs = fc.transactions || [];
                    totalExpenses = fc.dailyExpenses || 0;
                    totalIncome = fc.dailyIncome || 0;
                    runningBal = fc.balance || 0;
                }
            }

            days.push({
                date: d, dateStr: ds, isCurrentMonth: true, isToday,
                transactions: txs, totalExpenses, totalIncome, runningBalance: runningBal,
            });
        }

        // Pad end to fill 6 rows
        const endPad = 42 - days.length;
        for (let i = 1; i <= endPad; i++) {
            const d = new Date(year, month + 1, i);
            const ds = d.toISOString().split("T")[0];
            days.push({
                date: d, dateStr: ds, isCurrentMonth: false, isToday: false,
                transactions: [], totalExpenses: 0, totalIncome: 0, runningBalance: 0,
            });
        }

        return days;
    }, [currentMonth, forecastMap, actualMap]);

    const navigateMonth = (dir: -1 | 1) => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + dir, 1));
        setSelectedDay(null);
    };

    const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    if (loadingStage !== "complete") {
        return <div className="text-sm text-zinc-500 p-4">Loading calendar...</div>;
    }

    return (
        <div className="glass-card rounded-2xl p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Bill Calendar</h2>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => navigateMonth(-1)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors" aria-label="Previous month">
                        <ChevronLeft size={18} />
                    </button>
                    <span className="text-sm font-medium text-zinc-300 min-w-[140px] text-center">{monthLabel}</span>
                    <button type="button" onClick={() => navigateMonth(1)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors" aria-label="Next month">
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 text-xs text-zinc-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Expenses</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Income</span>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500 font-medium">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                    <div key={d} className="py-1">{d}</div>
                ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                    const hasTx = day.transactions.length > 0;
                    const hasExpense = day.totalExpenses > 0;
                    const hasIncome = day.totalIncome > 0;

                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => hasTx ? setSelectedDay(day) : null}
                            className={clsx(
                                "relative flex flex-col items-center rounded-lg p-1.5 min-h-[60px] text-xs transition-all",
                                day.isCurrentMonth ? "bg-zinc-900/50" : "bg-transparent opacity-40",
                                day.isToday && "ring-1 ring-blue-500",
                                hasTx && "cursor-pointer hover:bg-zinc-800/70",
                                !hasTx && "cursor-default",
                                selectedDay?.dateStr === day.dateStr && "bg-zinc-800 ring-1 ring-zinc-600"
                            )}
                        >
                            <span className={clsx(
                                "font-medium",
                                day.isToday ? "text-blue-400" : day.isCurrentMonth ? "text-zinc-300" : "text-zinc-600"
                            )}>
                                {day.date.getDate()}
                            </span>

                            {/* Transaction dots */}
                            {hasTx && (
                                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-full">
                                    {day.transactions.slice(0, 3).map((tx, j: number) => {
                                        const cat = inferCategory(tx);
                                        const color = CATEGORY_COLORS[cat] || "#71717a";
                                        return <span key={j} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />;
                                    })}
                                    {day.transactions.length > 3 && (
                                        <span className="text-[8px] text-zinc-500">+{day.transactions.length - 3}</span>
                                    )}
                                </div>
                            )}

                            {/* Amount summary */}
                            {hasExpense && (
                                <span className="text-[9px] text-rose-400 mt-auto">
                                    -${day.totalExpenses >= 1000 ? `${(day.totalExpenses / 1000).toFixed(1)}k` : day.totalExpenses.toFixed(0)}
                                </span>
                            )}
                            {hasIncome && (
                                <span className="text-[9px] text-emerald-400">
                                    +${day.totalIncome >= 1000 ? `${(day.totalIncome / 1000).toFixed(1)}k` : day.totalIncome.toFixed(0)}
                                </span>
                            )}

                            {/* Running balance (future only) */}
                            {day.runningBalance !== 0 && day.date > new Date() && (
                                <span className={clsx(
                                    "text-[8px] mt-0.5",
                                    day.runningBalance >= 0 ? "text-zinc-500" : "text-rose-600"
                                )}>
                                    ${(day.runningBalance / 1000).toFixed(1)}k
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Selected day detail */}
            {selectedDay && (
                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">
                            {selectedDay.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                        </h3>
                        <button type="button" onClick={() => setSelectedDay(null)} className="text-zinc-500 hover:text-white" aria-label="Close day details">
                            <X size={14} />
                        </button>
                    </div>
                    <div className="space-y-2">
                        {selectedDay.transactions.map((tx, i: number) => {
                            const category = inferCategory(tx);
                            const color = CATEGORY_COLORS[category] || "#71717a";
                            const merchant = getDisplayMerchant(tx);
                            const amt = Math.abs(tx.amount);
                            const isExpense = tx.amount > 0 || (tx.amount < 0 && ('type' in tx ? tx.type !== "income" : true));

                            return (
                                <div key={i} className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                        <div>
                                            <p className="text-sm text-white">{merchant}</p>
                                            <p className="text-xs text-zinc-500">{category}</p>
                                        </div>
                                    </div>
                                    <span className={clsx("text-sm font-medium", tx.amount > 0 ? "text-rose-400" : "text-emerald-400")}>
                                        {tx.amount > 0 ? "-" : "+"}${amt.toFixed(2)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {selectedDay.runningBalance !== 0 && (
                        <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-800">
                            Projected end-of-day balance: <span className={clsx("font-medium", selectedDay.runningBalance >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                ${selectedDay.runningBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
