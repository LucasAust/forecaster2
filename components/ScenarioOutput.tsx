"use client";

import { BalanceChart } from "./BalanceChart";
import { useSync } from "@/contexts/SyncContext";
import { useMemo } from "react";
import { processForecastData } from "@/lib/api";

export function ScenarioOutput() {
    const { forecast, balance, loadingStage } = useSync();

    const stats = useMemo(() => {
        if (!forecast) return null;
        const data = processForecastData(forecast, balance);
        if (data.length === 0) return null;

        const endingBalance = data[data.length - 1].balance;
        const lowestPoint = Math.min(...data.map(d => d.balance));
        const startBalance = balance;

        const change = startBalance !== 0 ? ((endingBalance - startBalance) / startBalance) * 100 : 0;
        const lowestChange = startBalance !== 0 ? ((lowestPoint - startBalance) / startBalance) * 100 : 0;

        return {
            endingBalance,
            lowestPoint,
            change: change.toFixed(1),
            lowestChange: lowestChange.toFixed(1),
            isHealthy: lowestPoint > 0
        };
    }, [forecast, balance]);

    if (loadingStage === 'forecast') return <div className="text-zinc-500">Loading scenario data...</div>;

    if (!stats) return (
        <div className="text-zinc-500 flex flex-col items-center justify-center h-full">
            <p>No scenario data available</p>
            <p className="text-xs mt-1">Connect a bank account to generate predictions</p>
        </div>
    );

    return (
        <div className="flex h-full flex-col space-y-6">
            <div className="glass-card flex-1 rounded-2xl p-6">
                <h2 className="mb-4 text-lg font-semibold text-white">Projected Impact</h2>
                <BalanceChart className="h-[250px]" />
                <div className="mt-6 grid grid-cols-3 gap-4">
                    <div className="rounded-xl bg-zinc-800/50 p-4 text-center">
                        <p className="text-xs text-zinc-500">Ending Balance</p>
                        <p className="mt-1 text-lg font-bold text-white">${stats.endingBalance.toLocaleString()}</p>
                        <span className={`text-xs ${Number(stats.change) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {Number(stats.change) >= 0 ? '+' : ''}{stats.change}%
                        </span>
                    </div>
                    <div className="rounded-xl bg-zinc-800/50 p-4 text-center">
                        <p className="text-xs text-zinc-500">Lowest Point</p>
                        <p className="mt-1 text-lg font-bold text-white">${stats.lowestPoint.toLocaleString()}</p>
                        <span className={`text-xs ${Number(stats.lowestChange) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {Number(stats.lowestChange) >= 0 ? '+' : ''}{stats.lowestChange}%
                        </span>
                    </div>
                    <div className="rounded-xl bg-zinc-800/50 p-4 text-center">
                        <p className="text-xs text-zinc-500">Safety Margin</p>
                        <p className="mt-1 text-lg font-bold text-white">{stats.isHealthy ? 'Healthy' : 'Critical'}</p>
                        <span className={`text-xs ${stats.isHealthy ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {stats.isHealthy ? 'Low Risk' : 'High Risk'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
