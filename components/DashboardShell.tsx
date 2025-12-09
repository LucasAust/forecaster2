"use client";

import { useSync } from "@/contexts/SyncContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import { TutorialModal } from "@/components/TutorialModal";
import { useEffect, useState } from "react";

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const { loadingStage, transactions } = useSync();
    // Add a minimum loading time to prevent flashing if cache is super fast
    const [showLoading, setShowLoading] = useState(true);
    const [showTutorial, setShowTutorial] = useState(false);

    useEffect(() => {
        if (loadingStage === 'complete') {
            const timer = setTimeout(() => {
                setShowLoading(false);
            }, 800); // 800ms minimum "Complete" view or total delay
            return () => clearTimeout(timer);
        }
    }, [loadingStage]);

    // If completely idle (initial mount before effect), show loading
    // If loadingStage is not complete, show loading
    // If we have no transactions yet, keeping showing loading (safety)
    const isLoading = loadingStage !== 'complete' || showLoading;
    const isOnboarding = loadingStage === 'complete' && (!transactions || transactions.length === 0);

    return (
        <>
            {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}

            {isLoading && (
                <LoadingScreen
                    stage={loadingStage}
                    onStartTutorial={() => setShowTutorial(true)}
                />
            )}

            {!isLoading && (
                <div className="animate-in fade-in duration-700 relative">
                    {isOnboarding && (
                        <div className="fixed inset-0 z-[55] bg-black/80 backdrop-blur-[2px] transition-opacity duration-500 animate-in fade-in" />
                    )}
                    {children}
                </div>
            )}
        </>
    );
}
