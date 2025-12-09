"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchForecast } from "@/lib/api";

import { useSync } from "@/contexts/SyncContext";

export function QuickGlance() {
    const { forecast } = useSync();
    const [upcoming, setUpcoming] = useState<any[]>([]);

    useEffect(() => {
        if (forecast && forecast.predicted_transactions) {
            const sorted = [...forecast.predicted_transactions].sort((a, b) =>
                new Date(a.date).getTime() - new Date(b.date).getTime()
            );
            setUpcoming(sorted.slice(0, 20));
        }
    }, [forecast]);

    if (!forecast) return <div className="text-sm text-zinc-500">Loading...</div>;

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
                            {item.type === 'income' ? '+' : ''}{Math.abs(item.amount)}
                        </span>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-zinc-200">{item.merchant}</p>
                </div>
            ))}
        </div>
    );
}
