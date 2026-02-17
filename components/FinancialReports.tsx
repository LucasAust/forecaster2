"use client";

import { useMemo, useState, useCallback } from "react";
import { useSync } from "@/contexts/SyncContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { inferCategory, CATEGORY_COLORS } from "@/lib/categories";
import { getDisplayMerchant } from "@/lib/merchants";
import { FileText, Download, RefreshCw, Sparkles, Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { clsx } from "clsx";

type ReportPeriod = "week" | "month";

interface ReportData {
    period: string;
    periodLabel: string;
    totalIncome: number;
    totalExpenses: number;
    netCashflow: number;
    byCategory: { category: string; amount: number; pct: number }[];
    topMerchants: { merchant: string; amount: number }[];
    avgDailySpend: number;
    daysCount: number;
    prevTotalExpenses: number;
    prevTotalIncome: number;
}

export function FinancialReports() {
    const { transactions, forecast, balance } = useSync();
    const { prefs } = usePreferences();
    const [period, setPeriod] = useState<ReportPeriod>("month");
    const [aiCommentary, setAiCommentary] = useState<string>("");
    const [loadingAI, setLoadingAI] = useState(false);

    const report = useMemo((): ReportData | null => {
        if (!transactions?.length) return null;

        const now = new Date();
        let startDate: Date;
        let endDate = now;
        let prevStart: Date;
        let prevEnd: Date;
        let periodLabel: string;

        if (period === "week") {
            const dayOfWeek = now.getDay();
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
            prevEnd = new Date(startDate.getTime() - 1);
            prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() - 6);
            periodLabel = `Week of ${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
            periodLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        }

        const startStr = startDate.toISOString().split("T")[0];
        const endStr = endDate.toISOString().split("T")[0];
        const prevStartStr = prevStart.toISOString().split("T")[0];
        const prevEndStr = prevEnd.toISOString().split("T")[0];

        let totalIncome = 0;
        let totalExpenses = 0;
        let prevTotalIncome = 0;
        let prevTotalExpenses = 0;
        const catTotals: Record<string, number> = {};
        const merchantTotals: Record<string, number> = {};

        for (const tx of transactions) {
            const d = tx.date || tx.authorized_date;
            if (!d) continue;

            // Current period
            if (d >= startStr && d <= endStr) {
                if (tx.amount > 0) {
                    totalExpenses += tx.amount;
                    const cat = inferCategory(tx);
                    catTotals[cat] = (catTotals[cat] || 0) + tx.amount;
                    const merchant = getDisplayMerchant(tx);
                    merchantTotals[merchant] = (merchantTotals[merchant] || 0) + tx.amount;
                } else {
                    totalIncome += Math.abs(tx.amount);
                }
            }

            // Previous period
            if (d >= prevStartStr && d <= prevEndStr) {
                if (tx.amount > 0) prevTotalExpenses += tx.amount;
                else prevTotalIncome += Math.abs(tx.amount);
            }
        }

        const byCategory = Object.entries(catTotals)
            .map(([category, amount]) => ({
                category,
                amount,
                pct: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
            }))
            .sort((a, b) => b.amount - a.amount);

        const topMerchants = Object.entries(merchantTotals)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([merchant, amount]) => ({ merchant, amount }));

        const daysCount = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

        return {
            period: period,
            periodLabel,
            totalIncome,
            totalExpenses,
            netCashflow: totalIncome - totalExpenses,
            byCategory,
            topMerchants,
            avgDailySpend: totalExpenses / daysCount,
            daysCount,
            prevTotalExpenses,
            prevTotalIncome,
        };
    }, [transactions, period]);

    const budgetLimits = useMemo(() => {
        const map: Record<string, number> = {};
        for (const l of prefs.category_limits || []) map[l.category] = l.limit;
        return map;
    }, [prefs.category_limits]);

    const budgetAdherence = useMemo(() => {
        if (!report) return [];
        return report.byCategory
            .filter(c => budgetLimits[c.category])
            .map(c => ({
                category: c.category,
                spent: c.amount,
                limit: budgetLimits[c.category],
                pct: (c.amount / budgetLimits[c.category]) * 100,
                over: c.amount > budgetLimits[c.category],
            }));
    }, [report, budgetLimits]);

    const getAICommentary = useCallback(async () => {
        if (!report) return;
        setLoadingAI(true);
        try {
            const summary = [
                `Period: ${report.periodLabel}`,
                `Total Income: $${report.totalIncome.toFixed(0)}`,
                `Total Spending: $${report.totalExpenses.toFixed(0)}`,
                `Net: ${report.netCashflow >= 0 ? "+" : ""}$${report.netCashflow.toFixed(0)}`,
                `Top categories: ${report.byCategory.slice(0, 5).map(c => `${c.category}: $${c.amount.toFixed(0)}`).join(", ")}`,
                `Previous period spending: $${report.prevTotalExpenses.toFixed(0)}`,
            ].join(". ");

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{
                        role: "user",
                        content: `You are a financial report analyst. Write a brief (3-4 sentences) commentary for this financial summary. Be specific, mention numbers, and give one actionable tip. ${summary}`
                    }]
                })
            });

            if (res.ok) {
                const data = await res.json();
                setAiCommentary(data.response || data.message || "");
            }
        } catch (e) {
            console.error("Failed to get AI commentary:", e);
        }
        setLoadingAI(false);
    }, [report]);

    const exportReport = useCallback(() => {
        if (!report) return;

        const lines = [
            `FINANCIAL REPORT — ${report.periodLabel}`,
            `${"=".repeat(50)}`,
            ``,
            `SUMMARY`,
            `Total Income:     $${report.totalIncome.toFixed(2)}`,
            `Total Expenses:   $${report.totalExpenses.toFixed(2)}`,
            `Net Cash Flow:    ${report.netCashflow >= 0 ? "+" : ""}$${report.netCashflow.toFixed(2)}`,
            `Avg Daily Spend:  $${report.avgDailySpend.toFixed(2)}`,
            ``,
            `SPENDING BY CATEGORY`,
            ...report.byCategory.map(c => `  ${c.category.padEnd(20)} $${c.amount.toFixed(2).padStart(10)}  (${c.pct.toFixed(1)}%)`),
            ``,
            `TOP MERCHANTS`,
            ...report.topMerchants.map((m, i) => `  ${i + 1}. ${m.merchant.padEnd(25)} $${m.amount.toFixed(2)}`),
            ``,
            `BUDGET ADHERENCE`,
            ...(budgetAdherence.length > 0
                ? budgetAdherence.map(b => `  ${b.category.padEnd(20)} $${b.spent.toFixed(0)}/$${b.limit} (${b.pct.toFixed(0)}%) ${b.over ? "⚠ OVER" : "✓"}`)
                : ["  No budget limits set"]),
            ``,
            ...(aiCommentary ? [`AI COMMENTARY`, aiCommentary, ``] : []),
            `Generated: ${new Date().toLocaleString()}`,
        ];

        const blob = new Blob([lines.join("\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `financial-report-${report.periodLabel.replace(/\s+/g, "-").toLowerCase()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }, [report, budgetAdherence, aiCommentary]);

    if (!report) {
        return (
            <div className="glass-card rounded-2xl p-6 text-center">
                <FileText size={24} className="mx-auto text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-500">No data available to generate reports.</p>
            </div>
        );
    }

    const expenseChange = report.prevTotalExpenses > 0
        ? ((report.totalExpenses - report.prevTotalExpenses) / report.prevTotalExpenses) * 100
        : 0;

    return (
        <div className="glass-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <FileText size={16} className="text-blue-400" /> Financial Report
                </h3>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg bg-zinc-800 p-0.5">
                        {(["week", "month"] as const).map(p => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => setPeriod(p)}
                                className={clsx(
                                    "px-3 py-1 text-xs rounded-md transition-colors",
                                    period === p ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                {p === "week" ? "Weekly" : "Monthly"}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={exportReport}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white text-xs transition-colors"
                    >
                        <Download size={12} /> Export
                    </button>
                </div>
            </div>

            <p className="text-sm text-zinc-400">{report.periodLabel}</p>

            {/* Summary Row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="bg-zinc-900/50 rounded-lg p-3">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Income</span>
                    <p className="text-lg font-bold text-emerald-400">${report.totalIncome.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-3">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Expenses</span>
                    <p className="text-lg font-bold text-rose-400">${report.totalExpenses.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-3">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Net</span>
                    <p className={clsx("text-lg font-bold", report.netCashflow >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {report.netCashflow >= 0 ? "+" : ""}${report.netCashflow.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </p>
                </div>
                <div className="bg-zinc-900/50 rounded-lg p-3">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide">vs Previous</span>
                    <div className="flex items-center gap-1">
                        {expenseChange > 5 ? <TrendingUp size={14} className="text-rose-400" /> : expenseChange < -5 ? <TrendingDown size={14} className="text-emerald-400" /> : <Minus size={14} className="text-zinc-500" />}
                        <p className={clsx("text-lg font-bold", expenseChange > 5 ? "text-rose-400" : expenseChange < -5 ? "text-emerald-400" : "text-zinc-400")}>
                            {expenseChange >= 0 ? "+" : ""}{expenseChange.toFixed(0)}%
                        </p>
                    </div>
                </div>
            </div>

            {/* Category Breakdown */}
            <div className="space-y-2">
                <h4 className="text-xs text-zinc-500 uppercase tracking-wide">Spending by Category</h4>
                {report.byCategory.slice(0, 8).map(c => {
                    const color = CATEGORY_COLORS[c.category] || "#71717a";
                    return (
                        <div key={c.category} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2 text-zinc-300">
                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                    {c.category}
                                </span>
                                <span className="text-zinc-400">${c.amount.toFixed(0)} <span className="text-zinc-600">({c.pct.toFixed(0)}%)</span></span>
                            </div>
                            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${c.pct}%`, backgroundColor: color }} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Budget Adherence */}
            {budgetAdherence.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-xs text-zinc-500 uppercase tracking-wide">Budget Adherence</h4>
                    {budgetAdherence.map(b => (
                        <div key={b.category} className="flex items-center justify-between text-sm">
                            <span className="text-zinc-300">{b.category}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-zinc-400">${b.spent.toFixed(0)} / ${b.limit}</span>
                                <span className={clsx(
                                    "text-xs font-medium px-1.5 py-0.5 rounded",
                                    b.over ? "bg-rose-900/30 text-rose-400" : b.pct > 80 ? "bg-amber-900/30 text-amber-400" : "bg-emerald-900/30 text-emerald-400"
                                )}>
                                    {b.pct.toFixed(0)}%
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* AI Commentary */}
            <div className="border-t border-zinc-800 pt-3">
                {!aiCommentary ? (
                    <button
                        type="button"
                        onClick={getAICommentary}
                        disabled={loadingAI}
                        className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                    >
                        {loadingAI ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {loadingAI ? "Generating commentary..." : "Get AI Commentary"}
                    </button>
                ) : (
                    <div className="space-y-2">
                        <h4 className="text-xs text-zinc-500 uppercase tracking-wide flex items-center gap-1">
                            <Sparkles size={10} /> AI Commentary
                        </h4>
                        <p className="text-sm text-zinc-400 leading-relaxed">{aiCommentary}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
