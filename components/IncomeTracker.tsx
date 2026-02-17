"use client";

import { useMemo, useState, useEffect } from "react";
import { useSync } from "@/contexts/SyncContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { getDisplayMerchant } from "@/lib/merchants";
import { DollarSign, TrendingUp, TrendingDown, PieChart, Wallet, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";

interface PaycheckInfo {
    merchant: string;
    avgAmount: number;
    lastAmount: number;
    frequency: string;
    lastDate: string;
    nextExpected: string;
    count: number;
}

interface MonthIncome {
    month: string;
    label: string;
    total: number;
    sources: Record<string, number>;
}

const DEFAULT_ALLOCATIONS = { needs: 50, wants: 30, savings: 20 };

export function IncomeTracker() {
    const { transactions } = useSync();
    const { prefs, loaded, setPref } = usePreferences();
    const [allocations, setAllocations] = useState(DEFAULT_ALLOCATIONS);
    const [editing, setEditing] = useState(false);
    const [showPaychecks, setShowPaychecks] = useState(true);

    useEffect(() => {
        if (loaded && prefs.income_allocations) {
            setAllocations(prefs.income_allocations);
        }
    }, [loaded, prefs.income_allocations]);

    // Detect paychecks (negative amounts in Plaid = income)
    const paychecks = useMemo((): PaycheckInfo[] => {
        if (!transactions?.length) return [];

        const groups = new Map<string, Array<{ amount: number; date: string }>>();

        for (const tx of transactions) {
            if (tx.amount >= 0) continue; // Only income (negative in Plaid convention)
            const amt = Math.abs(tx.amount);
            if (amt < 100) continue; // Filter out tiny refunds

            const merchant = getDisplayMerchant(tx);
            const key = merchant.toLowerCase().replace(/[^a-z0-9]/g, "");

            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push({ amount: amt, date: tx.date || tx.authorized_date || "" });
        }

        const results: PaycheckInfo[] = [];

        for (const [, txs] of groups) {
            if (txs.length < 2) continue;
            txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // Calculate intervals
            const intervals: number[] = [];
            for (let i = 1; i < txs.length; i++) {
                const diff = (new Date(txs[i].date).getTime() - new Date(txs[i - 1].date).getTime()) / (1000 * 60 * 60 * 24);
                if (diff > 0) intervals.push(diff);
            }

            if (intervals.length === 0) continue;

            const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;

            let frequency = "monthly";
            if (avgInterval < 10) frequency = "weekly";
            else if (avgInterval < 20) frequency = "bi-weekly";

            const last = txs[txs.length - 1];
            const avg = txs.reduce((s, t) => s + t.amount, 0) / txs.length;

            const nextDate = new Date(last.date);
            if (frequency === "weekly") nextDate.setDate(nextDate.getDate() + 7);
            else if (frequency === "bi-weekly") nextDate.setDate(nextDate.getDate() + 14);
            else nextDate.setMonth(nextDate.getMonth() + 1);

            results.push({
                merchant: getDisplayMerchant(transactions.find((t) => (t.date || t.authorized_date) === txs[0].date && Math.abs(t.amount) === txs[0].amount) || { name: "Unknown" }),
                avgAmount: avg,
                lastAmount: last.amount,
                frequency,
                lastDate: last.date,
                nextExpected: nextDate.toISOString().split("T")[0],
                count: txs.length,
            });
        }

        return results.sort((a, b) => b.avgAmount - a.avgAmount);
    }, [transactions]);

    // Monthly income trends (last 3 months)
    const monthlyIncome = useMemo((): MonthIncome[] => {
        if (!transactions?.length) return [];

        const now = new Date();
        const months: MonthIncome[] = [];

        for (let m = 0; m < 3; m++) {
            const target = new Date(now.getFullYear(), now.getMonth() - m, 1);
            const monthKey = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
            const label = target.toLocaleDateString("en-US", { month: "short", year: "numeric" });

            const data: MonthIncome = { month: monthKey, label, total: 0, sources: {} };

            for (const tx of transactions) {
                const d = tx.date || tx.authorized_date;
                if (!d || !d.startsWith(monthKey)) continue;
                if (tx.amount >= 0) continue; // Only income

                const amt = Math.abs(tx.amount);
                data.total += amt;
                const merchant = getDisplayMerchant(tx);
                data.sources[merchant] = (data.sources[merchant] || 0) + amt;
            }

            months.push(data);
        }

        return months;
    }, [transactions]);

    const totalMonthlyIncome = monthlyIncome[0]?.total || 0;
    const prevMonthlyIncome = monthlyIncome[1]?.total || 0;
    const incomeChange = prevMonthlyIncome > 0 ? ((totalMonthlyIncome - prevMonthlyIncome) / prevMonthlyIncome) * 100 : 0;

    const updateAllocation = (key: "needs" | "wants" | "savings", value: number) => {
        const updated = { ...allocations, [key]: value };
        setAllocations(updated);
        setPref("income_allocations", updated);
    };

    const totalAlloc = allocations.needs + allocations.wants + allocations.savings;
    const estimatedPaycheck = paychecks.length > 0 ? paychecks.reduce((s, p) => s + p.avgAmount, 0) : totalMonthlyIncome;

    if (!transactions?.length) {
        return (
            <div className="glass-card rounded-2xl p-6 text-center">
                <Wallet size={24} className="mx-auto text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-500">No transaction data available for income tracking.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="glass-card rounded-xl p-4">
                    <div className="text-xs text-zinc-500 flex items-center gap-1"><DollarSign size={12} /> This Month</div>
                    <div className="text-xl font-bold text-emerald-400 mt-1">
                        ${totalMonthlyIncome.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </div>
                </div>
                <div className="glass-card rounded-xl p-4">
                    <div className="text-xs text-zinc-500 flex items-center gap-1">
                        {incomeChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} MoM Change
                    </div>
                    <div className={clsx("text-xl font-bold mt-1", incomeChange >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {incomeChange >= 0 ? "+" : ""}{incomeChange.toFixed(1)}%
                    </div>
                </div>
                <div className="glass-card rounded-xl p-4">
                    <div className="text-xs text-zinc-500 flex items-center gap-1"><Calendar size={12} /> Income Sources</div>
                    <div className="text-xl font-bold text-blue-400 mt-1">{paychecks.length}</div>
                </div>
            </div>

            {/* Paycheck Detection */}
            <div className="glass-card rounded-2xl p-5 space-y-3">
                <button
                    type="button"
                    onClick={() => setShowPaychecks(!showPaychecks)}
                    className="w-full flex items-center justify-between text-left"
                >
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Wallet size={14} className="text-emerald-400" /> Detected Paychecks
                    </h3>
                    {showPaychecks ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
                </button>

                {showPaychecks && (
                    <div className="space-y-2">
                        {paychecks.length === 0 ? (
                            <p className="text-xs text-zinc-500">No recurring income detected yet.</p>
                        ) : (
                            paychecks.map((p) => (
                                <div key={p.merchant} className="flex items-center justify-between rounded-lg bg-zinc-900/50 p-3">
                                    <div>
                                        <p className="text-sm text-white">{p.merchant}</p>
                                        <p className="text-xs text-zinc-500">{p.frequency} · {p.count} deposits</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-emerald-400">+${p.avgAmount.toFixed(2)}</p>
                                        <p className="text-[10px] text-zinc-500">
                                            Next: {new Date(p.nextExpected).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Income Trend */}
            <div className="glass-card rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white">Monthly Income Trend</h3>
                <div className="space-y-2">
                    {monthlyIncome.slice().reverse().map((m) => {
                        const maxIncome = Math.max(...monthlyIncome.map(x => x.total), 1);
                        const pct = (m.total / maxIncome) * 100;
                        return (
                            <div key={m.month} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-400">{m.label}</span>
                                    <span className="text-emerald-400 font-medium">${m.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                                </div>
                                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Paycheck Planner */}
            <div className="glass-card rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <PieChart size={14} className="text-blue-400" /> Paycheck Planner
                    </h3>
                    {!editing ? (
                        <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 hover:text-white transition-colors">
                            Edit Split
                        </button>
                    ) : (
                        <button type="button" onClick={() => setEditing(false)} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                            Done
                        </button>
                    )}
                </div>

                <p className="text-xs text-zinc-500">
                    Based on estimated monthly income of <span className="text-zinc-300">${estimatedPaycheck.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                </p>

                {/* Visual breakdown */}
                <div className="flex h-3 rounded-full overflow-hidden">
                    <div className="bg-blue-500" style={{ width: `${(allocations.needs / totalAlloc) * 100}%` }} />
                    <div className="bg-violet-500" style={{ width: `${(allocations.wants / totalAlloc) * 100}%` }} />
                    <div className="bg-emerald-500" style={{ width: `${(allocations.savings / totalAlloc) * 100}%` }} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                    {([
                        { key: "needs" as const, label: "Needs", color: "text-blue-400", bgColor: "bg-blue-500", desc: "Rent, bills, groceries" },
                        { key: "wants" as const, label: "Wants", color: "text-violet-400", bgColor: "bg-violet-500", desc: "Dining, entertainment" },
                        { key: "savings" as const, label: "Savings", color: "text-emerald-400", bgColor: "bg-emerald-500", desc: "Emergency fund, goals" },
                    ]).map(({ key, label, color, bgColor, desc }) => {
                        const pct = allocations[key];
                        const amount = (estimatedPaycheck * pct) / totalAlloc;

                        return (
                            <div key={key} className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                    <span className={clsx("w-2 h-2 rounded-full", bgColor)} />
                                    <span className="text-xs text-zinc-400">{label}</span>
                                </div>
                                {editing ? (
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={pct}
                                            onChange={(e) => updateAllocation(key, Math.max(0, Math.min(100, Number(e.target.value))))}
                                            className="w-14 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-sm text-white text-center"
                                            aria-label={`${label} allocation percentage`}
                                        />
                                        <span className="text-xs text-zinc-500">%</span>
                                    </div>
                                ) : (
                                    <p className={clsx("text-lg font-bold", color)}>{pct}%</p>
                                )}
                                <p className="text-xs text-zinc-500">${amount.toFixed(0)}/mo</p>
                                <p className="text-[10px] text-zinc-600">{desc}</p>
                            </div>
                        );
                    })}
                </div>

                {totalAlloc !== 100 && (
                    <p className="text-xs text-amber-400">Total allocation is {totalAlloc}% — should be 100%</p>
                )}
            </div>
        </div>
    );
}
