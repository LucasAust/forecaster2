"use client";

import { useMemo, useState } from "react";
import { useSync } from "@/contexts/SyncContext";
import { getDisplayMerchant } from "@/lib/merchants";
import { inferCategory, CATEGORY_COLORS } from "@/lib/categories";
import { CreditCard, TrendingUp, TrendingDown, AlertTriangle, Bell, Calendar, DollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";

import type { Transaction } from "@/types";

interface Subscription {
    merchant: string;
    category: string;
    avgAmount: number;
    lastAmount: number;
    previousAmount: number;
    frequency: "monthly" | "yearly" | "weekly";
    lastDate: string;
    nextDate: string;
    count: number;
    priceChange: number; // percentage
    amounts: number[];
}

export function SubscriptionManager() {
    const { transactions } = useSync();
    const [expanded, setExpanded] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<"amount" | "name" | "next">("amount");

    const subscriptions = useMemo(() => {
        if (!transactions?.length) return [];

        // Group recurring expenses by merchant
        const groups = new Map<string, Array<{ amount: number; date: string; raw: Transaction }>>();

        for (const tx of transactions) {
            if (tx.amount <= 0) continue; // Expenses only (Plaid: positive = expense)
            const merchant = getDisplayMerchant(tx);
            const key = merchant.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push({
                amount: tx.amount,
                date: tx.date || tx.authorized_date || "",
                raw: tx,
            });
        }

        const subs: Subscription[] = [];

        for (const [key, txs] of groups) {
            if (txs.length < 2) continue;

            // Sort by date
            txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // Calculate intervals between transactions
            const intervals: number[] = [];
            for (let i = 1; i < txs.length; i++) {
                const diff = (new Date(txs[i].date).getTime() - new Date(txs[i - 1].date).getTime()) / (1000 * 60 * 60 * 24);
                if (diff > 0) intervals.push(diff);
            }

            if (intervals.length === 0) continue;

            const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
            const stdDev = Math.sqrt(intervals.reduce((sum, i) => sum + (i - avgInterval) ** 2, 0) / intervals.length);
            const cv = avgInterval > 0 ? stdDev / avgInterval : 999;

            // Must be somewhat regular (CV < 0.5) to be a subscription
            if (cv > 0.5) continue;

            // Determine frequency
            let frequency: "weekly" | "monthly" | "yearly" = "monthly";
            if (avgInterval < 10) frequency = "weekly";
            else if (avgInterval > 300) frequency = "yearly";

            // Only keep likely subscriptions (exclude groceries, dining, etc.)
            const cat = inferCategory(txs[0].raw);
            const subscriptionLikeCategories = ["Subscriptions", "Utilities", "Insurance", "Entertainment", "Healthcare"];
            const amounts = txs.map(t => t.amount);
            const amountCV = Math.sqrt(amounts.reduce((sum, a) => sum + (a - amounts.reduce((s, v) => s + v, 0) / amounts.length) ** 2, 0) / amounts.length) / (amounts.reduce((s, v) => s + v, 0) / amounts.length);

            // If amounts are very consistent (CV < 0.3) OR category is subscription-like, it's probably a subscription
            if (amountCV > 0.3 && !subscriptionLikeCategories.includes(cat)) continue;

            const lastTx = txs[txs.length - 1];
            const prevTx = txs.length >= 2 ? txs[txs.length - 2] : null;
            const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;

            // Calculate next date
            const lastDate = new Date(lastTx.date);
            const nextDate = new Date(lastDate);
            if (frequency === "weekly") nextDate.setDate(nextDate.getDate() + 7);
            else if (frequency === "monthly") nextDate.setMonth(nextDate.getMonth() + 1);
            else nextDate.setFullYear(nextDate.getFullYear() + 1);

            // Price change detection
            let priceChange = 0;
            if (prevTx && prevTx.amount > 0) {
                priceChange = ((lastTx.amount - prevTx.amount) / prevTx.amount) * 100;
            }

            subs.push({
                merchant: getDisplayMerchant(txs[0].raw),
                category: cat,
                avgAmount,
                lastAmount: lastTx.amount,
                previousAmount: prevTx?.amount || lastTx.amount,
                frequency,
                lastDate: lastTx.date,
                nextDate: nextDate.toISOString().split("T")[0],
                count: txs.length,
                priceChange,
                amounts,
            });
        }

        // Sort
        subs.sort((a, b) => {
            if (sortBy === "amount") return b.avgAmount - a.avgAmount;
            if (sortBy === "name") return a.merchant.localeCompare(b.merchant);
            return new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime();
        });

        return subs;
    }, [transactions, sortBy]);

    const totalMonthly = useMemo(() => {
        return subscriptions.reduce((sum, sub) => {
            if (sub.frequency === "weekly") return sum + sub.avgAmount * 4.33;
            if (sub.frequency === "yearly") return sum + sub.avgAmount / 12;
            return sum + sub.avgAmount;
        }, 0);
    }, [subscriptions]);

    const totalYearly = totalMonthly * 12;
    const priceIncreases = subscriptions.filter(s => s.priceChange > 2);

    if (!subscriptions.length) {
        return (
            <div className="glass-card rounded-2xl p-6 text-center">
                <CreditCard size={24} className="mx-auto text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-500">No subscriptions detected yet.</p>
                <p className="text-xs text-zinc-600 mt-1">Connect more transaction history to detect recurring charges.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="glass-card rounded-xl p-4">
                    <div className="text-xs text-zinc-500 flex items-center gap-1"><DollarSign size={12} /> Monthly Total</div>
                    <div className="text-xl font-bold text-white mt-1">${totalMonthly.toFixed(0)}</div>
                </div>
                <div className="glass-card rounded-xl p-4">
                    <div className="text-xs text-zinc-500 flex items-center gap-1"><Calendar size={12} /> Yearly Total</div>
                    <div className="text-xl font-bold text-zinc-300 mt-1">${totalYearly.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
                </div>
                <div className="glass-card rounded-xl p-4">
                    <div className="text-xs text-zinc-500 flex items-center gap-1"><CreditCard size={12} /> Active</div>
                    <div className="text-xl font-bold text-blue-400 mt-1">{subscriptions.length}</div>
                </div>
            </div>

            {/* Price Increase Warning */}
            {priceIncreases.length > 0 && (
                <div className="rounded-xl border border-amber-900/50 bg-amber-900/10 p-3 flex items-start gap-2">
                    <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="text-sm text-amber-300 font-medium">Price Increases Detected</p>
                        <p className="text-xs text-amber-400/70 mt-0.5">
                            {priceIncreases.map(s => `${s.merchant} (+${s.priceChange.toFixed(0)}%)`).join(", ")}
                        </p>
                    </div>
                </div>
            )}

            {/* Sort controls */}
            <div className="flex gap-2 text-xs">
                {(["amount", "name", "next"] as const).map(s => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setSortBy(s)}
                        className={clsx(
                            "px-2.5 py-1 rounded-md transition-colors",
                            sortBy === s ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        {s === "amount" ? "By Cost" : s === "name" ? "By Name" : "By Next Date"}
                    </button>
                ))}
            </div>

            {/* Subscription List */}
            <div className="space-y-2">
                {subscriptions.map((sub) => {
                    const color = CATEGORY_COLORS[sub.category] || "#71717a";
                    const isExpanded = expanded === sub.merchant;
                    const daysUntilNext = Math.max(0, Math.ceil((new Date(sub.nextDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

                    return (
                        <div key={sub.merchant} className="glass-card rounded-xl overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setExpanded(isExpanded ? null : sub.merchant)}
                                className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-800/30 transition-colors"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-white truncate">{sub.merchant}</p>
                                        <p className="text-xs text-zinc-500">{sub.category} · {sub.frequency}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-zinc-300">${sub.lastAmount.toFixed(2)}</p>
                                        {sub.priceChange > 2 && (
                                            <span className="text-[10px] text-amber-400 flex items-center gap-0.5 justify-end">
                                                <TrendingUp size={8} /> +{sub.priceChange.toFixed(0)}%
                                            </span>
                                        )}
                                        {sub.priceChange < -2 && (
                                            <span className="text-[10px] text-emerald-400 flex items-center gap-0.5 justify-end">
                                                <TrendingDown size={8} /> {sub.priceChange.toFixed(0)}%
                                            </span>
                                        )}
                                    </div>
                                    {isExpanded ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="px-4 pb-4 space-y-3 border-t border-zinc-800/50 pt-3">
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div>
                                            <span className="text-zinc-500">Avg Amount</span>
                                            <p className="text-zinc-300 font-medium">${sub.avgAmount.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <span className="text-zinc-500">Next Charge</span>
                                            <p className="text-zinc-300 font-medium">
                                                {new Date(sub.nextDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                                <span className="text-zinc-500 ml-1">({daysUntilNext}d)</span>
                                            </p>
                                        </div>
                                        <div>
                                            <span className="text-zinc-500">Charges Detected</span>
                                            <p className="text-zinc-300 font-medium">{sub.count}</p>
                                        </div>
                                        <div>
                                            <span className="text-zinc-500">Last Charged</span>
                                            <p className="text-zinc-300 font-medium">
                                                {new Date(sub.lastDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Amount History */}
                                    <div>
                                        <span className="text-xs text-zinc-500">Amount History</span>
                                        <div className="flex items-end gap-1 mt-1 h-8">
                                            {sub.amounts.slice(-6).map((amt, i) => {
                                                const maxAmt = Math.max(...sub.amounts.slice(-6));
                                                const h = maxAmt > 0 ? (amt / maxAmt) * 100 : 0;
                                                return (
                                                    <div
                                                        key={i}
                                                        className="flex-1 rounded-sm bg-blue-500/40"
                                                        style={{ height: `${h}%` }}
                                                        title={`$${amt.toFixed(2)}`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
