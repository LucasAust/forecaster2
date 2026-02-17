"use client";

import { useMemo, useState, useCallback } from "react";
import { useSync } from "@/contexts/SyncContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { inferCategory, CATEGORIES, CATEGORY_COLORS, Category } from "@/lib/categories";
import { Sparkles, Check, Pencil, RefreshCw, Lightbulb, ArrowRight } from "lucide-react";
import { clsx } from "clsx";

interface BudgetRec {
    category: string;
    avgMonthly: number;
    recommended: number;
    rationale: string;
}

export function AIBudgetRecommendations() {
    const { transactions } = useSync();
    const { prefs, setPref } = usePreferences();
    const [applying, setApplying] = useState<string | null>(null);
    const [applied, setApplied] = useState<Set<string>>(new Set());
    const [aiTips, setAiTips] = useState<string[]>([]);
    const [loadingTips, setLoadingTips] = useState(false);

    const recommendations = useMemo((): BudgetRec[] => {
        if (!transactions?.length) return [];

        const now = new Date();
        const monthlySpends = new Map<string, number[]>();

        // Analyze last 3 months
        for (let m = 0; m < 3; m++) {
            const target = new Date(now.getFullYear(), now.getMonth() - m, 1);
            const monthKey = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;

            for (const tx of transactions) {
                const d = tx.date || tx.authorized_date;
                if (!d || !d.startsWith(monthKey)) continue;
                if (tx.amount <= 0) continue; // Only expenses

                const cat = inferCategory(tx);
                if (cat === "Income" || cat === "Transfer") continue;

                if (!monthlySpends.has(cat)) monthlySpends.set(cat, [0, 0, 0]);
                const arr = monthlySpends.get(cat)!;
                arr[m] += tx.amount;
            }
        }

        const recs: BudgetRec[] = [];

        for (const [cat, months] of monthlySpends) {
            const validMonths = months.filter(m => m > 0);
            if (validMonths.length === 0) continue;

            const avg = validMonths.reduce((s, v) => s + v, 0) / validMonths.length;

            // Smart recommendation logic:
            // If spending is stable, recommend average + 10% buffer
            // If spending is trending up, recommend reducing by 5%
            // If spending is very variable, recommend the median + 15% buffer

            const sorted = [...validMonths].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            const trend = validMonths.length >= 2 ? months[0] - months[1] : 0;
            const cv = Math.sqrt(validMonths.reduce((sum, v) => sum + (v - avg) ** 2, 0) / validMonths.length) / avg;

            let recommended: number;
            let rationale: string;

            if (cv > 0.3) {
                // High variability — use median + buffer
                recommended = Math.ceil(median * 1.15 / 5) * 5;
                rationale = "Variable spending — based on median + 15% buffer";
            } else if (trend > avg * 0.1) {
                // Trending up — suggest slight cut
                recommended = Math.ceil(avg * 0.95 / 5) * 5;
                rationale = "Spending trending up — recommending 5% reduction";
            } else {
                // Stable — average + buffer
                recommended = Math.ceil(avg * 1.1 / 5) * 5;
                rationale = "Stable spending — average + 10% buffer";
            }

            if (recommended < 5) recommended = 5;

            recs.push({ category: cat, avgMonthly: avg, recommended, rationale });
        }

        return recs.sort((a, b) => b.avgMonthly - a.avgMonthly);
    }, [transactions]);

    const applyRecommendation = useCallback((cat: string, amount: number) => {
        const limits = prefs.category_limits || [];
        const idx = limits.findIndex(l => l.category === cat);
        const updated = [...limits];
        if (idx >= 0) updated[idx] = { ...updated[idx], limit: amount };
        else updated.push({ category: cat, limit: amount, rollover: false });
        setPref("category_limits", updated);
        setApplied(prev => new Set([...prev, cat]));
    }, [prefs.category_limits, setPref]);

    const applyAll = useCallback(() => {
        const limits = [...(prefs.category_limits || [])];
        for (const rec of recommendations) {
            const idx = limits.findIndex(l => l.category === rec.category);
            if (idx >= 0) limits[idx] = { ...limits[idx], limit: rec.recommended };
            else limits.push({ category: rec.category, limit: rec.recommended, rollover: false });
        }
        setPref("category_limits", limits);
        setApplied(new Set(recommendations.map(r => r.category)));
    }, [recommendations, prefs.category_limits, setPref]);

    const fetchAITips = useCallback(async () => {
        setLoadingTips(true);
        try {
            // Build compact spending summary for AI
            const summary = recommendations.map(r =>
                `${r.category}: avg $${r.avgMonthly.toFixed(0)}/mo, recommended $${r.recommended}/mo`
            ).join("; ");

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{
                        role: "user",
                        content: `Based on this monthly spending breakdown, give me 3 specific tips to save money. Be concise (1 sentence each). Spending: ${summary}`
                    }]
                }),
            });

            if (res.ok) {
                const data = await res.json();
                const text = data.response || data.message || "";
                const tips = text.split(/\d\.\s+/).filter((t: string) => t.trim().length > 10).slice(0, 3);
                setAiTips(tips.length > 0 ? tips : [text]);
            }
        } catch (e) {
            console.error("Failed to get AI tips:", e);
        }
        setLoadingTips(false);
    }, [recommendations]);

    const totalRecommended = recommendations.reduce((s, r) => s + r.recommended, 0);
    const totalAvg = recommendations.reduce((s, r) => s + r.avgMonthly, 0);

    if (!recommendations.length) {
        return (
            <div className="glass-card rounded-2xl p-6 text-center">
                <Sparkles size={24} className="mx-auto text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-500">Not enough spending data for recommendations.</p>
                <p className="text-xs text-zinc-600 mt-1">We need at least 1 month of transactions.</p>
            </div>
        );
    }

    return (
        <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sparkles size={14} className="text-amber-400" /> AI Budget Recommendations
                </h3>
                <button
                    type="button"
                    onClick={applyAll}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                >
                    Apply All
                </button>
            </div>

            {/* Summary */}
            <div className="flex items-center gap-4 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3">
                <div>
                    <span className="block text-zinc-400 font-medium">Current Avg</span>
                    <span className="text-sm text-zinc-300">${totalAvg.toFixed(0)}/mo</span>
                </div>
                <ArrowRight size={14} className="text-zinc-600" />
                <div>
                    <span className="block text-zinc-400 font-medium">Recommended</span>
                    <span className="text-sm text-emerald-400">${totalRecommended}/mo</span>
                </div>
                {totalRecommended < totalAvg && (
                    <span className="ml-auto text-emerald-500 text-xs font-medium">
                        Save ~${(totalAvg - totalRecommended).toFixed(0)}/mo
                    </span>
                )}
            </div>

            {/* Recommendations */}
            <div className="space-y-2">
                {recommendations.slice(0, 8).map((rec) => {
                    const color = CATEGORY_COLORS[rec.category] || "#71717a";
                    const isApplied = applied.has(rec.category);
                    const diff = rec.recommended - rec.avgMonthly;

                    return (
                        <div key={rec.category} className="flex items-center gap-3 rounded-lg bg-zinc-900/40 p-3">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-zinc-300">{rec.category}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-zinc-500">${rec.avgMonthly.toFixed(0)}</span>
                                        <ArrowRight size={10} className="text-zinc-600" />
                                        <span className={clsx("text-xs font-medium", diff <= 0 ? "text-emerald-400" : "text-zinc-300")}>
                                            ${rec.recommended}
                                        </span>
                                        {!isApplied ? (
                                            <button
                                                type="button"
                                                onClick={() => applyRecommendation(rec.category, rec.recommended)}
                                                className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                                            >
                                                Apply
                                            </button>
                                        ) : (
                                            <Check size={14} className="text-emerald-500" />
                                        )}
                                    </div>
                                </div>
                                <p className="text-[10px] text-zinc-600 mt-0.5">{rec.rationale}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* AI Tips */}
            <div className="border-t border-zinc-800 pt-3">
                <button
                    type="button"
                    onClick={fetchAITips}
                    disabled={loadingTips}
                    className="flex items-center gap-2 text-xs text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
                >
                    {loadingTips ? <RefreshCw size={12} className="animate-spin" /> : <Lightbulb size={12} />}
                    {loadingTips ? "Getting AI tips..." : "Get AI Savings Tips"}
                </button>
                {aiTips.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                        {aiTips.map((tip, i) => (
                            <p key={i} className="text-xs text-zinc-400 leading-relaxed pl-4 border-l-2 border-amber-800/50">
                                {tip.trim()}
                            </p>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
