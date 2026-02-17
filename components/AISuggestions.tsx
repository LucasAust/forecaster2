"use client";

import { useEffect, useState, useCallback } from "react";
import { Lightbulb, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { useSync } from "@/contexts/SyncContext";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

interface Suggestion {
    title: string;
    message: string;
    type: "saving" | "warning" | "insight";
}

export function AISuggestions() {
    const { lastUpdated } = useSync();
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState(false);
    const router = useRouter();

    /** Derive an action for each suggestion based on its title/type */
    function getAction(s: Suggestion): { label: string; href: string } | null {
        const t = s.title.toLowerCase() + " " + s.message.toLowerCase();
        if (t.includes("subscription") || t.includes("recurring")) return { label: "View Transactions", href: "/transactions" };
        if (t.includes("budget") || t.includes("spending")) return { label: "Open Budget", href: "/budget" };
        if (t.includes("forecast") || t.includes("predict")) return { label: "View Forecast", href: "/forecast" };
        if (t.includes("scenario") || t.includes("what if")) return { label: "Try Scenario", href: "/scenarios" };
        if (s.type === "saving") return { label: "Analyze Spending", href: "/budget" };
        if (s.type === "warning") return { label: "View Details", href: "/transactions" };
        return { label: "Explore", href: "/scenarios?prompt=" + encodeURIComponent(s.title) };
    }

    const fetchSuggestions = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/suggestions'); // GET by default
            if (response.ok) {
                const data = await response.json();
                if (data.suggestions) {
                    setSuggestions(data.suggestions);
                    setGenerated(true);
                }
            }
        } catch (error) {
            console.error("Failed to fetch suggestions:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-fetch on mount and when lastUpdated changes (implying a sync finished)

    useEffect(() => {
        fetchSuggestions();
    }, [lastUpdated, fetchSuggestions]);

    return (
        <div className="glass-card rounded-2xl p-6 bg-gradient-to-b from-blue-900/20 to-transparent border-blue-500/20 min-h-[300px]">
            <div className="mb-4 flex items-center justify-between text-blue-400">
                <div className="flex items-center space-x-2">
                    <Lightbulb size={20} />
                    <h2 className="font-semibold">AI Suggestions</h2>
                </div>
                {!loading && generated && (
                    <button
                        type="button"
                        onClick={fetchSuggestions}
                        className="text-zinc-500 hover:text-blue-400 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={14} />
                    </button>
                )}
            </div>

            <div className="space-y-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-3">
                        <Loader2 className="animate-spin text-blue-500" size={24} />
                        <p className="text-xs text-zinc-500">Analyzing your finances...</p>
                    </div>
                ) : suggestions.length > 0 ? (
                    <AnimatePresence>
                    {suggestions.map((s, i) => (
                        <motion.div
                            key={`${s.title}-${s.type}`}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.35, delay: i * 0.1 }}
                            className="rounded-xl bg-zinc-900/50 p-4 border border-zinc-800 hover:border-blue-500/30 transition-colors"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-medium text-white">{s.title}</p>
                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${s.type === 'warning' ? 'bg-orange-500/10 text-orange-500' :
                                    s.type === 'saving' ? 'bg-emerald-500/10 text-emerald-500' :
                                        'bg-blue-500/10 text-blue-500'
                                    }`}>
                                    {s.type}
                                </span>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                                {s.message}
                            </p>
                            {(() => {
                                const action = getAction(s);
                                return action ? (
                                    <button
                                        type="button"
                                        onClick={() => router.push(action.href)}
                                        className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                                    >
                                        {action.label}
                                        <ArrowRight size={12} />
                                    </button>
                                ) : null;
                            })()}
                        </motion.div>
                    ))}
                    </AnimatePresence>
                ) : (
                    <div className="text-center py-10">
                        <p className="text-sm text-zinc-500">
                            No suggestions yet. They'll appear after your data syncs.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
