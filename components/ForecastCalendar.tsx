"use client";

import { useEffect, useState } from "react";
import { useSync } from "@/contexts/SyncContext";
import { processForecastData } from "@/lib/api";
import type { ForecastTimelinePoint } from "@/types";

export function ForecastCalendar() {
    const { forecast, balance, loadingStage } = useSync();
    const [days, setDays] = useState<ForecastTimelinePoint[]>([]);

    useEffect(() => {
        if (forecast) {
            const processed = processForecastData(forecast, balance);
            setDays(processed);
        }
    }, [forecast, balance]);

    if (loadingStage === 'forecast') return <div className="text-sm text-zinc-500 p-6">Loading calendar...</div>;

    if (!forecast) return (
        <div className="text-sm text-zinc-500 p-6 flex flex-col items-center justify-center">
            <p>No forecast data available</p>
        </div>
    );

    return (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
            <table className="w-full text-left text-sm text-zinc-400">
                <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
                    <tr>
                        <th className="px-6 py-3 font-medium">Date</th>
                        <th className="px-6 py-3 font-medium">Income</th>
                        <th className="px-6 py-3 font-medium">Expenses</th>
                        <th className="px-6 py-3 font-medium">Ending Balance</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                    {days.map((day, index) => {
                        // Show each transaction as its own row for same-day clarity
                        const txRows = day.transactions.length > 0 ? day.transactions : [null];
                        return txRows.map((tx, txIdx) => (
                        <tr key={`${index}-${txIdx}`} className="hover:bg-zinc-800/50 transition-colors">
                            <td className="px-6 py-3 font-medium text-white">
                                {txIdx === 0 ? (
                                    <span>{new Date(day.fullDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                ) : (
                                    <span className="text-zinc-600">↳</span>
                                )}
                                {tx && (
                                    <span className="text-xs text-zinc-400 font-normal ml-2">
                                        {tx.merchant || tx.category || "Transaction"}
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-3 text-emerald-500">
                                {tx && tx.amount > 0 ? `+$${tx.amount.toFixed(2)}` : (txIdx === 0 && day.dailyIncome > 0 && !tx) ? `+$${day.dailyIncome.toFixed(2)}` : "-"}
                            </td>
                            <td className="px-6 py-3 text-rose-500">
                                {tx && tx.amount < 0 ? `-$${Math.abs(tx.amount).toFixed(2)}` : (txIdx === 0 && day.dailyExpenses > 0 && !tx) ? `-$${day.dailyExpenses.toFixed(2)}` : "-"}
                            </td>
                            <td className="px-6 py-3 text-white font-medium">
                                {txIdx === 0 ? `$${day.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ""}
                            </td>
                        </tr>
                        ));
                    })}
                </tbody>
            </table>
        </div>
    );
}
