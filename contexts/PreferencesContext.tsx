"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

/**
 * PreferencesContext manages user preferences that were previously in localStorage.
 * On mount it loads from the API (Supabase user_settings.user_preferences JSONB),
 * falls back to localStorage, and migrates localStorage data to the server.
 *
 * Components call `get<Key>()` / `set<Key>()` which update local state instantly
 * then debounce-persist to the server.
 */

interface Preferences {
    category_limits?: { category: string; limit: number; rollover: boolean }[];
    savings_goals?: { id: string; name: string; target: number; saved: number; color: string; deadline?: string }[];
    dashboard_layout?: { id: string; label: string; visible: boolean; order: number }[];
    saved_scenarios?: { id: string; label: string; prompt: string }[];
    debt_plans?: { id: string; name: string; balance: number; apr: number; minPayment: number }[];
    spending_challenges?: { id: string; title: string; description: string; type: string; category?: string; limit?: number; durationDays: number; startDate: string; active: boolean }[];
    spending_badges?: Record<string, string>;
    income_allocations?: { needs: number; wants: number; savings: number };
    paused_recurring?: string[];
}

interface PreferencesContextType {
    prefs: Preferences;
    loaded: boolean;
    /** Update a single key. Persists to server after a short debounce. */
    setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

/** Map localStorage keys → preferences keys for migration */
const LS_MIGRATION_MAP: Record<string, keyof Preferences> = {
    "arc-category-limits": "category_limits",
    "arc-savings-goals": "savings_goals",
    "arc-dashboard-layout": "dashboard_layout",
    "arc-saved-scenarios": "saved_scenarios",
    "arc-debt-plans": "debt_plans",
    "arc-spending-challenges": "spending_challenges",
    "arc-spending-badges": "spending_badges",
    "arc-paycheck-allocations": "income_allocations",
    "arc-paused-recurring": "paused_recurring",
};

function migrateLocalStorage(): Preferences {
    const migrated: Preferences = {};
    if (typeof window === "undefined") return migrated;

    for (const [lsKey, prefKey] of Object.entries(LS_MIGRATION_MAP)) {
        try {
            const raw = localStorage.getItem(lsKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                // paused_recurring is stored as an array in LS but Set wasn't serialized
                (migrated as Record<string, unknown>)[prefKey] = parsed;
            }
        } catch {
            /* ignore corrupt localStorage entries */
        }
    }
    return migrated;
}

function clearMigratedLocalStorage() {
    for (const lsKey of Object.keys(LS_MIGRATION_MAP)) {
        try {
            localStorage.removeItem(lsKey);
        } catch { /* ignore */ }
    }
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
    const [prefs, setPrefs] = useState<Preferences>({});
    const [loaded, setLoaded] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestPrefsRef = useRef<Preferences>(prefs);

    // Keep ref in sync
    useEffect(() => {
        latestPrefsRef.current = prefs;
    }, [prefs]);

    // Persist to server (debounced)
    const persistToServer = useCallback((data: Preferences) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try {
                await fetch("/api/settings/preferences", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_preferences: data }),
                });
            } catch {
                /* silent — data is still in local state */
            }
        }, 500);
    }, []);

    // Load on mount
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const res = await fetch("/api/settings/preferences");
                if (!res.ok) throw new Error("fetch failed");
                const serverPrefs: Preferences = await res.json();

                if (cancelled) return;

                // Check if we have localStorage data that's not yet on the server
                const lsMigrated = migrateLocalStorage();
                const hasLocalData = Object.keys(lsMigrated).length > 0;
                const hasServerData = Object.keys(serverPrefs).length > 0;

                if (hasLocalData && !hasServerData) {
                    // First-time migration: push localStorage → server
                    setPrefs(lsMigrated);
                    persistToServer(lsMigrated);
                    clearMigratedLocalStorage();
                } else if (hasServerData) {
                    // Server is source of truth
                    setPrefs(serverPrefs);
                    if (hasLocalData) clearMigratedLocalStorage();
                }
                // else: both empty — fresh user, nothing to do
            } catch {
                // Offline or new user — load from localStorage as fallback
                if (!cancelled) {
                    const lsData = migrateLocalStorage();
                    setPrefs(lsData);
                }
            } finally {
                if (!cancelled) setLoaded(true);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [persistToServer]);

    const setPref = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
        setPrefs(prev => {
            const next = { ...prev, [key]: value };
            persistToServer(next);
            return next;
        });
    }, [persistToServer]);

    // Clean up debounce timer on unmount
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, []);

    return (
        <PreferencesContext.Provider value={{ prefs, loaded, setPref }}>
            {children}
        </PreferencesContext.Provider>
    );
}

export function usePreferences() {
    const ctx = useContext(PreferencesContext);
    if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
    return ctx;
}
