"use client";

import { useEffect, useState } from "react";
import { Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { useSync } from "@/contexts/SyncContext";

interface Suggestion {
    title: string;
    message: string;
    type: "saving" | "warning" | "insight";
}

export function AISuggestions() {
    const { transactions, forecast } = useSync();
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState(false);

    const fetchSuggestions = async () => {
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
    };

    // Auto-fetch on mount and when lastUpdated changes (implying a sync finished)
    const { lastUpdated } = useSync();

    useEffect(() => {
        fetchSuggestions();
    }, [lastUpdated]);

    return (
        <div className="glass-card rounded-2xl p-6 bg-gradient-to-b from-blue-900/20 to-transparent border-blue-500/20 min-h-[300px]">
            <div className="mb-4 flex items-center justify-between text-blue-400">
                <div className="flex items-center space-x-2">
                    <Lightbulb size={20} />
                    <h2 className="font-semibold">AI Suggestions</h2>
                </div>
                {!loading && generated && (
                    <button
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
                    suggestions.map((s, i) => (
                        <div key={i} className="rounded-xl bg-zinc-900/50 p-4 border border-zinc-800 hover:border-blue-500/30 transition-colors">
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
                        </div>
                    ))
                ) : (
                    <div className="text-center py-10">
                        <p className="text-sm text-zinc-500">
                            {!transactions ? "Loading data..." : "No suggestions found."}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
