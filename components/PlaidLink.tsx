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
        const checkConnection = async () => {
            try {
                // We can check if we have transactions as a proxy for connection
                const res = await fetch('/api/transactions');
                const data = await res.json();
                if (data.transactions && data.transactions.length > 0) {
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
                setToken(data.link_token);
            } catch (error) {
                console.error('Error creating link token:', error);
            } finally {
                setLoading(false);
            }
        };
        createLinkToken();
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
            <button disabled className="flex items-center gap-2 rounded-xl bg-blue-600/50 px-4 py-2 text-sm font-medium text-white cursor-not-allowed">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
            </button>
        )
    }

    return (
        <button
            onClick={() => !isConnected && open()}
            disabled={!ready || isConnected}
            className={`group flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all ${isConnected
                ? "bg-green-600/20 text-green-500 cursor-default border border-green-600/20"
                : "bg-blue-600 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/20 disabled:opacity-50"
                }`}
        >
            {isConnected ? (
                <>
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    Bank Connected
                </>
            ) : (
                <>
                    <Plus className="h-4 w-4" />
                    Connect Bank
                </>
            )}
        </button>
    );
}
