"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";

const SHORTCUTS = [
    { keys: ["g", "d"], label: "Dashboard", action: "/" },
    { keys: ["g", "f"], label: "Forecast", action: "/forecast" },
    { keys: ["g", "b"], label: "Budget", action: "/budget" },
    { keys: ["g", "s"], label: "Scenarios", action: "/scenarios" },
    { keys: ["g", "t"], label: "Transactions", action: "/transactions" },
    { keys: ["g", "x"], label: "Settings", action: "/settings" },
    { keys: ["/"], label: "Focus Search", action: "focus-search" },
    { keys: ["?"], label: "Show Shortcuts", action: "toggle-help" },
    { keys: ["Escape"], label: "Close / Cancel", action: "escape" },
];

export function useKeyboardShortcuts() {
    const router = useRouter();
    const [showHelp, setShowHelp] = useState(false);
    const [pendingG, setPendingG] = useState(false);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            // Ignore in inputs/textareas/selects
            const tag = (e.target as HTMLElement).tagName;
            if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
                if (e.key === "Escape") {
                    (e.target as HTMLElement).blur();
                }
                return;
            }

            // "/" to focus search
            if (e.key === "/") {
                e.preventDefault();
                const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Search"], input[placeholder*="search"], input[placeholder*="model"]');
                searchInput?.focus();
                return;
            }

            // "?" to toggle help
            if (e.key === "?") {
                e.preventDefault();
                setShowHelp((v) => !v);
                return;
            }

            // Escape to close help
            if (e.key === "Escape") {
                setShowHelp(false);
                return;
            }

            // "g" prefix shortcuts
            if (e.key === "g" && !pendingG) {
                setPendingG(true);
                setTimeout(() => setPendingG(false), 800);
                return;
            }

            if (pendingG) {
                setPendingG(false);
                const shortcut = SHORTCUTS.find(
                    (s) => s.keys.length === 2 && s.keys[0] === "g" && s.keys[1] === e.key
                );
                if (shortcut && typeof shortcut.action === "string" && shortcut.action.startsWith("/")) {
                    e.preventDefault();
                    router.push(shortcut.action);
                }
            }
        },
        [router, pendingG]
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    return { showHelp, setShowHelp, shortcuts: SHORTCUTS };
}

export function KeyboardShortcutsHelp({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    if (!open) return null;

    return (
        <>
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed z-[100] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-zinc-400 hover:text-white transition-colors text-sm"
                        title="Close"
                    >
                        Esc
                    </button>
                </div>
                <div className="space-y-2">
                    {SHORTCUTS.map((s) => (
                        <div key={s.label} className="flex items-center justify-between py-1.5">
                            <span className="text-sm text-zinc-300">{s.label}</span>
                            <div className="flex gap-1">
                                {s.keys.map((k) => (
                                    <kbd
                                        key={k}
                                        className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-300"
                                    >
                                        {k}
                                    </kbd>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mt-4 text-xs text-zinc-500 text-center">
                    Press <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 text-zinc-300">?</kbd> to toggle this dialog
                </p>
            </div>
        </>
    );
}
