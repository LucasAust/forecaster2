"use client";

import { useState, useEffect } from "react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { PiggyBank, Plus, X, Target, Calendar, Trash2 } from "lucide-react";
import { clsx } from "clsx";

interface SavingsGoal {
    id: string;
    name: string;
    target: number;
    saved: number;
    deadline?: string; // ISO date string
    color: string;
}

const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#f97316"];

export function SavingsGoals() {
    const { prefs, loaded, setPref } = usePreferences();
    const [goals, setGoals] = useState<SavingsGoal[]>([]);
    const [showAdd, setShowAdd] = useState(false);
    const [name, setName] = useState("");
    const [target, setTarget] = useState("");
    const [deadline, setDeadline] = useState("");
    const [addingSaved, setAddingSaved] = useState<string | null>(null);
    const [addAmount, setAddAmount] = useState("");

    useEffect(() => {
        if (loaded && prefs.savings_goals) {
            setGoals(prefs.savings_goals);
        }
    }, [loaded, prefs.savings_goals]);

    const persist = (updated: SavingsGoal[]) => {
        setGoals(updated);
        setPref("savings_goals", updated);
    };

    const addGoal = () => {
        if (!name.trim() || !target) return;
        const goal: SavingsGoal = {
            id: Date.now().toString(),
            name: name.trim(),
            target: parseFloat(target),
            saved: 0,
            deadline: deadline || undefined,
            color: COLORS[goals.length % COLORS.length],
        };
        persist([...goals, goal]);
        setName("");
        setTarget("");
        setDeadline("");
        setShowAdd(false);
    };

    const deleteGoal = (id: string) => {
        persist(goals.filter(g => g.id !== id));
    };

    const addToGoal = (id: string) => {
        const amount = parseFloat(addAmount);
        if (!amount || amount <= 0) return;
        persist(goals.map(g =>
            g.id === id ? { ...g, saved: Math.min(g.saved + amount, g.target) } : g
        ));
        setAddingSaved(null);
        setAddAmount("");
    };

    const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
    const totalTarget = goals.reduce((s, g) => s + g.target, 0);

    return (
        <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <PiggyBank size={18} className="text-blue-400" />
                    <h2 className="text-lg font-semibold text-white">Savings Goals</h2>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAdd(!showAdd)}
                    className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                >
                    <Plus size={12} />
                    New Goal
                </button>
            </div>

            {/* Add Goal Form */}
            {showAdd && (
                <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900/50 p-4 space-y-3">
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Goal name (e.g. Emergency Fund)"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                            <input
                                type="number"
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                placeholder="Target amount"
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-7 pr-3 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                        <input
                            type="date"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                            title="Deadline (optional)"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={addGoal}
                            disabled={!name.trim() || !target}
                            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                        >
                            Create Goal
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowAdd(false)}
                            className="rounded-lg px-4 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Summary */}
            {goals.length > 0 && (
                <div className="mb-4 rounded-xl bg-zinc-900/50 border border-zinc-800 p-3 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Progress</p>
                        <p className="text-sm font-medium text-white">
                            ${totalSaved.toLocaleString()} <span className="text-zinc-500">of</span> ${totalTarget.toLocaleString()}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-lg font-bold text-blue-400">
                            {totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0}%
                        </p>
                    </div>
                </div>
            )}

            {/* Goals list */}
            {goals.length === 0 ? (
                <div className="text-center py-6">
                    <Target size={24} className="mx-auto mb-2 text-zinc-700" />
                    <p className="text-sm text-zinc-500">No savings goals yet.</p>
                    <p className="text-xs text-zinc-600 mt-1">Create one to start tracking your progress!</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {goals.map(goal => {
                        const pct = goal.target > 0 ? (goal.saved / goal.target) * 100 : 0;
                        const isComplete = pct >= 100;
                        const daysLeft = goal.deadline
                            ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                            : null;
                        const monthlyNeeded = daysLeft && daysLeft > 0
                            ? ((goal.target - goal.saved) / (daysLeft / 30)).toFixed(0)
                            : null;

                        return (
                            <div key={goal.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: goal.color }} />
                                        <span className={clsx("text-sm font-medium", isComplete ? "text-emerald-400" : "text-white")}>
                                            {goal.name}
                                        </span>
                                        {isComplete && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">Done!</span>}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {addingSaved === goal.id ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    value={addAmount}
                                                    onChange={(e) => setAddAmount(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") addToGoal(goal.id); }}
                                                    placeholder="$"
                                                    className="w-16 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-xs text-white focus:outline-none"
                                                    autoFocus
                                                />
                                                <button type="button" onClick={() => addToGoal(goal.id)} className="text-emerald-400 hover:text-emerald-300" title="Add savings">
                                                    <Plus size={12} />
                                                </button>
                                                <button type="button" onClick={() => setAddingSaved(null)} className="text-zinc-500 hover:text-white" title="Cancel">
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => { setAddingSaved(goal.id); setAddAmount(""); }}
                                                    className="text-zinc-600 hover:text-emerald-400 transition-colors"
                                                    title="Add savings"
                                                >
                                                    <Plus size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteGoal(goal.id)}
                                                    className="text-zinc-600 hover:text-rose-400 transition-colors"
                                                    title="Delete goal"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {/* Progress */}
                                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                                    <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: goal.color }}
                                    />
                                </div>
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-xs text-zinc-400">
                                        ${goal.saved.toLocaleString()} / ${goal.target.toLocaleString()}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {monthlyNeeded && !isComplete && (
                                            <span className="text-[10px] text-zinc-600">${monthlyNeeded}/mo needed</span>
                                        )}
                                        {daysLeft !== null && (
                                            <span className={clsx("text-[10px] flex items-center gap-0.5", daysLeft <= 30 ? "text-amber-400" : "text-zinc-600")}>
                                                <Calendar size={10} />
                                                {daysLeft > 0 ? `${daysLeft}d left` : "Past due"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
