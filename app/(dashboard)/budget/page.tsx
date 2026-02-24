"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CategoryProgressRings } from "@/components/CategoryProgressRings";
import { Target, TrendingUp, AlertTriangle, Pencil, Check, X, CheckCircle2, AlertCircle } from "lucide-react";
import { useSync } from "@/contexts/SyncContext";
import { authFetch } from "@/lib/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageTransition, CountUp } from "@/components/MotionWrappers";
import { inferCategory } from "@/lib/categories";
import { CategoryBudgets } from "@/components/CategoryBudgets";
import { SkeletonCard } from "@/components/Skeleton";
import type { Transaction } from "@/types";

/** Budget page uses a normalized shape where category is always string[] and amount is always positive */
type BudgetTransaction = Transaction & { category: string[] };

// Lazy-load chart-heavy and below-fold components
const BudgetPieChart = dynamic(() => import("@/components/BudgetPieChart").then(m => ({ default: m.BudgetPieChart })), { loading: () => <div className="h-64 animate-pulse rounded-xl bg-zinc-800/50" /> });
const BudgetHistogram = dynamic(() => import("@/components/BudgetHistogram").then(m => ({ default: m.BudgetHistogram })), { loading: () => <div className="h-64 animate-pulse rounded-xl bg-zinc-800/50" /> });
const SpendingHeatmap = dynamic(() => import("@/components/SpendingHeatmap").then(m => ({ default: m.SpendingHeatmap })), { loading: () => <div className="h-32 animate-pulse rounded-xl bg-zinc-800/50" /> });
const SpendingInsights = dynamic(() => import("@/components/SpendingInsights").then(m => ({ default: m.SpendingInsights })), { loading: () => <div className="h-40 glass-card rounded-2xl animate-pulse" /> });
const SubscriptionManager = dynamic(() => import("@/components/SubscriptionManager").then(m => ({ default: m.SubscriptionManager })), { loading: () => <div className="h-40 glass-card rounded-2xl animate-pulse" /> });
const AIBudgetRecommendations = dynamic(() => import("@/components/AIBudgetRecommendations").then(m => ({ default: m.AIBudgetRecommendations })), { loading: () => <div className="h-40 glass-card rounded-2xl animate-pulse" /> });
const FinancialReports = dynamic(() => import("@/components/FinancialReports").then(m => ({ default: m.FinancialReports })), { loading: () => <div className="h-40 glass-card rounded-2xl animate-pulse" /> });
export default function BudgetPage() {
    const { transactions, forecast, isSyncing, loadingStage } = useSync();
    const [monthlyTarget, setMonthlyTarget] = useState<number>(0);
    const [isEditingTarget, setIsEditingTarget] = useState(false);
    const [tempTarget, setTempTarget] = useState("");
    const [spent, setSpent] = useState(0);
    const [projected, setProjected] = useState(0);
    const [topCategory, setTopCategory] = useState<{ name: string; percentage: number }>({ name: "N/A", percentage: 0 });
    const [displayTransactions, setDisplayTransactions] = useState<BudgetTransaction[]>([]);

    // Fetch user settings (budget target)
    useEffect(() => {
        async function fetchSettings() {
            try {
                const response = await authFetch('/api/settings');
                if (response.ok) {
                    const data = await response.json();
                    if (data.monthly_budget !== undefined) {
                        setMonthlyTarget(data.monthly_budget);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch settings:", error);
            }
        }
        fetchSettings();
    }, []);

    // Calculate stats from transactions + forecast
    useEffect(() => {
        if (!transactions && !forecast) return;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // 1. Actual Spent (Current Month Only)
        // Actuals are Plaid-style (Expense = Positive).
        // Exclude Transfer-category transactions (CC payments, loan payments, savings
        // transfers) — these double-count spending that already appears as individual charges.
        const currentMonthTx = transactions ? transactions.filter((tx) => {
            const date = new Date(tx.date);
            const isCurrentMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear;
            const isExpense = tx.amount > 0;
            const category = inferCategory(tx);
            const isTransfer = category === "Transfer";
            return isCurrentMonth && isExpense && !isTransfer;
        }).map((tx) => ({
            ...tx,
            amount: tx.amount, // Already Positive, Keep As Is
            category: [inferCategory(tx)]
        })) : [];

        // Total Spent uses the normalized (positive) amounts
        const totalSpent = currentMonthTx.reduce((sum: number, tx) => sum + tx.amount, 0);
        setSpent(totalSpent);

        // 2. Forecast Transactions (Current Month)
        // Forecast is Standard-style (Expense = Negative).
        // Also exclude Transfer-category predictions (shouldn't be generated, but defensive).
        const predictedTx = (forecast?.predicted_transactions || []).filter((tx) => {
            const date = new Date(tx.date);
            const isCurrentMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear;
            const isExpense = tx.amount < 0 || tx.type === 'expense';
            const isTransfer = inferCategory(tx) === "Transfer";
            return isCurrentMonth && isExpense && !isTransfer;
        }).map((tx) => ({
            ...tx,
            amount: Math.abs(tx.amount), // Normalize to Positive
            category: [inferCategory(tx)]
        }));

        // 3. Projected Total
        const predictedTotal = predictedTx.reduce((sum: number, tx) => sum + tx.amount, 0);
        const totalProjected = totalSpent + predictedTotal;
        setProjected(totalProjected);

        // 4. Combined Data for Charts (All positive magnitudes now)
        const combinedTransactions = [...currentMonthTx, ...predictedTx];
        setDisplayTransactions(combinedTransactions as BudgetTransaction[]);

        // 5. Top Category (based on Combined)
        const categoryTotals: Record<string, number> = {};
        combinedTransactions.forEach((tx) => {
            const cat = (tx.category && tx.category[0]) || tx.category || "Uncategorized";
            categoryTotals[cat] = (categoryTotals[cat] || 0) + tx.amount;
        });

        let topCat = "N/A";
        let maxAmount = 0;

        Object.entries(categoryTotals).forEach(([cat, amount]) => {
            if (amount > maxAmount) {
                maxAmount = amount;
                topCat = cat;
            }
        });

        setTopCategory({
            name: topCat,
            percentage: totalProjected > 0 ? Math.round((maxAmount / totalProjected) * 100) : 0
        });

    }, [transactions, forecast]);

    const handleSaveTarget = async () => {
        const newTarget = parseFloat(tempTarget);
        if (isNaN(newTarget) || newTarget < 0) return;

        try {
            const response = await authFetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monthly_budget: newTarget })
            });

            if (response.ok) {
                setMonthlyTarget(newTarget);
                setIsEditingTarget(false);
            }
        } catch {
            // non-critical — target remains at previous value
        }
    };

    const percentUsed = monthlyTarget > 0 ? Math.min(Math.round((spent / monthlyTarget) * 100), 100) : 0;
    const projectedPercent = monthlyTarget > 0 ? Math.round((projected / monthlyTarget) * 100) : 0;
    const isOverBudget = projected > monthlyTarget && monthlyTarget > 0;

    // Budget health status
    const budgetHealth: { label: string; color: string; bg: string; icon: typeof CheckCircle2 } =
        projectedPercent < 70
            ? { label: "Healthy", color: "text-emerald-400", bg: "bg-emerald-500/10", icon: CheckCircle2 }
            : projectedPercent < 95
            ? { label: "Caution", color: "text-amber-400", bg: "bg-amber-500/10", icon: AlertCircle }
            : { label: "Over Budget", color: "text-rose-400", bg: "bg-rose-500/10", icon: AlertTriangle };

    return (
        <PageTransition className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Budget Tracker</h1>
                <p className="text-zinc-400">Monitor your spending against your targets.</p>
            </div>

            {/* Top Cards */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {(loadingStage === 'transactions' || loadingStage === 'forecast') && transactions.length === 0 ? (
                    <>
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </>
                ) : (
                <>
                {/* Monthly Target Card */}
                <div className="glass-card rounded-2xl p-6 relative group">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-zinc-400">Monthly Target</p>
                            {isEditingTarget ? (
                                <div className="flex items-center mt-2 space-x-2 relative z-50">
                                    <input
                                        type="number"
                                        autoFocus
                                        aria-label="Monthly budget target"
                                        className="bg-zinc-800 text-white p-1 rounded w-24 border border-zinc-700 focus:outline-none focus:border-blue-500"
                                        value={tempTarget}
                                        onChange={(e) => setTempTarget(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveTarget();
                                            if (e.key === 'Escape') setIsEditingTarget(false);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleSaveTarget(); }}
                                        aria-label="Save budget target"
                                        className="text-emerald-500 hover:text-emerald-400 p-1 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                                    >
                                        <Check size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setIsEditingTarget(false); }}
                                        aria-label="Cancel editing"
                                        className="text-rose-500 hover:text-rose-400 p-1 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2 mt-2 group-hover:bg-zinc-800/50 rounded-lg pr-2 -ml-1 pl-1 transition-colors">
                                    <p className="text-2xl font-bold text-white">
                                        <CountUp value={monthlyTarget} prefix="$" decimals={2} />
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTempTarget(monthlyTarget.toString());
                                            setIsEditingTarget(true);
                                        }}
                                        aria-label="Edit budget target"
                                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-blue-400 transition-opacity"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="rounded-full bg-blue-500/10 p-3 text-blue-500">
                            <Target size={24} />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between text-xs text-zinc-400 mb-1">
                            <span>Spent: ${spent.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                            <span>{percentUsed}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${percentUsed >= 100 ? 'bg-rose-500' : 'bg-blue-500'}`}
                                style={{ width: `${percentUsed}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                {/* Projected Spend Card */}
                <div className="glass-card rounded-2xl p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-zinc-400">Projected Spend</p>
                            <p className="mt-2 text-2xl font-bold text-white">
                                <CountUp value={projected} prefix="$" decimals={2} />
                            </p>
                        </div>
                        <div className={`rounded-full p-3 ${isOverBudget ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                            {isOverBudget ? <AlertTriangle size={24} /> : <Target size={24} />}
                        </div>
                    </div>
                    <p className={`mt-4 text-sm ${isOverBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isOverBudget
                            ? `You are projected to exceed your budget by $${(projected - monthlyTarget).toLocaleString('en-US', { maximumFractionDigits: 0 })}.`
                            : `You are on track to stay under budget.`}
                    </p>
                </div>

                {/* Top Category Card */}
                <div className="glass-card rounded-2xl p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-zinc-400">Budget Health</p>
                            <div className="flex items-center gap-2 mt-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${budgetHealth.bg} ${budgetHealth.color}`}>
                                    <budgetHealth.icon size={12} />
                                    {budgetHealth.label}
                                </span>
                            </div>
                        </div>
                        <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-500">
                            <TrendingUp size={24} />
                        </div>
                    </div>
                    <div className="mt-4">
                        <p className="text-sm text-zinc-400">
                            Top category: <span className="text-white font-medium">{topCategory.name}</span> ({topCategory.percentage}%)
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                            {monthlyTarget > 0
                                ? `${projectedPercent}% of budget projected to be used`
                                : "Set a monthly target to track your budget health"}
                        </p>
                    </div>
                </div>
                </>
                )}
            </div>

            {/* Category Progress Rings */}
            <div className="glass-card rounded-2xl p-6">
                <h2 className="mb-6 text-lg font-semibold text-white">Category Budgets</h2>
                <ErrorBoundary fallbackTitle="Category rings failed to load">
                    <CategoryProgressRings transactions={displayTransactions} monthlyTarget={monthlyTarget} />
                </ErrorBoundary>
            </div>

            {/* Per-Category Limits */}
            <div className="glass-card rounded-2xl p-6">
                <h2 className="mb-4 text-lg font-semibold text-white">Category Spending Limits</h2>
                <p className="text-xs text-zinc-500 mb-4">Set individual limits per category. Click the edit icon to add a limit.</p>
                <ErrorBoundary fallbackTitle="Category limits failed to load">
                    <CategoryBudgets />
                </ErrorBoundary>
            </div>

            {/* AI Budget Recommendations */}
            <ErrorBoundary fallbackTitle="AI recommendations failed to load">
                <AIBudgetRecommendations />
            </ErrorBoundary>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Category Breakdown */}
                <div className="glass-card rounded-2xl p-6">
                    <h2 className="mb-6 text-lg font-semibold text-white">Category Breakdown</h2>
                    <ErrorBoundary fallbackTitle="Pie chart failed to load">
                        <BudgetPieChart transactions={displayTransactions} />
                    </ErrorBoundary>
                </div>

                {/* Month over Month */}
                <div className="glass-card rounded-2xl p-6">
                    <h2 className="mb-6 text-lg font-semibold text-white">Monthly Comparison</h2>
                    <div className="flex items-center justify-end space-x-4 mb-4 text-xs">
                        <div className="flex items-center">
                            <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                            <span className="text-zinc-400">This Month (Forecast)</span>
                        </div>
                        <div className="flex items-center">
                            <div className="w-3 h-3 rounded-full bg-zinc-700 mr-2"></div>
                            <span className="text-zinc-400">Last Month</span>
                        </div>
                    </div>
                    <ErrorBoundary fallbackTitle="Histogram failed to load">
                        <BudgetHistogram transactions={displayTransactions} />
                    </ErrorBoundary>
                </div>
            </div>

            {/* Spending Heatmap */}
            <div className="glass-card rounded-2xl p-6">
                <h2 className="mb-4 text-lg font-semibold text-white">Daily Spending Heatmap</h2>
                <ErrorBoundary fallbackTitle="Heatmap failed to load">
                    <SpendingHeatmap transactions={displayTransactions} />
                </ErrorBoundary>
            </div>

            {/* Spending Insights & Analytics */}
            <div>
                <h2 className="mb-4 text-lg font-semibold text-white">Spending Insights</h2>
                <ErrorBoundary fallbackTitle="Spending insights failed to load">
                    <SpendingInsights />
                </ErrorBoundary>
            </div>

            {/* Subscription Manager */}
            <div>
                <h2 className="mb-4 text-lg font-semibold text-white">Subscriptions</h2>
                <ErrorBoundary fallbackTitle="Subscription manager failed to load">
                    <SubscriptionManager />
                </ErrorBoundary>
            </div>

            {/* Financial Reports */}
            <ErrorBoundary fallbackTitle="Financial reports failed to load">
                <FinancialReports />
            </ErrorBoundary>
        </PageTransition>
    );
}
