"use client";

import { useKeyboardShortcuts, KeyboardShortcutsHelp } from "@/components/KeyboardShortcuts";

export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
    const { showHelp, setShowHelp } = useKeyboardShortcuts();

    return (
        <>
            {children}
            <KeyboardShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />
        </>
    );
}
