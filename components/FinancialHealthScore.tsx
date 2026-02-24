"use client";

import { useMemo } from "react";
import { useSync } from "@/contexts/SyncContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { inferCategory } from "@/lib/categories";
import { TrendingUp, TrendingDown, Shield, PiggyBank, CreditCard, Wallet } from "lucide-react";
import { SkeletonHealthScore } from "@/components/Skeleton";
import type { Transaction, PlaidAccount } from "@/types";

interface SubScore {
    label: string;
    score: number; // 0-25 each
    maxScore: number;
    icon: React.ReactNode;
    detail: string;
}

function getScoreLabel(score: number): { label: string; color: string } {
    if (score >= 80) return { label: "Excellent", color: "text-emerald-400" };
    if (score >= 65) return { label: "Good", color: "text-green-400" };
    if (score >= 50) return { label: "Fair", color: "text-amber-400" };
    if (score >= 35) return { label: "Needs Work", color: "text-orange-400" };
    return { label: "Needs Attention", color: "text-rose-400" };
}

function getScoreColor(score: number): string {
    if (score >= 80) return "#34d399";
    if (score >= 65) return "#4ade80";
    if (score >= 50) return "#fbbf24";
    if (score >= 35) return "#fb923c";
    return "#f87171";
}

/** SVG gauge arc from startAngle to endAngle (degrees, 0 = top) */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const rad = (a: number) => ((a - 90) * Math.PI) / 180;
    const start = { x: cx + r * Math.cos(rad(endAngle)), y: cy + r * Math.sin(rad(endAngle)) };
    const end = { x: cx + r * Math.cos(rad(startAngle)), y: cy + r * Math.sin(rad(startAngle)) };
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function FinancialHealthScore() {
    const { transactions, balance, accounts, loadingStage } = useSync();
    const { prefs } = usePreferences();

    const { totalScore, subScores } = useMemo(() => {
        if (!transactions?.length) {
            return { totalScore: 0, subScores: [] as SubScore[] };
        }

        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

        // Filter actual transactions (not predicted)
        const actual = transactions.filter((tx) => !tx.isPredicted && tx.date);

        // This month's numbers
        const thisMonthTxns = actual.filter((tx) => new Date(tx.date) >= thisMonth);
        const income = thisMonthTxns.filter((tx) => tx.amount < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0);
        const expenses = thisMonthTxns.filter((tx) => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0);

        // If no income yet this month, check last month
        const lastMonthTxns = actual.filter((tx) => {
            const d = new Date(tx.date);
            return d >= lastMonth && d < thisMonth;
        });
        const lastIncome = lastMonthTxns.filter((tx) => tx.amount < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0);
        const lastExpenses = lastMonthTxns.filter((tx) => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0);

        const effectiveIncome = income > 0 ? income : lastIncome;
        const effectiveExpenses = expenses > 0 ? expenses : lastExpenses;

        // --- 1. Savings Rate (0-25) ---
        let savingsScore = 0;
        let savingsDetail = "No income data";
        if (effectiveIncome > 0) {
            const savingsRate = Math.max(0, (effectiveIncome - effectiveExpenses) / effectiveIncome);
            if (savingsRate >= 0.2) savingsScore = 25;
            else if (savingsRate >= 0.15) savingsScore = 20;
            else if (savingsRate >= 0.1) savingsScore = 15;
            else if (savingsRate >= 0.05) savingsScore = 10;
            else if (savingsRate > 0) savingsScore = 5;
            else savingsScore = 0;
            savingsDetail = `${(savingsRate * 100).toFixed(0)}% savings rate`;
        }

        // --- 2. Budget Adherence (0-25) ---
        let budgetScore = 0;
        let budgetDetail = "No budget limits set";
        const limits = prefs.category_limits;
        if (limits && limits.length > 0) {
                    const catSpending = new Map<string, number>();
                    for (const tx of thisMonthTxns) {
                        if (tx.amount <= 0) continue;
                        const cat = inferCategory(tx);
                        catSpending.set(cat, (catSpending.get(cat) || 0) + tx.amount);
                    }

                    let underBudget = 0;
                    let total = 0;
                    for (const l of limits) {
                        if (l.limit <= 0) continue;
                        total++;
                        const spent = catSpending.get(l.category) || 0;
                        if (spent <= l.limit) underBudget++;
                    }

                    if (total > 0) {
                        const adherenceRate = underBudget / total;
                        budgetScore = Math.round(adherenceRate * 25);
                        budgetDetail = `${underBudget}/${total} categories under budget`;
                    }
        }

        // --- 3. Debt-to-Income Ratio (0-25) ---
        let debtScore = 0;
        let debtDetail = "No debt data";
        const debtAccounts = accounts.filter((a) => a.type === "credit" || a.type === "loan");
        const totalDebt = debtAccounts.reduce((s, a) => s + Math.abs(a.balances?.current || 0), 0);

        if (effectiveIncome > 0) {
            const dti = totalDebt / (effectiveIncome * 12); // annual
            if (dti === 0) { debtScore = 25; debtDetail = "No debt — great!"; }
            else if (dti < 0.15) { debtScore = 22; debtDetail = `${(dti * 100).toFixed(0)}% DTI — low`; }
            else if (dti < 0.3) { debtScore = 18; debtDetail = `${(dti * 100).toFixed(0)}% DTI — moderate`; }
            else if (dti < 0.5) { debtScore = 12; debtDetail = `${(dti * 100).toFixed(0)}% DTI — high`; }
            else { debtScore = 5; debtDetail = `${(dti * 100).toFixed(0)}% DTI — very high`; }
        } else if (totalDebt === 0) {
            debtScore = 25;
            debtDetail = "No debt detected";
        }

        // --- 4. Emergency Fund Status (0-25) ---
        let emergencyScore = 0;
        let emergencyDetail = "Insufficient data";
        const depositoryBalance = accounts
            .filter((a) => a.type === "depository")
            .reduce((s, a) => s + (a.balances?.current || 0), 0);

        if (effectiveExpenses > 0) {
            const monthsCovered = depositoryBalance / effectiveExpenses;
            if (monthsCovered >= 6) { emergencyScore = 25; emergencyDetail = `${monthsCovered.toFixed(1)} months covered`; }
            else if (monthsCovered >= 3) { emergencyScore = 20; emergencyDetail = `${monthsCovered.toFixed(1)} months covered`; }
            else if (monthsCovered >= 1) { emergencyScore = 12; emergencyDetail = `${monthsCovered.toFixed(1)} month${monthsCovered >= 2 ? "s" : ""} covered`; }
            else { emergencyScore = 5; emergencyDetail = `${monthsCovered.toFixed(1)} months — build savings`; }
        } else if (depositoryBalance > 0) {
            emergencyScore = 15;
            emergencyDetail = `$${depositoryBalance.toLocaleString()} in savings`;
        }

        const scores: SubScore[] = [
            { label: "Savings Rate", score: savingsScore, maxScore: 25, icon: <PiggyBank size={14} />, detail: savingsDetail },
            { label: "Budget Adherence", score: budgetScore, maxScore: 25, icon: <Wallet size={14} />, detail: budgetDetail },
            { label: "Debt Ratio", score: debtScore, maxScore: 25, icon: <CreditCard size={14} />, detail: debtDetail },
            { label: "Emergency Fund", score: emergencyScore, maxScore: 25, icon: <Shield size={14} />, detail: emergencyDetail },
        ];

        return {
            totalScore: savingsScore + budgetScore + debtScore + emergencyScore,
            subScores: scores,
        };
    }, [transactions, balance, accounts, prefs.category_limits]);

    if (loadingStage === 'transactions' || loadingStage === 'forecast') {
        return <SkeletonHealthScore />;
    }

    const { label: scoreLabel, color: labelColor } = getScoreLabel(totalScore);
    const gaugeColor = getScoreColor(totalScore);

    // Gauge config: 240-degree arc (from -120 to +120)
    const cx = 100, cy = 100, radius = 80;
    const arcStart = -120;
    const arcEnd = 120;
    const totalArc = arcEnd - arcStart; // 240 degrees
    const filledAngle = arcStart + (totalScore / 100) * totalArc;

    return (
        <div className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Shield size={18} className="text-blue-400" />
                Financial Health Score
            </h2>

            <div className="flex flex-col md:flex-row items-center gap-6">
                {/* Gauge */}
                <div className="relative flex-shrink-0">
                    <svg width={200} height={140} viewBox="0 0 200 160">
                        {/* Gradient definition */}
                        <defs>
                            <linearGradient id="healthGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#f87171" />
                                <stop offset="25%" stopColor="#fb923c" />
                                <stop offset="50%" stopColor="#fbbf24" />
                                <stop offset="75%" stopColor="#4ade80" />
                                <stop offset="100%" stopColor="#34d399" />
                            </linearGradient>
                        </defs>

                        {/* Background arc */}
                        <path
                            d={describeArc(cx, cy, radius, arcStart, arcEnd)}
                            fill="none"
                            stroke="#27272a"
                            strokeWidth={12}
                            strokeLinecap="round"
                        />

                        {/* Filled arc */}
                        {totalScore > 0 && (
                            <path
                                d={describeArc(cx, cy, radius, arcStart, filledAngle)}
                                fill="none"
                                stroke={gaugeColor}
                                strokeWidth={12}
                                strokeLinecap="round"
                                className="transition-all duration-1000 ease-out"
                            />
                        )}

                        {/* Score text */}
                        <text x={cx} y={cy - 8} textAnchor="middle" fill="white" fontSize={36} fontWeight="bold">
                            {totalScore}
                        </text>
                        <text x={cx} y={cy + 14} textAnchor="middle" fill={gaugeColor} fontSize={13} fontWeight="600">
                            {scoreLabel}
                        </text>

                        {/* Min/Max labels */}
                        <text x={28} y={150} textAnchor="middle" fill="#71717a" fontSize={10}>0</text>
                        <text x={172} y={150} textAnchor="middle" fill="#71717a" fontSize={10}>100</text>
                    </svg>
                </div>

                {/* Sub-scores breakdown */}
                <div className="flex-1 w-full space-y-3">
                    {subScores.map((sub) => (
                        <div key={sub.label} className="flex items-center gap-3">
                            <div className="text-zinc-400 flex-shrink-0">{sub.icon}</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-zinc-300">{sub.label}</span>
                                    <span className="text-xs text-zinc-500">{sub.score}/{sub.maxScore}</span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                                    <div
                                        className="h-full rounded-full transition-all duration-700 ease-out"
                                        style={{
                                            width: `${(sub.score / sub.maxScore) * 100}%`,
                                            backgroundColor: getScoreColor((sub.score / sub.maxScore) * 100),
                                        }}
                                    />
                                </div>
                                <p className="text-[10px] text-zinc-500 mt-0.5">{sub.detail}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Tip */}
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 flex items-start gap-2">
                {totalScore >= 65 ? (
                    <TrendingUp size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                ) : (
                    <TrendingDown size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                )}
                <p className="text-xs text-zinc-400">
                    {totalScore >= 80
                        ? "Outstanding! You're managing your finances exceptionally well. Keep it up!"
                        : totalScore >= 65
                        ? "You're doing well! Focus on building your emergency fund and keeping debts low."
                        : totalScore >= 50
                        ? "You're on the right track. Try setting budget limits and boosting your savings rate."
                        : totalScore >= 35
                        ? "There's room for improvement. Start by setting budget limits for your top spending categories."
                        : "Let's work on this together. Connect your accounts and set up budget limits to start improving."}
                </p>
            </div>
        </div>
    );
}
