"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { CreditCard, Plus, Trash2, TrendingDown, Calculator, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";

interface Debt {
    id: string;
    name: string;
    balance: number;
    rate: number; // APR percentage
    minPayment: number;
    color: string;
}

const COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

type Strategy = "avalanche" | "snowball";

interface PayoffSchedule {
    months: number;
    totalInterest: number;
    totalPaid: number;
    monthlyDetails: { month: number; debts: { name: string; payment: number; remaining: number }[] }[];
}

function calculatePayoff(debts: Debt[], extraPayment: number, strategy: Strategy): PayoffSchedule {
    if (debts.length === 0) return { months: 0, totalInterest: 0, totalPaid: 0, monthlyDetails: [] };

    const working = debts.map(d => ({ ...d, remaining: d.balance }));
    let month = 0;
    let totalInterest = 0;
    let totalPaid = 0;
    const monthlyDetails: PayoffSchedule["monthlyDetails"] = [];
    const MAX_MONTHS = 600; // 50 years cap

    while (working.some(d => d.remaining > 0) && month < MAX_MONTHS) {
        month++;
        let extra = extraPayment;

        // Sort by strategy
        const sorted = [...working].filter(d => d.remaining > 0);
        if (strategy === "avalanche") sorted.sort((a, b) => b.rate - a.rate);
        else sorted.sort((a, b) => a.remaining - b.remaining);

        const monthDebts: { name: string; payment: number; remaining: number }[] = [];

        // Apply minimum payments + interest first
        for (const debt of working) {
            if (debt.remaining <= 0) continue;

            const monthlyRate = debt.rate / 100 / 12;
            const interest = debt.remaining * monthlyRate;
            totalInterest += interest;
            debt.remaining += interest;

            const payment = Math.min(debt.minPayment, debt.remaining);
            debt.remaining -= payment;
            totalPaid += payment;

            monthDebts.push({ name: debt.name, payment, remaining: Math.max(0, debt.remaining) });
        }

        // Apply extra payment to priority debt
        for (const priorityDebt of sorted) {
            if (extra <= 0) break;
            const actualDebt = working.find(d => d.id === priorityDebt.id)!;
            if (actualDebt.remaining <= 0) continue;

            const applied = Math.min(extra, actualDebt.remaining);
            actualDebt.remaining -= applied;
            extra -= applied;
            totalPaid += applied;

            const detail = monthDebts.find(d => d.name === actualDebt.name);
            if (detail) {
                detail.payment += applied;
                detail.remaining = Math.max(0, actualDebt.remaining);
            }
        }

        monthlyDetails.push({ month, debts: monthDebts });
    }

    return { months: month, totalInterest, totalPaid, monthlyDetails };
}

