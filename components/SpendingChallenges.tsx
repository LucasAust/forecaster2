"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useSync } from "@/contexts/SyncContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { inferCategory } from "@/lib/categories";
import { getDisplayMerchant } from "@/lib/merchants";
import { Trophy, Flame, Star, Target, Plus, X, Check, Zap } from "lucide-react";
import { clsx } from "clsx";

interface Challenge {
    id: string;
    title: string;
    description: string;
    type: "no-spend" | "limit" | "streak";
    category?: string;
    limit?: number;
    durationDays: number;
    startDate: string;
    active: boolean;
}

interface Badge {
    id: string;
    title: string;
    description: string;
    icon: string;
    earned: boolean;
    earnedDate?: string;
}



const PRESET_CHALLENGES: Omit<Challenge, "id" | "startDate" | "active">[] = [
    { title: "No Dining Out Week", description: "Avoid all restaurant and food delivery spending for 7 days", type: "no-spend", category: "Food & Drink", durationDays: 7 },
    { title: "$50/Day for 7 Days", description: "Keep total daily spending under $50 for a full week", type: "limit", limit: 50, durationDays: 7 },
    { title: "No Shopping Month", description: "No non-essential shopping purchases for 30 days", type: "no-spend", category: "Shopping", durationDays: 30 },
    { title: "Coffee-Free Week", description: "Skip the coffee shop for 7 days — brew at home!", type: "no-spend", category: "Food & Drink", durationDays: 7 },
    { title: "Entertainment Diet", description: "No entertainment spending for 14 days", type: "no-spend", category: "Entertainment", durationDays: 14 },
    { title: "$30/Day Challenge", description: "Ultra frugal — stay under $30/day for 14 days", type: "limit", limit: 30, durationDays: 14 },
];

const BADGE_DEFINITIONS: Badge[] = [
    { id: "first-challenge", title: "Challenge Accepted", description: "Started your first spending challenge", icon: "🎯", earned: false },
    { id: "first-complete", title: "Challenge Complete", description: "Completed a spending challenge", icon: "🏆", earned: false },
    { id: "under-budget-month", title: "Budget Master", description: "Stayed under budget for an entire month", icon: "💰", earned: false },
    { id: "three-challenges", title: "Triple Threat", description: "Completed 3 spending challenges", icon: "⚡", earned: false },
    { id: "savings-streak", title: "Savings Streak", description: "Saved money 3 months in a row", icon: "🔥", earned: false },
    { id: "no-splurge-week", title: "Discipline", description: "No single transaction over $100 for 7 days", icon: "🛡️", earned: false },
];

