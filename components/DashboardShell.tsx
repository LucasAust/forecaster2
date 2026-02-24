"use client";

import { useSync } from "@/contexts/SyncContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import { TutorialModal } from "@/components/TutorialModal";
import { OnboardingWalkthrough } from "@/components/OnboardingWalkthrough";
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const { loadingStage, transactions, error, isSyncing } = useSync();
    // Add a minimum loading time to prevent flashing if cache is super fast
    const [showLoading, setShowLoading] = useState(true);
    const [showTutorial, setShowTutorial] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    // Track last active sync stage for the banner label (avoids TS overlap with 'complete')
    const [syncStageLabel, setSyncStageLabel] = useState<'transactions' | 'forecast'>('transactions');

    useEffect(() => {
        if (loadingStage === 'transactions' || loadingStage === 'forecast') {
            setSyncStageLabel(loadingStage);
        }
    }, [loadingStage]);

    useEffect(() => {
        if (loadingStage === 'complete') {
            const timer = setTimeout(() => {
                setShowLoading(false);
                // Check if onboarding has been completed
                const onboardingDone = (() => { try { return localStorage.getItem("arc-onboarding-complete"); } catch { return null; } })();
                if (!onboardingDone && transactions && transactions.length > 0) {
                    setShowOnboarding(true);
                }
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [loadingStage, transactions]);

    // Only show full-screen overlay during initial load (no data yet).
    // Background syncs (re-syncs with existing data) use the thin banner below instead.
    const isLoading = (loadingStage !== 'complete' || showLoading) && transactions.length === 0;

    return (
        <>
            {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
            {showOnboarding && <OnboardingWalkthrough onComplete={() => setShowOnboarding(false)} />}

            {/* Loading screen overlays content instead of replacing it — prevents
                unmount/remount of the component tree during navigation which could
                cause the sidebar routing bug (C-1). */}
            {isLoading && !error && (
                <div className="fixed inset-0 z-[100]">
                    <LoadingScreen
                        stage={loadingStage}
                        onStartTutorial={() => setShowTutorial(true)}
                    />
                </div>
            )}

            {/* Error state — shown instead of infinite loading spinner */}
            {error && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950">
                    <div className="text-center space-y-4 max-w-md px-6">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 mx-auto">
                            <AlertTriangle className="h-7 w-7 text-red-500" />
                        </div>
                        <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
                        <p className="text-sm text-zinc-400">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Reload
                        </button>
                    </div>
                </div>
            )}

            {/* Re-sync progress banner — shown only when we already have data visible
                but a background refresh is running (bank connect, manual refresh, etc.) */}
            {isSyncing && !isLoading && !error && (
                <div className="fixed top-0 inset-x-0 z-[90] pointer-events-none">
                    {/* thin indeterminate progress bar */}
                    <div className="h-[3px] w-full bg-blue-900/40 overflow-hidden">
                        <div className="h-full w-[45%] bg-blue-500 rounded-full animate-[slide_1.4s_ease-in-out_infinite]" />
                    </div>
                    <div className="flex items-center justify-center gap-2 bg-blue-950/80 backdrop-blur-sm px-4 py-1.5 text-xs text-blue-300 border-b border-blue-900/50">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        {syncStageLabel === 'forecast'
                            ? 'Generating updated forecast…'
                            : 'Syncing your latest transactions…'}
                    </div>
                </div>
            )}

            <div className={(isLoading && !error) ? "invisible" : "animate-in fade-in duration-700"}>
                {children}
            </div>
        </>
    );
}
