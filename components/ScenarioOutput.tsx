"use client";

import { BalanceChart } from "./BalanceChart";
import { useSync } from "@/contexts/SyncContext";
import { useMemo } from "react";
import { processForecastData } from "@/lib/api";
import { MessageSquare, TrendingUp } from "lucide-react";

interface ScenarioOutputProps {
    scenarioAnalysis?: string | null;
}

export function ScenarioOutput({ scenarioAnalysis }: ScenarioOutputProps) {
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

    if (!stats && !scenarioAnalysis) return (
        <div className="glass-card flex flex-col items-center justify-center h-full rounded-2xl p-8 text-center">
            <div className="rounded-full bg-zinc-800/50 p-4 mb-4">
                <MessageSquare className="h-8 w-8 text-zinc-600" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-300 mb-2">No Scenario Yet</h3>
            <p className="text-sm text-zinc-500 max-w-xs">
                Run a scenario using the chat panel or preset buttons to see its projected impact on your finances.
            </p>
        </div>
    );

    return (
        <div className="flex h-full flex-col space-y-6">
            {/* AI Scenario Analysis */}
            {scenarioAnalysis && (
                <div className="glass-card rounded-2xl p-6">
                    <h2 className="mb-3 text-lg font-semibold text-white flex items-center gap-2">
                        <TrendingUp size={18} className="text-blue-400" />
                        Scenario Analysis
                    </h2>
                    <div className="prose prose-invert prose-sm max-w-none text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {scenarioAnalysis}
                    </div>
                </div>
            )}

            {/* Baseline Forecast Reference */}
            {stats && (
            <div className="glass-card flex-1 rounded-2xl p-6">
                <h2 className="mb-4 text-lg font-semibold text-white">
                    {scenarioAnalysis ? "Current Forecast (Baseline)" : "Projected Impact"}
                </h2>
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
            )}
        </div>
    );
}
