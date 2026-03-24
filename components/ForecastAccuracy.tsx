"use client";

import { useSync } from "@/contexts/SyncContext";
import { useMemo } from "react";
import { Target, TrendingUp, TrendingDown } from "lucide-react";
import { clsx } from "clsx";

/**
 * ForecastAccuracy compares predicted vs actual transactions
 * by matching on date + approximate amount to calculate accuracy.
 */
export function ForecastAccuracy() {
    const { transactions, forecast } = useSync();

    const accuracy = useMemo(() => {
        if (!transactions?.length || !forecast?.predicted_transactions?.length) return null;

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Actual transactions in the last 30 days (Plaid format: positive = expense)
        const actuals = transactions
            .filter((tx) => new Date(tx.date) >= thirtyDaysAgo)
            .map((tx) => ({
                date: tx.date,
                amount: tx.amount, // Plaid convention
                name: (tx.name || "").toLowerCase(),
            }));

        // Predicted transactions that were for dates now in the past
        const predictions = forecast.predicted_transactions
            .filter((tx) => new Date(tx.date) < now && new Date(tx.date) >= thirtyDaysAgo)
            .map((tx) => ({
                date: tx.date,
                amount: -tx.amount, // Convert from standard to Plaid convention for comparison
                name: (tx.merchant || tx.name || "").toLowerCase(),
            }));

        if (predictions.length === 0) return null;

        // Match predictions to actuals using date + amount + merchant similarity
        let matched = 0;
        let totalError = 0;
        const usedActuals = new Set<number>();

        for (const pred of predictions) {
            let bestMatch = -1;
            let bestScore = Infinity;

            for (let i = 0; i < actuals.length; i++) {
                if (usedActuals.has(i)) continue;
                const actual = actuals[i];

                // Date within 2 days
                const dateDiff = Math.abs(new Date(pred.date).getTime() - new Date(actual.date).getTime());
                if (dateDiff > 2 * 24 * 60 * 60 * 1000) continue;

                // Amount similarity — scale tolerance by size:
                // Small amounts ($0-50): 40% tolerance
                // Medium amounts ($50-500): 30% tolerance
                // Large amounts ($500+): 20% tolerance
                const amountDiff = Math.abs(pred.amount - actual.amount);
                const absAmount = Math.max(Math.abs(pred.amount), 1);
                const tolerance = absAmount < 50 ? 0.4 : absAmount < 500 ? 0.3 : 0.2;
                const amountPct = amountDiff / absAmount;
                if (amountPct > tolerance) continue;

                // Merchant name similarity bonus — matching merchants get lower score
                const merchantSimilarity = (() => {
                    if (!pred.name || !actual.name) return 0.5; // Neutral
                    // Check for substring match (handles "Netflix" matching "NETFLIX.COM")
                    if (pred.name.includes(actual.name) || actual.name.includes(pred.name)) return 0;
                    // Check for shared word tokens (handles "Whole Foods" vs "WHOLE FOODS MARKET")
                    const predWords = new Set(pred.name.split(/[\s\-_.,]+/).filter(w => w.length > 2));
                    const actualWords = new Set(actual.name.split(/[\s\-_.,]+/).filter(w => w.length > 2));
                    const overlap = [...predWords].filter(w => actualWords.has(w)).length;
                    const totalWords = Math.max(predWords.size, actualWords.size, 1);
                    return 1 - (overlap / totalWords);
                })();

                // Combined score: 40% amount, 30% date, 30% merchant
                const score = amountPct * 0.4
                    + (dateDiff / (2 * 24 * 60 * 60 * 1000)) * 0.3
                    + merchantSimilarity * 0.3;
                if (score < bestScore) {
                    bestScore = score;
                    bestMatch = i;
                }
            }

            if (bestMatch >= 0) {
                matched++;
                usedActuals.add(bestMatch);
                totalError += Math.abs(pred.amount - actuals[bestMatch].amount);
            }
        }

        const hitRate = predictions.length > 0 ? (matched / predictions.length) * 100 : 0;
        const avgError = matched > 0 ? totalError / matched : 0;

        return {
            hitRate: Math.round(hitRate),
            avgError: avgError.toFixed(2),
            totalPredicted: predictions.length,
            totalMatched: matched,
        };
    }, [transactions, forecast]);

    if (!accuracy) {
        return (
            <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Target size={16} className="text-zinc-500" />
                    <h3 className="text-sm font-medium text-zinc-400">Forecast Accuracy</h3>
                </div>
                <p className="text-xs text-zinc-600">Not enough data to measure accuracy yet.</p>
            </div>
        );
    }

    const isGood = accuracy.hitRate >= 70;
    const isOk = accuracy.hitRate >= 40;

    return (
        <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
                <Target size={16} className="text-blue-400" />
                <h3 className="text-sm font-medium text-white">Forecast Accuracy</h3>
            </div>
            <div className="flex items-end gap-3">
                <span className={clsx(
                    "text-3xl font-bold",
                    isGood ? "text-emerald-400" : isOk ? "text-amber-400" : "text-rose-400"
                )}>
                    {accuracy.hitRate}%
                </span>
                <div className="mb-1">
                    {isGood ? (
                        <TrendingUp size={16} className="text-emerald-400" />
                    ) : (
                        <TrendingDown size={16} className="text-rose-400" />
                    )}
                </div>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
                {accuracy.totalMatched} of {accuracy.totalPredicted} predictions matched actual transactions
            </p>
            <p className="text-xs text-zinc-600 mt-1">
                Avg. amount variance: ${accuracy.avgError}
            </p>
            {/* Progress bar */}
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                    className={clsx(
                        "h-full rounded-full transition-all duration-500",
                        isGood ? "bg-emerald-500" : isOk ? "bg-amber-500" : "bg-rose-500"
                    )}
                    style={{ width: `${accuracy.hitRate}%` }}
                />
            </div>
        </div>
    );
}
