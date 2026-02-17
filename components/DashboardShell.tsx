"use client";

import { useSync } from "@/contexts/SyncContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import { TutorialModal } from "@/components/TutorialModal";
import { OnboardingWalkthrough } from "@/components/OnboardingWalkthrough";
import { useEffect, useState } from "react";

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const { loadingStage, transactions } = useSync();
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
    const isOnboarding = loadingStage === 'complete' && (!transactions || transactions.length === 0);

    return (
        <>
            {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
            {showOnboarding && <OnboardingWalkthrough onComplete={() => setShowOnboarding(false)} />}

            {/* Loading screen overlays content instead of replacing it — prevents
                unmount/remount of the component tree during navigation which could
                cause the sidebar routing bug (C-1). */}
            {isLoading && (
                <div className="fixed inset-0 z-[100]">
                    <LoadingScreen
                        stage={loadingStage}
                        onStartTutorial={() => setShowTutorial(true)}
                    />
                </div>
            )}

            <div className={isLoading ? "invisible" : "animate-in fade-in duration-700"}>
                {isOnboarding && (
                    <div className="fixed inset-0 z-[55] bg-black/80 backdrop-blur-[2px] transition-opacity duration-500 animate-in fade-in" />
                )}
                {children}
            </div>
        </>
    );
}