export function SpendingChallenges() {
    const { transactions } = useSync();
    const { prefs, loaded, setPref } = usePreferences();
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [showPresets, setShowPresets] = useState(false);
    const [earnedBadges, setEarnedBadges] = useState<Record<string, string>>({});

    useEffect(() => {
        if (loaded) {
            if (prefs.spending_challenges) setChallenges(prefs.spending_challenges as Challenge[]);
            if (prefs.spending_badges) setEarnedBadges(prefs.spending_badges as Record<string, string>);
        }
    }, [loaded, prefs.spending_challenges, prefs.spending_badges]);

    const saveBadgeEarned = useCallback((id: string) => {
        setEarnedBadges(prev => {
            if (prev[id]) return prev;
            const updated = { ...prev, [id]: new Date().toISOString() };
            setPref("spending_badges", updated);
            return updated;
        });
    }, [setPref]);

    // Check challenge progress
    const challengeProgress = useMemo(() => {
        if (!transactions?.length) return new Map<string, { progress: number; passed: boolean; daysLeft: number }>();

        const map = new Map<string, { progress: number; passed: boolean; daysLeft: number }>();
        const now = new Date();

        for (const challenge of challenges) {
            if (!challenge.active) continue;

            const start = new Date(challenge.startDate);
            const end = new Date(start);
            end.setDate(end.getDate() + challenge.durationDays);
            const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            const daysElapsed = Math.min(challenge.durationDays, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

            let passed = true;

            if (challenge.type === "no-spend" && challenge.category) {
                // Check if any transactions in the category since start
                for (const tx of transactions) {
                    const d = tx.date || tx.authorized_date;
                    if (!d || d < challenge.startDate) continue;
                    if (tx.amount <= 0) continue;
                    const cat = inferCategory(tx);
                    if (cat === challenge.category) {
                        passed = false;
                        break;
                    }
                }
            } else if (challenge.type === "limit" && challenge.limit) {
                // Check daily limits
                const dailySpends = new Map<string, number>();
                for (const tx of transactions) {
                    const d = tx.date || tx.authorized_date;
                    if (!d || d < challenge.startDate) continue;
                    if (tx.amount <= 0) continue;
                    dailySpends.set(d, (dailySpends.get(d) || 0) + tx.amount);
                }
                for (const [, total] of dailySpends) {
                    if (total > challenge.limit) {
                        passed = false;
                        break;
                    }
                }
            }

            const progress = Math.min(100, (daysElapsed / challenge.durationDays) * 100);
            map.set(challenge.id, { progress, passed, daysLeft });
        }

        return map;
    }, [transactions, challenges]);

    const startChallenge = useCallback((preset: Omit<Challenge, "id" | "startDate" | "active">) => {
        const challenge: Challenge = {
            ...preset,
            id: Date.now().toString(),
            startDate: new Date().toISOString().split("T")[0],
            active: true,
        };
        const updated = [...challenges, challenge];
        setChallenges(updated);
        setPref("spending_challenges", updated);
        setShowPresets(false);

        // Check for first challenge badge
        if (updated.length === 1) saveBadgeEarned("first-challenge");
    }, [challenges]);

    const removeChallenge = useCallback((id: string) => {
        const updated = challenges.filter(c => c.id !== id);
        setChallenges(updated);
        setPref("spending_challenges", updated);
    }, [challenges]);

    const completedCount = challenges.filter(c => {
        const p = challengeProgress.get(c.id);
        return p && p.progress >= 100 && p.passed;
    }).length;

    // Auto-award badges
    if (completedCount >= 1 && !earnedBadges["first-complete"]) saveBadgeEarned("first-complete");
    if (completedCount >= 3 && !earnedBadges["three-challenges"]) saveBadgeEarned("three-challenges");

    const activeChallenges = challenges.filter(c => c.active);
    const allBadges = BADGE_DEFINITIONS.map(b => ({ ...b, earned: !!earnedBadges[b.id], earnedDate: earnedBadges[b.id] }));

    return (
        <div className="glass-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Trophy size={16} className="text-amber-400" /> Spending Challenges
                </h3>
                <button
                    type="button"
                    onClick={() => setShowPresets(!showPresets)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                    <Plus size={12} /> New Challenge
                </button>
            </div>

            {/* Presets */}
            {showPresets && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {PRESET_CHALLENGES.map((preset, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => startChallenge(preset)}
                            className="text-left rounded-xl bg-zinc-900/60 border border-zinc-800 p-3 hover:border-zinc-700 transition-colors"
                        >
                            <p className="text-sm font-medium text-white">{preset.title}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">{preset.description}</p>
                            <p className="text-[10px] text-zinc-600 mt-1">{preset.durationDays} days</p>
                        </button>
                    ))}
                </div>
            )}

            {/* Active Challenges */}
            {activeChallenges.length > 0 ? (
                <div className="space-y-3">
                    {activeChallenges.map(c => {
                        const progress = challengeProgress.get(c.id);
                        const pct = progress?.progress || 0;
                        const passed = progress?.passed ?? true;
                        const daysLeft = progress?.daysLeft ?? 0;
                        const isComplete = pct >= 100;

                        return (
                            <div key={c.id} className={clsx(
                                "rounded-xl p-4 space-y-2 border",
                                isComplete && passed ? "border-emerald-800/50 bg-emerald-900/10" :
                                    !passed ? "border-rose-800/50 bg-rose-900/10" :
                                        "border-zinc-800 bg-zinc-900/50"
                            )}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {isComplete && passed ? (
                                            <Check size={14} className="text-emerald-400" />
                                        ) : !passed ? (
                                            <X size={14} className="text-rose-400" />
                                        ) : (
                                            <Flame size={14} className="text-amber-400" />
                                        )}
                                        <span className="text-sm font-medium text-white">{c.title}</span>
                                    </div>
                                    <button type="button" onClick={() => removeChallenge(c.id)} className="text-zinc-600 hover:text-zinc-400" aria-label={`Remove ${c.title} challenge`}>
                                        <X size={12} />
                                    </button>
                                </div>
                                <p className="text-xs text-zinc-500">{c.description}</p>
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                        <div
                                            className={clsx(
                                                "h-full rounded-full transition-all duration-500",
                                                isComplete && passed ? "bg-emerald-500" : !passed ? "bg-rose-500" : "bg-amber-500"
                                            )}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-zinc-500 whitespace-nowrap">
                                        {isComplete ? (passed ? "Completed!" : "Failed") : `${daysLeft}d left`}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-4">
                    <Target size={24} className="mx-auto text-zinc-700 mb-2" />
                    <p className="text-sm text-zinc-500">No active challenges. Start one above!</p>
                </div>
            )}

            {/* Achievement Badges */}
            <div className="border-t border-zinc-800 pt-4">
                <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                    <Star size={10} /> Achievements
                </h4>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {allBadges.map(badge => (
                        <div
                            key={badge.id}
                            className={clsx(
                                "flex flex-col items-center rounded-lg p-2 text-center",
                                badge.earned ? "bg-zinc-800/50" : "bg-zinc-900/30 opacity-40"
                            )}
                            title={badge.description}
                        >
                            <span className="text-2xl">{badge.icon}</span>
                            <span className="text-[10px] text-zinc-400 mt-1 leading-tight">{badge.title}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
