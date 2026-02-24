"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { getDisplayMerchant } from "@/lib/merchants";
import { useSync } from "@/contexts/SyncContext";
import { SkeletonForecastCards } from "@/components/Skeleton";

export function QuickGlance() {
    const { forecast, loadingStage } = useSync();
    const [upcoming, setUpcoming] = useState<import("@/types").PredictedTransaction[]>([]);

    useEffect(() => {
        if (forecast && forecast.predicted_transactions) {
            const sorted = [...forecast.predicted_transactions].sort((a, b) =>
                new Date(a.date).getTime() - new Date(b.date).getTime()
            );
            setUpcoming(sorted.slice(0, 20));
        }
    }, [forecast]);

    if (!forecast || loadingStage === 'transactions' || loadingStage === 'forecast') {
        return <SkeletonForecastCards count={6} />;
    }

    if (upcoming.length === 0) return (
        <div className="text-sm text-zinc-500 text-center py-4">
            <p>No upcoming predictions yet.</p>
            <p className="text-xs mt-1">Connect a bank account to see forecasted transactions.</p>
        </div>
    );

    return (
        <div className="flex space-x-4 overflow-x-auto pb-2 scrollbar-hide">
            {upcoming.map((item, index) => (
                <div
                    key={index}
                    className="glass-card min-w-[140px] flex-shrink-0 rounded-xl p-4 transition-transform hover:scale-105"
                >
                    <p className="text-xs font-medium text-zinc-400">{new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    <div className="mt-2 flex items-center justify-between">
                        <div className={`rounded-full p-1.5 ${item.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                            {item.type === 'income' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        </div>
                        <span className={`text-sm font-bold ${item.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.type === 'income' ? '+' : '−'}${Math.abs(item.amount).toFixed(2)}
                        </span>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-zinc-200" title={getDisplayMerchant(item)}>{getDisplayMerchant(item)}</p>
                </div>
            ))}
        </div>
    );
}
