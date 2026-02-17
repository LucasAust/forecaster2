"use client";

import { useState, useMemo, useEffect } from "react";
import { useSync } from "@/contexts/SyncContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { inferCategory, CATEGORIES, CATEGORY_COLORS } from "@/lib/categories";
import { Edit2, Check, AlertTriangle, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
import { SpendingSparkline } from "@/components/SpendingSparkline";

interface CategoryLimit {
    category: string;
    limit: number;
    rollover: boolean; // unused budget rolls over to next month
}

export function CategoryBudgets() {
    const { transactions } = useSync();
    const { prefs, loaded, setPref } = usePreferences();
    const [limits, setLimits] = useState<CategoryLimit[]>([]);
    const [editingCategory, setEditingCategory] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    // Sync from preferences context once loaded
    useEffect(() => {
        if (loaded && prefs.category_limits) {
            setLimits(prefs.category_limits);
        }
    }, [loaded, prefs.category_limits]);

    // Calculate spending per category this month
    const spending = useMemo(() => {
        if (!transactions?.length) return new Map<string, number>();
        const now = new Date();
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const map = new Map<string, number>();
        for (const tx of transactions) {
            if (tx.amount <= 0) continue; // Plaid: positive = expense
            const txDate = new Date(tx.date);
            if (txDate < firstOfMonth) continue;

            const category = inferCategory(tx);
            map.set(category, (map.get(category) || 0) + tx.amount);
        }
        return map;
    }, [transactions]);

    // Calculate last 3 months of spending per category for sparklines
    const monthlyTrends = useMemo(() => {
        if (!transactions?.length) return new Map<string, number[]>();
        const now = new Date();
        // Generate month buckets: current month + 2 prior months
        const months: { start: Date; end: Date }[] = [];
        for (let i = 2; i >= 0; i--) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            months.push({ start, end });
        }

        const trends = new Map<string, number[]>();
        const actual = transactions.filter((tx) => !tx.isPredicted && tx.amount > 0);

        for (const tx of actual) {
            const txDate = new Date(tx.date);
            const cat = inferCategory(tx);

            for (let mi = 0; mi < months.length; mi++) {
                if (txDate >= months[mi].start && txDate < months[mi].end) {
                    if (!trends.has(cat)) trends.set(cat, [0, 0, 0]);
                    trends.get(cat)![mi] += tx.amount;
                    break;
                }
            }
        }

        return trends;
    }, [transactions]);

    // Get active categories (those with spending or limits)
    const activeCategories = useMemo(() => {
        const cats = new Set<string>();
        for (const key of spending.keys()) cats.add(key);
        for (const l of limits) cats.add(l.category);
        return CATEGORIES.filter(c => cats.has(c));
    }, [spending, limits]);

    const setLimit = (category: string, limit: number) => {
        const updated = limits.filter(l => l.category !== category);
        if (limit > 0) {
            updated.push({ category, limit, rollover: false });
        }
        setLimits(updated);
        setPref("category_limits", updated);
        setEditingCategory(null);
    };

    const toggleRollover = (category: string) => {
        const updated = limits.map(l =>
            l.category === category ? { ...l, rollover: !l.rollover } : l
        );
        setLimits(updated);
        setPref("category_limits", updated);
    };

    const getLimit = (category: string) => limits.find(l => l.category === category);

    if (activeCategories.length === 0) {
        return <p className="text-sm text-zinc-500 text-center py-4">No spending data available this month.</p>;
    }

    return (
        <div className="space-y-3">
            {activeCategories.map(cat => {
                const spent = spending.get(cat) || 0;
                const limitObj = getLimit(cat);
                const limit = limitObj?.limit || 0;
                const pct = limit > 0 ? (spent / limit) * 100 : 0;
                const isOver = pct > 100;
                const isNear = pct > 80 && pct <= 100;
                const color = CATEGORY_COLORS[cat] || "#6b7280";
                const isEditing = editingCategory === cat;
                const trend = monthlyTrends.get(cat);

                return (
                    <div key={cat} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                                <span className="text-sm font-medium text-white">{cat}</span>
                                {isOver && <AlertTriangle size={12} className="text-rose-400" />}
                                {isNear && !isOver && <AlertTriangle size={12} className="text-amber-400" />}
                                {/* 3-month spending sparkline */}
                                {trend && trend.some(v => v > 0) && (
                                    <SpendingSparkline data={trend} width={56} height={20} />
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-400">
                                    ${spent.toFixed(0)}{limit > 0 ? ` / $${limit}` : ""}
                                </span>
                                {isEditing ? (
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs text-zinc-500">$</span>
                                        <input
                                            type="number"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") setLimit(cat, parseFloat(editValue) || 0); }}
                                            className="w-16 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-blue-500"
                                            autoFocus
                                            placeholder="0"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setLimit(cat, parseFloat(editValue) || 0)}
                                            className="text-emerald-400 hover:text-emerald-300"
                                            title="Save limit"
                                        >
                                            <Check size={12} />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => { setEditingCategory(cat); setEditValue(limit > 0 ? limit.toString() : ""); }}
                                        className="text-zinc-600 hover:text-zinc-400 transition-colors"
                                        title="Set limit"
                                    >
                                        <Edit2 size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                        {/* Progress bar */}
                        {limit > 0 && (
                            <>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                                    <div
                                        className={clsx(
                                            "h-full rounded-full transition-all duration-500",
                                            isOver ? "bg-rose-500" : isNear ? "bg-amber-500" : "bg-emerald-500"
                                        )}
                                        style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className={clsx("text-[10px]", isOver ? "text-rose-400" : isNear ? "text-amber-400" : "text-zinc-500")}>
                                        {isOver ? `$${(spent - limit).toFixed(0)} over limit` : `$${(limit - spent).toFixed(0)} remaining`}
                                    </span>
                                    {limitObj && (
                                        <button
                                            type="button"
                                            onClick={() => toggleRollover(cat)}
                                            className={clsx(
                                                "flex items-center gap-0.5 text-[10px] transition-colors",
                                                limitObj.rollover ? "text-blue-400" : "text-zinc-600 hover:text-zinc-400"
                                            )}
                                            title={limitObj.rollover ? "Rollover enabled" : "Enable rollover"}
                                        >
                                            <RefreshCw size={10} />
                                            {limitObj.rollover ? "Rollover on" : "Rollover"}
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
