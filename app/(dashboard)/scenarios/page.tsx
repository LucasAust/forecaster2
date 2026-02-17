"use client";

import { ChatInterface, ChatInterfaceRef } from "@/components/ChatInterface";
import { ScenarioOutput } from "@/components/ScenarioOutput";
import { Car, Plane, Briefcase, TrendingUp, CreditCard, PiggyBank, ShieldAlert, Plus, X, Bookmark, ChevronDown, ChevronUp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageTransition } from "@/components/MotionWrappers";
import { usePreferences } from "@/contexts/PreferencesContext";

interface SavedScenario {
    id: string;
    label: string;
    prompt: string;
}

const PRESETS = [
    { icon: Car, label: "Car Repair ($500)", prompt: "What if I have an unexpected $500 car repair expense today?", color: "text-blue-400" },
    { icon: Plane, label: "Vacation ($2000)", prompt: "Can I afford a $2000 vacation next month?", color: "text-violet-400" },
    { icon: Briefcase, label: "Job Loss", prompt: "What happens if I lose my main income source starting next month?", color: "text-rose-400" },
    { icon: TrendingUp, label: "Salary Raise (10%)", prompt: "How would a 10% salary raise starting next month affect my finances over 3 months?", color: "text-emerald-400" },
    { icon: CreditCard, label: "New Subscription ($50/mo)", prompt: "What if I add a new $50/month subscription starting today?", color: "text-amber-400" },
    { icon: PiggyBank, label: "Emergency Fund ($5000)", prompt: "If I save $500/month, how long until I reach a $5000 emergency fund?", color: "text-cyan-400" },
    { icon: ShieldAlert, label: "Medical Bill ($3000)", prompt: "What if I have a $3000 medical bill next week?", color: "text-pink-400" },
];

function ScenariosContent() {
    const chatRef = useRef<ChatInterfaceRef>(null);
    const searchParams = useSearchParams();
    const prompt = searchParams.get('prompt');
    const processedPrompt = useRef<string | null>(null);
    const [showAllPresets, setShowAllPresets] = useState(false);
    const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const [newPrompt, setNewPrompt] = useState("");
    const [scenarioResponse, setScenarioResponse] = useState<string | null>(null);
    const { prefs, loaded, setPref } = usePreferences();

    // Load saved scenarios from preferences
    useEffect(() => {
        if (loaded && prefs.saved_scenarios) {
            setSavedScenarios(prefs.saved_scenarios as SavedScenario[]);
        }
    }, [loaded, prefs.saved_scenarios]);

    useEffect(() => {
        if (prompt && chatRef.current && processedPrompt.current !== prompt) {
            processedPrompt.current = prompt;
            const id = setTimeout(() => {
                chatRef.current?.sendMessage(prompt);
            }, 100);
            return () => clearTimeout(id);
        }
    }, [prompt]);

    const handlePrompt = (p: string) => {
        if (chatRef.current) {
            chatRef.current.sendMessage(p);
        }
    };

    const saveScenario = () => {
        if (!newLabel.trim() || !newPrompt.trim()) return;
        const scenario: SavedScenario = { id: Date.now().toString(), label: newLabel, prompt: newPrompt };
        const updated = [...savedScenarios, scenario];
        setSavedScenarios(updated);
        setPref("saved_scenarios", updated);
        setNewLabel("");
        setNewPrompt("");
        setShowSaveDialog(false);
    };

    const deleteScenario = (id: string) => {
        const updated = savedScenarios.filter(s => s.id !== id);
        setSavedScenarios(updated);
        setPref("saved_scenarios", updated);
    };

    const visiblePresets = showAllPresets ? PRESETS : PRESETS.slice(0, 3);

    return (
        <PageTransition className="h-[calc(100vh-8rem)] flex flex-col space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Scenario Planner</h1>
                    <p className="text-zinc-400">Ask &quot;What if?&quot; and see the future.</p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowSaveDialog(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                >
                    <Bookmark size={14} />
                    Save Custom
                </button>
            </div>

            {/* Save Dialog */}
            {showSaveDialog && (
                <div className="glass-card rounded-xl p-4 border border-zinc-700 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-white">Save Custom Scenario</h3>
                        <button type="button" onClick={() => setShowSaveDialog(false)} className="text-zinc-500 hover:text-white" title="Close">
                            <X size={14} />
                        </button>
                    </div>
                    <input
                        type="text"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder="Label (e.g. College Tuition)"
                        aria-label="Scenario label"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                    />
                    <textarea
                        value={newPrompt}
                        onChange={(e) => setNewPrompt(e.target.value)}
                        placeholder="Prompt (e.g. What if I pay $10,000 for tuition in September?)"
                        rows={2}
                        aria-label="Scenario prompt"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none resize-none"
                    />
                    <button
                        type="button"
                        onClick={saveScenario}
                        disabled={!newLabel.trim() || !newPrompt.trim()}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                    >
                        Save Scenario
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 flex-1 min-h-0">
                {/* Left Column: Chat */}
                <div className="flex flex-col gap-4 h-full overflow-hidden">
                    {/* Presets */}
                    <div className="shrink-0 space-y-2">
                        <div className="flex flex-wrap gap-2">
                            {visiblePresets.map((preset, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => handlePrompt(preset.prompt)}
                                    className="flex items-center space-x-2 whitespace-nowrap rounded-full border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                                >
                                    <preset.icon size={16} className={preset.color} />
                                    <span>{preset.label}</span>
                                </button>
                            ))}
                            {/* Saved custom scenarios */}
                            {savedScenarios.map(s => (
                                <div key={s.id} className="flex items-center gap-0.5">
                                    <button
                                        type="button"
                                        onClick={() => handlePrompt(s.prompt)}
                                        className="flex items-center space-x-2 whitespace-nowrap rounded-l-full border border-r-0 border-zinc-700 bg-blue-900/20 px-4 py-2 text-sm text-blue-300 hover:bg-blue-900/40 hover:text-blue-200 transition-colors"
                                    >
                                        <Bookmark size={14} />
                                        <span>{s.label}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => deleteScenario(s.id)}
                                        className="rounded-r-full border border-l-0 border-zinc-700 bg-blue-900/20 px-2 py-2 text-blue-400/50 hover:text-rose-400 transition-colors"
                                        title="Remove saved scenario"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        {PRESETS.length > 3 && (
                            <button
                                type="button"
                                onClick={() => setShowAllPresets(!showAllPresets)}
                                className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                            >
                                {showAllPresets ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {showAllPresets ? "Show less" : `+${PRESETS.length - 3} more presets`}
                            </button>
                        )}
                    </div>
                    <div className="flex-1 min-h-0">
                        <ChatInterface ref={chatRef} onResponse={setScenarioResponse} />
                    </div>
                </div>

                {/* Right Column: Output */}
                <div className="h-full overflow-y-auto">
                    <ErrorBoundary fallbackTitle="Scenario output failed to load">
                        <ScenarioOutput scenarioAnalysis={scenarioResponse} />
                    </ErrorBoundary>
                </div>
            </div>
        </PageTransition>
    );
}

export default function ScenariosPage() {
    return (
        <Suspense fallback={<div className="text-zinc-500">Loading...</div>}>
            <ScenariosContent />
        </Suspense>
    );
}
