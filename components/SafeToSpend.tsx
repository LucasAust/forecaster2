"use client";

import { Wallet } from "lucide-react";
import { useSync } from "@/contexts/SyncContext";
import { useMemo } from "react";
import { CountUp } from "@/components/MotionWrappers";
import { SkeletonSafeToSpend } from "@/components/Skeleton";
import type { PredictedTransaction } from "@/types";

export function SafeToSpend() {
    const { balance, forecast, loadingStage } = useSync();

    const { daily, daysLeft, totalUpcoming } = useMemo(() => {
        const now = new Date();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const daysLeft = Math.max(1, Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

        // Sum upcoming predicted expenses for the rest of the month
        let totalUpcoming = 0;
        if (forecast?.predicted_transactions) {
            forecast.predicted_transactions.forEach((tx: PredictedTransaction) => {
                const d = new Date(tx.date);
                if (d >= now && d <= endOfMonth) {
                    // Expenses: amount < 0 in forecast (standard convention)
                    if (tx.amount < 0 || tx.type === "expense") {
                        totalUpcoming += Math.abs(tx.amount);
                    }
                }
            });
        }

        const safeTotal = Math.max(0, balance - totalUpcoming);
        const daily = safeTotal / daysLeft;

        return { daily, daysLeft, totalUpcoming };
    }, [balance, forecast]);

    if (loadingStage === 'transactions' || loadingStage === 'forecast') {
        return <SkeletonSafeToSpend />;
    }

    return (
        <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
                <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-400">
                    <Wallet size={18} />
                </div>
                <div>
                    <p className="text-xs font-medium text-zinc-400">Safe to Spend Today</p>
                    <p className="text-2xl font-bold text-emerald-400">
                        <CountUp value={daily} prefix="$" decimals={2} />
                    </p>
                </div>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{daysLeft} days left this month</span>
                <span>${totalUpcoming.toFixed(0)} in upcoming bills</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-1000"
                    style={{ width: `${Math.min(100, Math.max(0, ((balance - totalUpcoming) / (balance || 1)) * 100))}%` }}
                />
            </div>
        </div>
    );
}
