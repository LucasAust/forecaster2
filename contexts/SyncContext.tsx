"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchTransactions, authFetch } from '@/lib/api';
import type { Transaction, Forecast, PlaidAccount, LoadingStage, SyncState, ClarificationQuestion, ClarificationAnswer } from '@/types';

const SyncContext = createContext<SyncState | undefined>(undefined);

// ─── Helpers ────────────────────────────────────────────────

function calculateBalance(accounts: PlaidAccount[]): number {
    return accounts.reduce((acc, account) => {
        const bal = account.balances.current || 0;
        if (account.type === 'depository' || account.type === 'investment') return acc + bal;
        if (account.type === 'credit' || account.type === 'loan') return acc - bal;
        return acc;
    }, 0);
}

/**
 * POST to /api/forecast with a hard 45-second timeout.
 * Ensures isSyncingRef never gets permanently locked by a hanging API.
 * Returns null on any error (caller handles gracefully).
 */
async function callForecastAPI(txs: Transaction[], force: boolean): Promise<Forecast | null> {
    if (!txs || txs.length === 0) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
        const res = await fetch('/api/forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: txs, force }),
            signal: controller.signal,
        });
        if (res.status === 401) {
            if (typeof window !== 'undefined') window.location.href = '/login';
            return null;
        }
        if (!res.ok) { console.error(`Forecast API ${res.status}`); return null; }
        return (await res.json()) as Forecast;
    } catch (e) {
        if ((e as Error).name === 'AbortError') console.error('Forecast API timed out');
        else console.error('Forecast API error:', e);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ─── Provider ───────────────────────────────────────────────

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [forecast, setForecast] = useState<Forecast | null>(null);
    const [balance, setBalance] = useState(0);
    const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
    const [loadingStage, setLoadingStage] = useState<LoadingStage>('idle');
    const [error, setError] = useState<string | null>(null);
    const [forecastError, setForecastError] = useState<string | null>(null);
    const [hasLinkedBank, setHasLinkedBank] = useState(false);
    const [pendingClarifications, setPendingClarifications] = useState<ClarificationQuestion[]>([]);

    const isSyncingRef = useRef(false);
    // Set by PlaidLink when a bank-connect sync is requested while we're already syncing
    const pendingBankConnectRef = useRef(false);
    const bgPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Cleanup ──────────────────────────────────────────────
    useEffect(() => {
        return () => { if (bgPollTimerRef.current) clearTimeout(bgPollTimerRef.current); };
    }, []);

    // ── Clarification helpers ────────────────────────────────

    const fetchClarificationsInBackground = useCallback(async (txs: Transaction[]) => {
        try {
            const res = await authFetch('/api/transactions/clarify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactions: txs.slice(0, 200) }),
            });
            if (!res.ok) return;
            const data = (await res.json()) as { questions: ClarificationQuestion[] };
            if (data.questions?.length > 0) setPendingClarifications(data.questions.slice(0, 5));
        } catch (e) { console.error('fetchClarifications failed:', e); }
    }, []);

    const submitClarifications = useCallback(async (answers: ClarificationAnswer[]) => {
        setPendingClarifications([]);
        if (answers.length === 0) return;
        try {
            await authFetch('/api/transactions/clarify', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ overrides: answers }),
            });
            const data = await fetchTransactions(true);
            if (data.transactions && data.transactions.length > 0) {
                setTransactions(data.transactions);
                if (data.accounts) { setAccounts(data.accounts); setBalance(calculateBalance(data.accounts)); }
                if (data.hasLinkedBank !== undefined) setHasLinkedBank(data.hasLinkedBank);
                const fc = await callForecastAPI(data.transactions, true);
                if (fc) { setForecast(fc); setForecastError(null); setLoadingStage('complete'); setLastUpdated(new Date()); }
                else setForecastError('Forecast model could not generate predictions. Showing latest data.');
            }
        } catch (e) { console.error('submitClarifications failed:', e); }
    }, []);

    const dismissClarifications = useCallback(() => setPendingClarifications([]), []);

    // ── Background poll (Plaid first-time data latency) ──────
    // Polls every 30s, up to 10 minutes, until transactions appear.
    const startBackgroundPoll = useCallback((attempt: number) => {
        if (bgPollTimerRef.current) clearTimeout(bgPollTimerRef.current);
        if (attempt >= 20) return; // max 20 × 30s = 10 min

        bgPollTimerRef.current = setTimeout(async () => {
            if (isSyncingRef.current) { startBackgroundPoll(attempt + 1); return; }
            try {
                const data = await fetchTransactions(true);
                if (data.transactions && data.transactions.length > 0) {
                    setTransactions(data.transactions);
                    if (data.accounts) { setAccounts(data.accounts); setBalance(calculateBalance(data.accounts)); }
                    if (data.hasLinkedBank !== undefined) setHasLinkedBank(data.hasLinkedBank);
                    const fc = await callForecastAPI(data.transactions, true);
                    if (fc) {
                        setForecast(fc); setForecastError(null); setLoadingStage('complete'); setLastUpdated(new Date());
                        fetchClarificationsInBackground(data.transactions);
                        authFetch('/api/suggestions', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ history: data.transactions, forecast: fc }),
                        }).catch(console.error);
                    } else {
                        setForecastError('Forecast model could not generate predictions. Showing latest data.');
                    }
                    // stop poll — done
                } else {
                    startBackgroundPoll(attempt + 1);
                }
            } catch { startBackgroundPoll(attempt + 1); }
        }, 30_000);
    }, [fetchClarificationsInBackground]);

    // ── Primary sync trigger ─────────────────────────────────

    const triggerUpdate = useCallback(async (options?: { retryOnEmpty?: boolean }) => {
        if (isSyncingRef.current) {
            if (options?.retryOnEmpty) pendingBankConnectRef.current = true;
            return;
        }
        isSyncingRef.current = true;
        setIsSyncing(true);
        setError(null);
        setSyncProgress(10);
        setLoadingStage('transactions');

        const maxRetries = options?.retryOnEmpty ? 12 : 0;
        let attempt = 0;
        let data: { transactions: Transaction[]; accounts: PlaidAccount[]; hasLinkedBank?: boolean } = { transactions: [], accounts: [] };

        try {
            while (attempt <= maxRetries) {
                data = await fetchTransactions(true);
                if (data.transactions && data.transactions.length > 0) break;
                if (attempt < maxRetries) {
                    attempt++;
                    setSyncProgress(10 + Math.min(attempt * 3, 35));
                    await new Promise(r => setTimeout(r, 5_000));
                } else break;
            }

            setTransactions(data.transactions || []);
            if (data.accounts) { setAccounts(data.accounts); setBalance(calculateBalance(data.accounts)); }
            if (data.hasLinkedBank !== undefined) setHasLinkedBank(data.hasLinkedBank);
            setSyncProgress(50);

            if (data.transactions && data.transactions.length > 0) {
                setLoadingStage('forecast');
                const fc = await callForecastAPI(data.transactions, true);
                if (fc) {
                    setForecast(fc);
                    setForecastError(null);
                    authFetch('/api/suggestions', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ history: data.transactions, forecast: fc }),
                    }).catch(console.error);
                    if (options?.retryOnEmpty) fetchClarificationsInBackground(data.transactions);
                } else {
                    setForecastError('Forecast model could not generate predictions. Showing latest transactions.');
                }
            } else if (options?.retryOnEmpty) {
                // Plaid not ready after 60s of retries — poll silently in background
                startBackgroundPoll(0);
            }

            setSyncProgress(100);
            setLastUpdated(new Date());
            setLoadingStage('complete');
        } catch (err) {
            console.error('triggerUpdate failed:', err);
            setError('Failed to sync data. Please try again.');
            setLoadingStage('complete');
            if (options?.retryOnEmpty) startBackgroundPoll(0);
        } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
            setTimeout(() => setSyncProgress(0), 2000);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchClarificationsInBackground, startBackgroundPoll]);

    // ── Flush queued bank-connect update ─────────────────────
    // When a triggerUpdate({retryOnEmpty}) was requested while we were syncing,
    // this useEffect fires it as soon as isSyncing goes false.
    useEffect(() => {
        if (!isSyncing && pendingBankConnectRef.current) {
            pendingBankConnectRef.current = false;
            setTimeout(() => triggerUpdate({ retryOnEmpty: true }), 50);
        }
    }, [isSyncing, triggerUpdate]);

    // ── Initial data load ─────────────────────────────────────
    useEffect(() => {
        (async () => {
            if (isSyncingRef.current) return;
            isSyncingRef.current = true;
            setIsSyncing(true);
            try {
                setLoadingStage('transactions');
                setError(null);
                const data = await fetchTransactions();
                setTransactions(data.transactions || []);
                if (data.accounts) { setAccounts(data.accounts); setBalance(calculateBalance(data.accounts)); }
                if (data.hasLinkedBank !== undefined) setHasLinkedBank(data.hasLinkedBank);
                if (data.transactions && data.transactions.length > 0) {
                    setLoadingStage('forecast');
                    const fc = await callForecastAPI(data.transactions, false);
                    if (fc) { setForecast(fc); setForecastError(null); }
                    else setForecastError('Forecast model could not generate predictions. Showing latest transactions.');
                }
                setLoadingStage('complete');
                setLastUpdated(new Date());
            } catch (e) {
                console.error('Initial load failed', e);
                setError('Failed to load your financial data. Please refresh.');
                setLoadingStage('complete');
            } finally {
                isSyncingRef.current = false;
                setIsSyncing(false);
            }
        })();
    // Run exactly once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <SyncContext.Provider value={{
            isSyncing, syncProgress, lastUpdated, triggerUpdate,
            transactions, forecast, balance, accounts, loadingStage, error, forecastError, hasLinkedBank,
            pendingClarifications, submitClarifications, dismissClarifications,
        }}>
            {children}
        </SyncContext.Provider>
    );
}

export function useSync(): SyncState {
    const ctx = useContext(SyncContext);
    if (!ctx) throw new Error('useSync must be used inside SyncProvider');
    return ctx;
}
