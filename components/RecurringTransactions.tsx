"use client";

import { useMemo, useState, useEffect } from "react";
import { useSync } from "@/contexts/SyncContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { getDisplayMerchant } from "@/lib/merchants";
import { inferCategory } from "@/lib/categories";
import { Repeat, Pause, Play, Trash2, Calendar, DollarSign } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonRecurringList } from "@/components/Skeleton";

import type { Transaction } from "@/types";

interface RecurringPattern {
    merchantKey: string;
    displayName: string;
    category: string;
    avgAmount: number;
    frequency: string; // "monthly", "weekly", "biweekly"
    lastDate: string;
    nextExpected: string;
    count: number;
    paused: boolean;
}

export function RecurringTransactions() {
    const { transactions, loadingStage } = useSync();
    const { prefs, loaded, setPref } = usePreferences();
    const [pausedSet, setPausedSet] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (loaded && prefs.paused_recurring) {
            setPausedSet(new Set(prefs.paused_recurring));
        }
    }, [loaded, prefs.paused_recurring]);

    const patterns = useMemo(() => {
        if (!transactions?.length) return [];

        // Group by normalized merchant name
        const groups = new Map<string, Array<{ amount: number; date: Date; raw: Transaction }>>();

        for (const tx of transactions) {
            if (tx.amount <= 0) continue; // Only expenses in Plaid convention
            const merchant = getDisplayMerchant(tx);
            const key = merchant.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push({
                amount: tx.amount,
                date: new Date(tx.date),
                raw: tx,
            });
        }

        const recurring: RecurringPattern[] = [];

        for (const [key, entries] of groups) {
            if (entries.length < 2) continue;

            // Sort by date ascending
            entries.sort((a, b) => a.date.getTime() - b.date.getTime());

            // Calculate intervals between consecutive transactions
            const intervals: number[] = [];
            for (let i = 1; i < entries.length; i++) {
                const days = Math.round((entries[i].date.getTime() - entries[i - 1].date.getTime()) / (1000 * 60 * 60 * 24));
                intervals.push(days);
            }

            if (intervals.length === 0) continue;

            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const variance = intervals.reduce((acc, i) => acc + Math.pow(i - avgInterval, 2), 0) / intervals.length;
            const stdDev = Math.sqrt(variance);

            // Only consider patterns with reasonable regularity
            // CV (coefficient of variation) < 0.5 means reasonably consistent
            if (stdDev / avgInterval > 0.5 && avgInterval > 3) continue;

            let frequency: string;
            if (avgInterval <= 9) frequency = "weekly";
            else if (avgInterval <= 18) frequency = "biweekly";
            else if (avgInterval <= 45) frequency = "monthly";
            else continue; // Too infrequent

            const avgAmount = entries.reduce((a, e) => a + e.amount, 0) / entries.length;
            const lastEntry = entries[entries.length - 1];
            const nextDate = new Date(lastEntry.date.getTime() + avgInterval * 24 * 60 * 60 * 1000);

            recurring.push({
                merchantKey: key,
                displayName: getDisplayMerchant(entries[0].raw),
                category: inferCategory(entries[0].raw),
                avgAmount,
                frequency,
                lastDate: lastEntry.date.toISOString().slice(0, 10),
                nextExpected: nextDate.toISOString().slice(0, 10),
                count: entries.length,
                paused: pausedSet.has(key),
            });
        }

        return recurring.sort((a, b) => b.avgAmount - a.avgAmount);
    }, [transactions, pausedSet]);

    const togglePause = (key: string) => {
        setPausedSet(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            setPref("paused_recurring", [...next]);
            return next;
        });
    };

    if (loadingStage === 'transactions') {
        return <SkeletonRecurringList count={4} />;
    }

    if (patterns.length === 0) {
        return (
            <div className="text-center py-8">
                <Repeat size={32} className="mx-auto mb-3 text-zinc-700" />
                <p className="text-sm text-zinc-500">No recurring patterns detected yet.</p>
                <p className="text-xs text-zinc-600 mt-1">More transactions will help identify patterns.</p>
            </div>
        );
    }

    const totalMonthly = patterns
        .filter(p => !p.paused)
        .reduce((sum, p) => {
            const multiplier = p.frequency === "weekly" ? 4.33 : p.frequency === "biweekly" ? 2.17 : 1;
            return sum + p.avgAmount * multiplier;
        }, 0);

    return (
        <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-between rounded-xl bg-zinc-900/50 p-4 border border-zinc-800">
                <div>
                    <p className="text-xs text-zinc-500">Est. Monthly Recurring</p>
                    <p className="text-lg font-bold text-white">${totalMonthly.toFixed(2)}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-zinc-500">Patterns Detected</p>
                    <p className="text-lg font-bold text-white">{patterns.length}</p>
                </div>
            </div>

            {/* List */}
            <div className="space-y-2">
                {patterns.map(p => (
                    <div
                        key={p.merchantKey}
                        className={clsx(
                            "flex items-center justify-between rounded-xl border p-3 transition-colors",
                            p.paused ? "border-zinc-800/50 bg-zinc-900/20 opacity-60" : "border-zinc-800 bg-zinc-900/50"
                        )}
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <p className={clsx("text-sm font-medium truncate", p.paused ? "text-zinc-500 line-through" : "text-white")}>
                                    {p.displayName}
                                </p>
                                <span className="text-[10px] rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-500 capitalize shrink-0">
                                    {p.frequency}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-zinc-500">{p.category}</span>
                                <span className="text-[10px] text-zinc-600">
                                    <Calendar size={10} className="inline mr-0.5" />
                                    Next: {p.nextExpected}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                            <span className="text-sm font-medium text-rose-400">
                                −${p.avgAmount.toFixed(2)}
                            </span>
                            <button
                                type="button"
                                onClick={() => togglePause(p.merchantKey)}
                                className={clsx(
                                    "rounded-lg p-1.5 transition-colors",
                                    p.paused ? "text-emerald-500 hover:bg-emerald-500/10" : "text-zinc-500 hover:bg-zinc-800 hover:text-amber-400"
                                )}
                                title={p.paused ? "Resume tracking" : "Pause tracking"}
                            >
                                {p.paused ? <Play size={14} /> : <Pause size={14} />}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
