"use client";

import { useSync } from "@/contexts/SyncContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import { TutorialModal } from "@/components/TutorialModal";
import { OnboardingWalkthrough } from "@/components/OnboardingWalkthrough";
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const { loadingStage, transactions, error } = useSync();
    // Add a minimum loading time to prevent flashing if cache is super fast
    const [showLoading, setShowLoading] = useState(true);
    const [showTutorial, setShowTutorial] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);

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

    const isLoading = loadingStage !== 'complete' || showLoading;

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

            <div className={(isLoading && !error) ? "invisible" : "animate-in fade-in duration-700"}>
                {children}
            </div>
        </>
    );
}
