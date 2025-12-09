"use client";

import { useEffect, useState } from "react";
import { BudgetPieChart } from "@/components/BudgetPieChart";
import { BudgetHistogram } from "@/components/BudgetHistogram";
import { Target, TrendingUp, AlertTriangle, Pencil, Check, X } from "lucide-react";
import { useSync } from "@/contexts/SyncContext";
export default function BudgetPage() {
    const { transactions, forecast, isSyncing } = useSync();
    const [monthlyTarget, setMonthlyTarget] = useState<number>(0);
    const [isEditingTarget, setIsEditingTarget] = useState(false);
    const [tempTarget, setTempTarget] = useState("");
    const [spent, setSpent] = useState(0);
    const [projected, setProjected] = useState(0);
    const [topCategory, setTopCategory] = useState<{ name: string; percentage: number }>({ name: "N/A", percentage: 0 });
    const [displayTransactions, setDisplayTransactions] = useState<any[]>([]);

    // Fetch user settings (budget target)
    useEffect(() => {
        async function fetchSettings() {
            try {
                const response = await fetch('/api/settings');
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

    // ... (rest of logic) ...



    // Helper to infer category from name/merchant
    const inferCategory = (tx: any) => {
        if (tx.category && tx.category[0] && tx.category[0] !== "Uncategorized") return tx.category[0];

        const name = (tx.merchant_name || tx.name || tx.merchant || "").toLowerCase();

        if (name.includes("uber") || name.includes("lyft") || name.includes("chevron") || name.includes("shell") || name.includes("gas") || name.includes("exxon")) return "Transport";
        if (name.includes("united") || name.includes("delta") || name.includes("airbnb") || name.includes("hotel") || name.includes("flight")) return "Travel";
        if (name.includes("starbucks") || name.includes("mcdonald") || name.includes("burger") || name.includes("coffee") || name.includes("restaurant") || name.includes("food") || name.includes("cafe")) return "Food & Drink";
        if (name.includes("safeway") || name.includes("whole foods") || name.includes("trader joe") || name.includes("market") || name.includes("costco") || name.includes("grocery")) return "Groceries";
        if (name.includes("amazon") || name.includes("target") || name.includes("walmart") || name.includes("sparkfun")) return "Shopping";
        if (name.includes("netflix") || name.includes("spotify") || name.includes("hulu") || name.includes("prime") || name.includes("cinema")) return "Entertainment";
        if (name.includes("pge") || name.includes("water") || name.includes("electric") || name.includes("internet") || name.includes("at&t") || name.includes("verizon")) return "Utilities";
        if (name.includes("rent") || name.includes("mortgage") || name.includes("payment")) return "Housing";

        return "Uncategorized";
    };

    // Calculate stats from transactions + forecast
    useEffect(() => {
        if (!transactions && !forecast) return;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // 1. Actual Spent (Current Month Only)
        // Actuals are Plaid-style (Expense = Positive).
        const currentMonthTx = transactions ? transactions.filter((tx: any) => {
            const date = new Date(tx.date);
            return date.getMonth() === currentMonth &&
                date.getFullYear() === currentYear &&
                tx.amount > 0; // Filter for Expenses (Positive)
        }).map((tx: any) => ({
            ...tx,
            amount: tx.amount, // Already Positive, Keep As Is
            category: [inferCategory(tx)]
        })) : [];

        // Total Spent uses the normalized (positive) amounts
        const totalSpent = currentMonthTx.reduce((sum: number, tx: any) => sum + tx.amount, 0);
        setSpent(totalSpent);

        // 2. Forecast Transactions (Current Month)
        // Forecast is Standard-style (Expense = Negative).
        const predictedTx = (forecast?.predicted_transactions || []).filter((tx: any) => {
            const date = new Date(tx.date);
            return date.getMonth() === currentMonth &&
                date.getFullYear() === currentYear &&
                (tx.amount < 0 || tx.type === 'expense');
        }).map((tx: any) => ({
            ...tx,
            amount: Math.abs(tx.amount), // Normalize to Positive
            category: [inferCategory(tx)]
        }));

        // 3. Projected Total
        const predictedTotal = predictedTx.reduce((sum: number, tx: any) => sum + tx.amount, 0);
        const totalProjected = totalSpent + predictedTotal;
        setProjected(totalProjected);

        // 4. Combined Data for Charts (All positive magnitudes now)
        const combinedTransactions = [...currentMonthTx, ...predictedTx];
        setDisplayTransactions(combinedTransactions);

        // 5. Top Category (based on Combined)
        const categoryTotals: Record<string, number> = {};
        combinedTransactions.forEach((tx: any) => {
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
        console.log("Saving target...", tempTarget);
        const newTarget = parseFloat(tempTarget);

        if (isNaN(newTarget)) {
            console.error("Invalid target number");
            return;
        }

        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monthly_budget: newTarget })
            });

            if (response.ok) {
                console.log("Save successful");
                setMonthlyTarget(newTarget);
                setIsEditingTarget(false);
            } else {
                console.error("Failed to save budget", await response.json());
            }
        } catch (error) {
            console.error("Error saving budget:", error);
        }
    };

    const percentUsed = monthlyTarget > 0 ? Math.min(Math.round((spent / monthlyTarget) * 100), 100) : 0;
    const isOverBudget = projected > monthlyTarget && monthlyTarget > 0;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Budget Tracker</h1>
                <p className="text-zinc-400">Monitor your spending against your targets.</p>
            </div>

            {/* Top Cards */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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
                                        className="text-emerald-500 hover:text-emerald-400 p-1 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                                    >
                                        <Check size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setIsEditingTarget(false); }}
                                        className="text-rose-500 hover:text-rose-400 p-1 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2 mt-2 group-hover:bg-zinc-800/50 rounded-lg pr-2 -ml-1 pl-1 transition-colors">
                                    <p className="text-2xl font-bold text-white">
                                        ${monthlyTarget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                    <button
                                        onClick={() => {
                                            setTempTarget(monthlyTarget.toString());
                                            setIsEditingTarget(true);
                                        }}
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
                                ${projected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                            <p className="text-sm font-medium text-zinc-400">Top Category</p>
                            <p className="mt-2 text-2xl font-bold text-white truncate max-w-[150px]" title={topCategory.name}>
                                {topCategory.name}
                            </p>
                        </div>
                        <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-500">
                            <TrendingUp size={24} />
                        </div>
                    </div>
                    <p className="mt-4 text-sm text-zinc-400">
                        {topCategory.name} accounts for {topCategory.percentage}% of your total spend.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Category Breakdown */}
                <div className="glass-card rounded-2xl p-6">
                    <h2 className="mb-6 text-lg font-semibold text-white">Category Breakdown</h2>
                    <BudgetPieChart transactions={displayTransactions} />
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
                    {/* Pass combined transactions + raw history to Histogram if needed, but Histogram filters internally. 
                        We need to update Histogram logic too if we want it to use this combined data,
                        OR we pass displayTransactions to it. 
                        Let's check BudgetHistogram props. It currently takes no props and uses useSync. 
                        We should update it to take props like PieChart.
                     */}
                    <BudgetHistogram transactions={displayTransactions} />
                </div>
            </div>
        </div>
    );
}