export function DebtPayoffPlanner() {
    const { prefs, loaded, setPref } = usePreferences();
    const [debts, setDebts] = useState<Debt[]>([]);
    const [strategy, setStrategy] = useState<Strategy>("avalanche");
    const [extraPayment, setExtraPayment] = useState(100);
    const [showAddForm, setShowAddForm] = useState(false);
    const [expandedView, setExpandedView] = useState(false);

    useEffect(() => {
        if (loaded && prefs.debt_plans) {
            setDebts(prefs.debt_plans.map(d => ({
                id: d.id,
                name: d.name,
                balance: d.balance,
                rate: d.apr,
                minPayment: d.minPayment,
                color: COLORS[0],
            })));
        }
    }, [loaded, prefs.debt_plans]);

    const persist = useCallback((updated: Debt[]) => {
        setDebts(updated);
        setPref("debt_plans", updated.map(d => ({
            id: d.id,
            name: d.name,
            balance: d.balance,
            apr: d.rate,
            minPayment: d.minPayment,
        })));
    }, [setPref]);

    // Add debt form state
    const [newName, setNewName] = useState("");
    const [newBalance, setNewBalance] = useState("");
    const [newRate, setNewRate] = useState("");
    const [newMinPayment, setNewMinPayment] = useState("");

    const addDebt = useCallback(() => {
        if (!newName || !newBalance) return;
        const updated = [...debts, {
            id: Date.now().toString(),
            name: newName,
            balance: parseFloat(newBalance) || 0,
            rate: parseFloat(newRate) || 0,
            minPayment: parseFloat(newMinPayment) || 25,
            color: COLORS[debts.length % COLORS.length],
        }];
        persist(updated);
        setNewName(""); setNewBalance(""); setNewRate(""); setNewMinPayment("");
        setShowAddForm(false);
    }, [debts, newName, newBalance, newRate, newMinPayment, persist]);

    const removeDebt = useCallback((id: string) => {
        persist(debts.filter(d => d.id !== id));
    }, [debts, persist]);

    const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
    const totalMinPayments = debts.reduce((s, d) => s + d.minPayment, 0);
    const avgRate = debts.length > 0
        ? debts.reduce((s, d) => s + d.rate * d.balance, 0) / totalDebt
        : 0;

    const avalancheSchedule = useMemo(() => calculatePayoff(debts, extraPayment, "avalanche"), [debts, extraPayment]);
    const snowballSchedule = useMemo(() => calculatePayoff(debts, extraPayment, "snowball"), [debts, extraPayment]);

    const activeSchedule = strategy === "avalanche" ? avalancheSchedule : snowballSchedule;
    const interestSaved = Math.max(0, snowballSchedule.totalInterest - avalancheSchedule.totalInterest);

    const debtFreeDate = useMemo(() => {
        if (activeSchedule.months === 0) return "N/A";
        const d = new Date();
        d.setMonth(d.getMonth() + activeSchedule.months);
        return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }, [activeSchedule.months]);

    return (
        <div className="glass-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <CreditCard size={16} className="text-rose-400" /> Debt Payoff Planner
                </h3>
                <button
                    type="button"
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                    <Plus size={12} /> Add Debt
                </button>
            </div>

            {/* Add Debt Form */}
            {showAddForm && (
                <div className="grid grid-cols-2 gap-3 bg-zinc-900/60 rounded-xl p-4 sm:grid-cols-4">
                    <input
                        type="text" placeholder="Name (e.g., Visa)" value={newName} onChange={e => setNewName(e.target.value)}
                        className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 col-span-2 sm:col-span-1"
                    />
                    <input
                        type="number" placeholder="Balance" value={newBalance} onChange={e => setNewBalance(e.target.value)}
                        className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600"
                    />
                    <input
                        type="number" placeholder="APR %" value={newRate} onChange={e => setNewRate(e.target.value)}
                        className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600"
                    />
                    <div className="flex gap-2">
                        <input
                            type="number" placeholder="Min $" value={newMinPayment} onChange={e => setNewMinPayment(e.target.value)}
                            className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600"
                        />
                        <button type="button" onClick={addDebt} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm transition-colors">
                            Add
                        </button>
                    </div>
                </div>
            )}

            {/* Debt list */}
            {debts.length > 0 ? (
                <>
                    <div className="space-y-2">
                        {debts.map(d => (
                            <div key={d.id} className="flex items-center justify-between rounded-lg bg-zinc-900/50 p-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                                    <div className="min-w-0">
                                        <p className="text-sm text-white truncate">{d.name}</p>
                                        <p className="text-xs text-zinc-500">{d.rate}% APR · ${d.minPayment}/mo min</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-semibold text-rose-400">${d.balance.toLocaleString()}</span>
                                    <button type="button" onClick={() => removeDebt(d.id)} className="text-zinc-600 hover:text-rose-400 transition-colors" aria-label={`Remove ${d.name}`}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="bg-zinc-900/50 rounded-lg p-3">
                            <span className="text-[10px] text-zinc-500 uppercase">Total Debt</span>
                            <p className="text-lg font-bold text-rose-400">${totalDebt.toLocaleString()}</p>
                        </div>
                        <div className="bg-zinc-900/50 rounded-lg p-3">
                            <span className="text-[10px] text-zinc-500 uppercase">Debt-Free By</span>
                            <p className="text-lg font-bold text-emerald-400">{debtFreeDate}</p>
                        </div>
                        <div className="bg-zinc-900/50 rounded-lg p-3">
                            <span className="text-[10px] text-zinc-500 uppercase">Total Interest</span>
                            <p className="text-lg font-bold text-amber-400">${activeSchedule.totalInterest.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                        </div>
                        <div className="bg-zinc-900/50 rounded-lg p-3">
                            <span className="text-[10px] text-zinc-500 uppercase">Avg Rate</span>
                            <p className="text-lg font-bold text-zinc-300">{avgRate.toFixed(1)}%</p>
                        </div>
                    </div>

                    {/* Strategy Selector */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-zinc-500">Strategy:</span>
                            <div className="flex rounded-lg bg-zinc-800 p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setStrategy("avalanche")}
                                    className={clsx("px-3 py-1 text-xs rounded-md transition-colors", strategy === "avalanche" ? "bg-zinc-700 text-white" : "text-zinc-500")}
                                >
                                    Avalanche (Highest Rate)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStrategy("snowball")}
                                    className={clsx("px-3 py-1 text-xs rounded-md transition-colors", strategy === "snowball" ? "bg-zinc-700 text-white" : "text-zinc-500")}
                                >
                                    Snowball (Lowest Balance)
                                </button>
                            </div>
                        </div>

                        {/* Extra Payment Slider */}
                        <div className="flex items-center gap-4">
                            <span className="text-xs text-zinc-500 whitespace-nowrap">Extra Monthly:</span>
                            <input
                                type="range" min={0} max={1000} step={25} value={extraPayment}
                                onChange={e => setExtraPayment(Number(e.target.value))}
                                className="flex-1 accent-blue-500"
                                aria-label="Extra monthly payment amount"
                            />
                            <span className="text-sm text-white font-medium min-w-[60px] text-right">${extraPayment}</span>
                        </div>

                        {strategy === "snowball" && interestSaved > 0 && (
                            <p className="text-xs text-amber-400">
                                💡 Avalanche would save ${interestSaved.toFixed(0)} in interest
                            </p>
                        )}
                    </div>

                    {/* Visual Timeline */}
                    <div className="space-y-2">
                        <button
                            type="button"
                            onClick={() => setExpandedView(!expandedView)}
                            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                            {expandedView ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {expandedView ? "Hide" : "Show"} Payoff Timeline
                        </button>

                        {expandedView && activeSchedule.monthlyDetails.length > 0 && (
                            <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800">
                                <table className="w-full text-xs">
                                    <thead className="bg-zinc-900 sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 text-left text-zinc-500 font-medium">Month</th>
                                            {debts.map(d => (
                                                <th key={d.id} className="px-3 py-2 text-right text-zinc-500 font-medium">{d.name}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800/50">
                                        {activeSchedule.monthlyDetails.filter((_, i) => i % 3 === 0 || i === activeSchedule.monthlyDetails.length - 1).map(m => (
                                            <tr key={m.month} className="hover:bg-zinc-800/30">
                                                <td className="px-3 py-1.5 text-zinc-400">{m.month}</td>
                                                {m.debts.map((d, i) => (
                                                    <td key={i} className={clsx("px-3 py-1.5 text-right", d.remaining === 0 ? "text-emerald-500" : "text-zinc-400")}>
                                                        {d.remaining === 0 ? "Paid!" : `$${d.remaining.toFixed(0)}`}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="text-center py-6">
                    <TrendingDown size={32} className="mx-auto text-zinc-700 mb-2" />
                    <p className="text-sm text-zinc-500">Add your debts to see payoff strategies.</p>
                    <p className="text-xs text-zinc-600 mt-1">Include credit cards, loans, and other debts.</p>
                </div>
            )}
        </div>
    );
}
