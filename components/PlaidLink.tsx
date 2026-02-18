"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink, PlaidLinkOnSuccess, PlaidLinkOptions } from 'react-plaid-link';
import { useSync } from "@/contexts/SyncContext";
import { authFetch } from "@/lib/api";

import { Loader2, Plus, CheckCircle2 } from 'lucide-react';

export function PlaidLink() {
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSyncingAfterConnect, setIsSyncingAfterConnect] = useState(false);

    const { accounts, transactions } = useSync();
    // Determine if connected from SyncContext data (avoids expensive /api/transactions call)
    const isConnected = (accounts && accounts.length > 0) || (transactions && transactions.length > 0);

    useEffect(() => {
        let cancelled = false;

        const createLinkToken = async () => {
            try {
                const response = await authFetch('/api/plaid/create_link_token', {
                    method: 'POST',
                });
                const data = await response.json();
                if (!cancelled) setToken(data.link_token);
            } catch (error) {
                console.error('Error creating link token:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        createLinkToken();

        return () => { cancelled = true; };
    }, []);

    const { triggerUpdate } = useSync();

    const onSuccess = useCallback<PlaidLinkOnSuccess>(async (public_token, metadata) => {
        try {
            setIsSyncingAfterConnect(true);

            await authFetch('/api/plaid/exchange_public_token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    public_token,
                    metadata,
                }),
            });

            // Trigger a global sync — retry if Plaid hasn't made transactions available yet
            await triggerUpdate({ retryOnEmpty: true });

        } catch (error) {
            console.error('Error exchanging public token:', error);
        } finally {
            setIsSyncingAfterConnect(false);
        }
    }, [triggerUpdate]);

    const config: PlaidLinkOptions = {
        token,
        onSuccess,
    };

    const { open, ready } = usePlaidLink(config);

    if (loading) {
        return (
            <button type="button" disabled className="flex items-center gap-2 rounded-xl bg-blue-600/50 px-4 py-2 text-sm font-medium text-white cursor-not-allowed">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
            </button>
        )
    }

    return (
        <div className="flex flex-col gap-2">
            {isConnected && !isSyncingAfterConnect && (
                <div className="flex items-center gap-2 rounded-xl bg-green-600/20 px-4 py-2 text-sm font-medium text-green-500 border border-green-600/20">
                    <CheckCircle2 className="h-4 w-4" />
                    Bank Connected
                </div>
            )}
            {isSyncingAfterConnect && (
                <div className="flex items-center gap-2 rounded-xl bg-blue-600/20 px-4 py-2 text-sm font-medium text-blue-400 border border-blue-600/20">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing your transactions...
                </div>
            )}
            <button
                type="button"
                onClick={() => open()}
                disabled={!ready || isSyncingAfterConnect}
                className="group flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/20 disabled:opacity-50"
            >
                <Plus className="h-4 w-4" />
                {isConnected ? "Add Another Bank" : "Connect Bank"}
            </button>
        </div>
    );
}
