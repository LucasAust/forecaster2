"use client";

import { useMemo } from "react";
import { useSync } from "@/contexts/SyncContext";
import { inferCategory, CATEGORY_COLORS } from "@/lib/categories";
import { getDisplayMerchant } from "@/lib/merchants";
import { TrendingUp, TrendingDown, Minus, DollarSign, ShoppingBag, Calendar, BarChart3 } from "lucide-react";
import { clsx } from "clsx";

interface MonthData {
    month: string;
    label: string;
    total: number;
    income: number;
    byCategory: Record<string, number>;
    byMerchant: Record<string, number>;
    dailyTotals: number[];
}

export function SpendingInsights() {
    const { transactions } = useSync();

    const insights = useMemo(() => {
        if (!transactions?.length) return null;

        const now = new Date();
        const monthsData: MonthData[] = [];

        // Gather last 3 months of data
        for (let m = 0; m < 3; m++) {
            const targetMonth = new Date(now.getFullYear(), now.getMonth() - m, 1);
            const monthKey = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, "0")}`;
            const label = targetMonth.toLocaleDateString("en-US", { month: "short", year: "numeric" });
            const daysInMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();

            const data: MonthData = { month: monthKey, label, total: 0, income: 0, byCategory: {}, byMerchant: {}, dailyTotals: new Array(daysInMonth).fill(0) };

            for (const tx of transactions) {
                const d = tx.date || tx.authorized_date;
                if (!d || !d.startsWith(monthKey)) continue;
                
                if (tx.amount > 0) {
                    // Expense (Plaid convention)
                    data.total += tx.amount;
                    const cat = inferCategory(tx);
                    data.byCategory[cat] = (data.byCategory[cat] || 0) + tx.amount;
                    const merchant = getDisplayMerchant(tx);
                    data.byMerchant[merchant] = (data.byMerchant[merchant] || 0) + tx.amount;
                    const dayIndex = new Date(d).getDate() - 1;
                    if (dayIndex >= 0 && dayIndex < data.dailyTotals.length) {
                        data.dailyTotals[dayIndex] += tx.amount;
                    }
                } else {
                    data.income += Math.abs(tx.amount);
                }
            }

            monthsData.push(data);
        }

        const current = monthsData[0];
        const previous = monthsData[1];
        const twoMonthsAgo = monthsData[2];

        // Top 5 merchants (current month)
        const topMerchants = Object.entries(current.byMerchant)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

        // Category comparison (current vs previous)
        const catComparison = Object.entries(current.byCategory)
            .map(([cat, amt]) => ({
                category: cat,
                current: amt,
                previous: previous.byCategory[cat] || 0,
                change: previous.byCategory[cat] ? ((amt - previous.byCategory[cat]) / previous.byCategory[cat]) * 100 : 100,
            }))
            .sort((a, b) => b.current - a.current);

        // Average daily spend
        const daysElapsed = Math.min(now.getDate(), current.dailyTotals.length);
        const avgDaily = daysElapsed > 0 ? current.total / daysElapsed : 0;

        // Income vs expenses ratio
        const incomeExpenseRatio = current.income > 0 ? current.total / current.income : 0;

        // MoM spending change
        const momChange = previous.total > 0 ? ((current.total - previous.total) / previous.total) * 100 : 0;

        // Spending personality
        const weekdaySpend = current.dailyTotals.reduce((sum, val, i) => {
            const dayOfWeek = new Date(now.getFullYear(), now.getMonth(), i + 1).getDay();
            return dayOfWeek >= 1 && dayOfWeek <= 5 ? sum + val : sum;
        }, 0);
        const weekendSpend = current.dailyTotals.reduce((sum, val, i) => {
            const dayOfWeek = new Date(now.getFullYear(), now.getMonth(), i + 1).getDay();
            return dayOfWeek === 0 || dayOfWeek === 6 ? sum + val : sum;
        }, 0);

        const topCat = catComparison[0];
        const fastestGrowing = catComparison.filter(c => c.previous > 10).sort((a, b) => b.change - a.change)[0];

        const personalityTraits: string[] = [];
        if (weekendSpend > weekdaySpend * 0.6) personalityTraits.push("You spend more on weekends");
        if (topCat) personalityTraits.push(`Your top category is ${topCat.category}`);
        if (fastestGrowing && fastestGrowing.change > 15)
            personalityTraits.push(`${fastestGrowing.category} grew ${fastestGrowing.change.toFixed(0)}% this month`);
        if (incomeExpenseRatio < 0.5) personalityTraits.push("Great savings rate — spending well under income");
        else if (incomeExpenseRatio > 0.9) personalityTraits.push("Spending nearly matches income — watch out!");

        return {
            current, previous, twoMonthsAgo,
            topMerchants, catComparison,
            avgDaily, incomeExpenseRatio, momChange,
            weekdaySpend, weekendSpend,
            personalityTraits,
            months: monthsData,
        };
    }, [transactions]);

    if (!insights) {
        return (
            <div className="glass-card rounded-2xl p-6 text-center text-zinc-500">
                <p className="text-sm">No transaction data available for insights.</p>
            </div>
        );
    }

    const { current, previous, topMerchants, catComparison, avgDaily, incomeExpenseRatio, momChange, personalityTraits } = insights;

    return (
        <div className="space-y-6">
            {/* Summary Cards Row */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <InsightCard
                    icon={<DollarSign size={16} />}
                    label="Avg Daily Spend"
                    value={`$${avgDaily.toFixed(0)}`}
                    color="text-blue-400"
                />
                <InsightCard
                    icon={<BarChart3 size={16} />}
                    label="Month-over-Month"
                    value={`${momChange >= 0 ? "+" : ""}${momChange.toFixed(1)}%`}
                    color={momChange <= 0 ? "text-emerald-400" : "text-rose-400"}
                    trend={momChange}
                />
                <InsightCard
                    icon={<ShoppingBag size={16} />}
                    label="Income:Expense"
                    value={`${(incomeExpenseRatio * 100).toFixed(0)}%`}
                    color={incomeExpenseRatio < 0.8 ? "text-emerald-400" : "text-amber-400"}
                />
                <InsightCard
                    icon={<Calendar size={16} />}
                    label="This Month"
                    value={`$${current.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                    color="text-zinc-300"
                />
            </div>

            {/* Two column layout */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Top Merchants */}
                <div className="glass-card rounded-2xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <ShoppingBag size={14} className="text-violet-400" /> Top Merchants
                    </h3>
                    <div className="space-y-2">
                        {topMerchants.map(([merchant, amt], i) => {
                            const pct = current.total > 0 ? (amt / current.total) * 100 : 0;
                            return (
                                <div key={merchant} className="space-y-1">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-zinc-300 truncate">{i + 1}. {merchant}</span>
                                        <span className="text-zinc-400">${amt.toFixed(0)} <span className="text-zinc-600">({pct.toFixed(0)}%)</span></span>
                                    </div>
                                    <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                                        <div className="h-full rounded-full bg-violet-500/60" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                        {topMerchants.length === 0 && <p className="text-xs text-zinc-500">No spending data yet</p>}
                    </div>
                </div>

                {/* Category Comparison */}
                <div className="glass-card rounded-2xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <TrendingUp size={14} className="text-cyan-400" /> Category Trends
                    </h3>
                    <div className="space-y-2">
                        {catComparison.slice(0, 6).map(({ category, current: cur, previous: prev, change }) => {
                            const color = CATEGORY_COLORS[category] || "#71717a";
                            return (
                                <div key={category} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                        <span className="text-sm text-zinc-300 truncate">{category}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm text-zinc-400">${cur.toFixed(0)}</span>
                                        {prev > 0 && (
                                            <span className={clsx(
                                                "flex items-center gap-0.5 text-xs font-medium",
                                                change > 5 ? "text-rose-400" : change < -5 ? "text-emerald-400" : "text-zinc-500"
                                            )}>
                                                {change > 5 ? <TrendingUp size={10} /> : change < -5 ? <TrendingDown size={10} /> : <Minus size={10} />}
                                                {Math.abs(change).toFixed(0)}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Spending Personality */}
            {personalityTraits.length > 0 && (
                <div className="glass-card rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-3">Spending Personality</h3>
                    <div className="flex flex-wrap gap-2">
                        {personalityTraits.map((trait, i) => (
                            <span key={i} className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 border border-zinc-700">
                                {trait}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Month Comparison Bar */}
            <div className="glass-card rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white">Monthly Comparison</h3>
                <div className="space-y-2">
                    {insights.months.slice().reverse().map((m) => {
                        const maxSpend = Math.max(...insights.months.map(x => x.total), 1);
                        const pct = (m.total / maxSpend) * 100;
                        return (
                            <div key={m.month} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-400">{m.label}</span>
                                    <span className="text-zinc-300 font-medium">${m.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                                </div>
                                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function InsightCard({ icon, label, value, color, trend }: { icon: React.ReactNode; label: string; value: string; color: string; trend?: number }) {
    return (
        <div className="glass-card rounded-xl p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-500">
                {icon}
                <span className="text-xs">{label}</span>
            </div>
            <div className={clsx("text-lg font-bold", color)}>
                {value}
            </div>
        </div>
    );
}
