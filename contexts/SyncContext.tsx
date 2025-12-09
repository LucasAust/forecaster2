"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchTransactions, fetchForecast } from '@/lib/api';

interface SyncContextType {
    isSyncing: boolean;
    syncProgress: number; // 0 to 100
    lastUpdated: Date | null;
    triggerUpdate: () => Promise<void>;
    transactions: any[];
    forecast: any;
    balance: number;
    loadingStage: 'idle' | 'transactions' | 'forecast' | 'complete';
    error: string | null;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [forecast, setForecast] = useState<any>(null);
    const [balance, setBalance] = useState(0);
    const [loadingStage, setLoadingStage] = useState<'idle' | 'transactions' | 'forecast' | 'complete'>('idle');

    // Load initial data from cache on mount
    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            setLoadingStage('transactions');
            const data = await fetchTransactions(); // Default: force=false (cache)
            setTransactions(data.transactions || []);

            // Calculate balance from accounts
            if (data.accounts) {
                console.log("Processing accounts for balance:", data.accounts);
                const totalBalance = data.accounts.reduce((acc: number, account: any) => {
                    const balance = account.balances.current || 0;

                    if (account.type === 'depository' || account.type === 'investment') {
                        // Assets: Add to balance
                        return acc + balance;
                    } else if (account.type === 'credit' || account.type === 'loan') {
                        // Liabilities: Subtract from balance
                        return acc - balance;
                    }
                    return acc;
                }, 0);
                console.log("Calculated Total Balance:", totalBalance);
                setBalance(totalBalance);
            }

            if (data.transactions && data.transactions.length > 0) {
                setLoadingStage('forecast');
                const fc = await fetchForecast(data.transactions); // Default: force=false (cache)
                setForecast(fc);
            }
            setLoadingStage('complete');
            setLastUpdated(new Date());
        } catch (e) {
            console.error("Initial load failed", e);
            // Ensure we don't get stuck in loading state even if sync fails
            setLoadingStage('complete');
        }
    };

    const [error, setError] = useState<string | null>(null);

    const triggerUpdate = useCallback(async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        setError(null);
        setSyncProgress(10);
        setLoadingStage('transactions');

        try {
            // Step 1: Force Sync Transactions (Home Page Priority)
            console.log("Fetching transactions...");
            const data = await fetchTransactions(true); // force=true
            console.log("Transactions fetched:", data.transactions?.length);
            setTransactions(data.transactions || []);

            // Calculate balance from accounts
            if (data.accounts) {
                console.log("Processing accounts for balance (Update):", data.accounts);
                const totalBalance = data.accounts.reduce((acc: number, account: any) => {
                    const balance = account.balances.current || 0;

                    if (account.type === 'depository' || account.type === 'investment') {
                        return acc + balance;
                    } else if (account.type === 'credit' || account.type === 'loan') {
                        return acc - balance;
                    }
                    return acc;
                }, 0);
                console.log("Calculated Total Balance (Update):", totalBalance);
                setBalance(totalBalance);
            }

            setSyncProgress(50);
            setLoadingStage('forecast');

            // Step 2: Force Sync Forecast (Background/Next Priority)
            if (data.transactions && data.transactions.length > 0) {
                const fc = await fetchForecast(data.transactions, true); // force=true
                setForecast(fc);

                // Step 3: Trigger AI Suggestions (Background)
                // We don't await this to keep UI responsive, or maybe we do?
                // User said "generate when a user connects a bank or updates predictions"
                // It's better to fire and forget or let it run in background.
                console.log("Triggering AI Suggestions update...");
                fetch('/api/suggestions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ history: data.transactions, forecast: fc })
                }).then(() => console.log("AI Suggestions updated"))
                    .catch(e => console.error("Failed to update suggestions", e));
            }

            setSyncProgress(100);
            setLastUpdated(new Date());
            setLoadingStage('complete');
        } catch (err) {
            console.error("Sync failed", err);
            setError("Failed to sync data. Please try again.");
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
