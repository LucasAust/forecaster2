"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink, PlaidLinkOnSuccess, PlaidLinkOptions } from 'react-plaid-link';
import { useSync } from "@/contexts/SyncContext";

import { Loader2, Plus } from 'lucide-react';

export function PlaidLink() {
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const checkConnection = async () => {
            try {
                const res = await fetch('/api/transactions');
                const data = await res.json();
                if (!cancelled && data.transactions && data.transactions.length > 0) {
                    setIsConnected(true);
                }
            } catch (e) {
                console.error("Failed to check connection", e);
            }
        };
        checkConnection();

        const createLinkToken = async () => {
            try {
                const response = await fetch('/api/plaid/create_link_token', {
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
            await fetch('/api/plaid/exchange_public_token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    public_token,
                    metadata,
                }),
            });

            setIsConnected(true);
            // Trigger a global sync to fetch the new data
            await triggerUpdate();

        } catch (error) {
            console.error('Error exchanging public token:', error);
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
            {isConnected && (
                <div className="flex items-center gap-2 rounded-xl bg-green-600/20 px-4 py-2 text-sm font-medium text-green-500 border border-green-600/20">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    Bank Connected
                </div>
            )}
            <button
                type="button"
                onClick={() => open()}
                disabled={!ready}
                className="group flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/20 disabled:opacity-50"
            >
                <Plus className="h-4 w-4" />
                {isConnected ? "Add Another Bank" : "Connect Bank"}
            </button>
        </div>
    );
}
