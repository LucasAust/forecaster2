"use client";

import { useState, useCallback, createContext, useContext, useEffect } from "react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { GripVertical, Eye, EyeOff, RotateCcw, Settings2 } from "lucide-react";
import { clsx } from "clsx";

export interface WidgetConfig {
    id: string;
    label: string;
    visible: boolean;
    order: number;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
    { id: "financial-health", label: "Financial Health Score", visible: true, order: 0 },
    { id: "quick-glance", label: "Quick Glance", visible: true, order: 1 },
    { id: "balance-chart", label: "Balance Chart", visible: true, order: 2 },
    { id: "safe-to-spend", label: "Safe to Spend", visible: true, order: 3 },
    { id: "recent-activity", label: "Recent Activity", visible: true, order: 4 },
    { id: "ai-suggestions", label: "AI Suggestions", visible: true, order: 5 },
    { id: "savings-goals", label: "Savings Goals", visible: true, order: 6 },
    { id: "income-tracker", label: "Income Tracker", visible: true, order: 7 },
    { id: "debt-planner", label: "Debt Planner", visible: true, order: 8 },
    { id: "spending-challenges", label: "Spending Challenges", visible: true, order: 9 },
];

function mergeWithDefaults(stored: WidgetConfig[]): WidgetConfig[] {
    const map = new Map(stored.map(w => [w.id, w]));
    return DEFAULT_WIDGETS.map(dw => map.get(dw.id) || dw).sort((a, b) => a.order - b.order);
}

interface DashboardLayoutContextType {
    widgets: WidgetConfig[];
    isCustomizing: boolean;
    setIsCustomizing: (v: boolean) => void;
    toggleVisibility: (id: string) => void;
    moveWidget: (id: string, direction: -1 | 1) => void;
    resetLayout: () => void;
    isVisible: (id: string) => boolean;
    getOrder: () => WidgetConfig[];
}

const DashboardLayoutContext = createContext<DashboardLayoutContextType | null>(null);

export function DashboardLayoutProvider({ children }: { children: React.ReactNode }) {
    const { prefs, loaded, setPref } = usePreferences();
    const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
    const [isCustomizing, setIsCustomizing] = useState(false);

    useEffect(() => {
        if (loaded && prefs.dashboard_layout?.length) {
            setWidgets(mergeWithDefaults(prefs.dashboard_layout));
        }
    }, [loaded, prefs.dashboard_layout]);

    const persist = useCallback((updated: WidgetConfig[]) => {
        setWidgets(updated);
        setPref("dashboard_layout", updated);
    }, [setPref]);

    const toggleVisibility = useCallback((id: string) => {
        setWidgets(prev => {
            const updated = prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
            setPref("dashboard_layout", updated);
            return updated;
        });
    }, [setPref]);

    const moveWidget = useCallback((id: string, direction: -1 | 1) => {
        setWidgets(prev => {
            const idx = prev.findIndex(w => w.id === id);
            if (idx < 0) return prev;
            const newIdx = idx + direction;
            if (newIdx < 0 || newIdx >= prev.length) return prev;

            const updated = [...prev];
            [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
            const reordered = updated.map((w, i) => ({ ...w, order: i }));
            setPref("dashboard_layout", reordered);
            return reordered;
        });
    }, [setPref]);

    const resetLayout = useCallback(() => {
        persist(DEFAULT_WIDGETS);
    }, [persist]);

    const isVisible = useCallback((id: string) => {
        return widgets.find(w => w.id === id)?.visible ?? true;
    }, [widgets]);

    const getOrder = useCallback(() => widgets, [widgets]);

    return (
        <DashboardLayoutContext.Provider value={{ widgets, isCustomizing, setIsCustomizing, toggleVisibility, moveWidget, resetLayout, isVisible, getOrder }}>
            {children}
        </DashboardLayoutContext.Provider>
    );
}

export function useDashboardLayout() {
    const ctx = useContext(DashboardLayoutContext);
    if (!ctx) throw new Error("useDashboardLayout must be used within DashboardLayoutProvider");
    return ctx;
}

export function DashboardCustomizer() {
    const { widgets, isCustomizing, setIsCustomizing, toggleVisibility, moveWidget, resetLayout } = useDashboardLayout();

    if (!isCustomizing) {
        return (
            <button
                type="button"
                onClick={() => setIsCustomizing(true)}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800"
            >
                <Settings2 size={12} /> Customize
            </button>
        );
    }

    return (
        <div className="glass-card rounded-2xl p-4 space-y-3 mb-6">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Settings2 size={14} className="text-blue-400" /> Customize Dashboard
                </h3>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={resetLayout}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors"
                    >
                        <RotateCcw size={10} /> Reset
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsCustomizing(false)}
                        className="text-xs px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
            <div className="space-y-1">
                {widgets.map((w, i) => (
                    <div key={w.id} className={clsx(
                        "flex items-center gap-2 rounded-lg px-3 py-2 transition-colors",
                        w.visible ? "bg-zinc-800/50" : "bg-zinc-900/30 opacity-60"
                    )}>
                        <GripVertical size={12} className="text-zinc-600" />
                        <span className="flex-1 text-sm text-zinc-300">{w.label}</span>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => moveWidget(w.id, -1)}
                                disabled={i === 0}
                                className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30 text-xs px-1"
                            >
                                ▲
                            </button>
                            <button
                                type="button"
                                onClick={() => moveWidget(w.id, 1)}
                                disabled={i === widgets.length - 1}
                                className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30 text-xs px-1"
                            >
                                ▼
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleVisibility(w.id)}
                                className="ml-2 text-zinc-500 hover:text-white transition-colors"
                            >
                                {w.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
