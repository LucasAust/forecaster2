"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchTransactions, fetchForecast } from '@/lib/api';
import type { Transaction, Forecast, PlaidAccount, LoadingStage, SyncState } from '@/types';

const SyncContext = createContext<SyncState | undefined>(undefined);

/** Calculate total balance from accounts (assets - liabilities) */
function calculateBalance(accounts: PlaidAccount[]): number {
    return accounts.reduce((acc, account) => {
        const bal = account.balances.current || 0;
        if (account.type === 'depository' || account.type === 'investment') {
            return acc + bal;
        } else if (account.type === 'credit' || account.type === 'loan') {
            return acc - bal;
        }
        return acc;
    }, 0);
}

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

    // Load initial data from cache on mount
    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            setLoadingStage('transactions');
            setError(null);
            const data = await fetchTransactions();
            setTransactions(data.transactions || []);

            if (data.accounts) {
                setAccounts(data.accounts);
                setBalance(calculateBalance(data.accounts));
            }

            if (data.transactions && data.transactions.length > 0) {
                setLoadingStage('forecast');
                const fc = await fetchForecast(data.transactions);
                setForecast(fc);
            }
            setLoadingStage('complete');
            setLastUpdated(new Date());
        } catch (e) {
            console.error("Initial load failed", e);
            setError("Failed to load your financial data. Please refresh.");
            setLoadingStage('idle');
        } finally {
            setIsSyncing(false);
        }
    };

    const triggerUpdate = useCallback(async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        setError(null);
        setSyncProgress(10);
        setLoadingStage('transactions');

        try {
            const data = await fetchTransactions(true);
            setTransactions(data.transactions || []);

            if (data.accounts) {
                setAccounts(data.accounts);
                setBalance(calculateBalance(data.accounts));
            }

            setSyncProgress(50);
            setLoadingStage('forecast');

            if (data.transactions && data.transactions.length > 0) {
                const fc = await fetchForecast(data.transactions, true);
                setForecast(fc);

                // Fire-and-forget suggestions update
                fetch('/api/suggestions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ history: data.transactions, forecast: fc })
                }).catch(e => console.error("Failed to update suggestions", e));
            }

            setSyncProgress(100);
            setLastUpdated(new Date());
            setLoadingStage('complete');
        } catch (err) {
            console.error("Sync failed", err);
            setError("Failed to sync data. Please try again.");
            setLoadingStage('complete');
        } finally {
            setIsSyncing(false);
            setTimeout(() => setSyncProgress(0), 2000);
        }
    }, [isSyncing]);

    return (
        <SyncContext.Provider value={{
            isSyncing,
            syncProgress,
            lastUpdated,
            triggerUpdate,
            transactions,
            forecast,
            balance,
            accounts,
            loadingStage,
            error
        }}>
            {children}
        </SyncContext.Provider>
    );
}

export function useSync() {
    const context = useContext(SyncContext);
    if (context === undefined) {
        throw new Error('useSync must be used within a SyncProvider');
    }
    return context;
}
