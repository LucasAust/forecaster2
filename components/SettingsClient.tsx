"use client";

import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/api";
import { User, Mail, CreditCard, Download, Keyboard, Trash2, Save, Check, AlertTriangle, Unplug } from "lucide-react";

interface ConnectedAccount {
    id: string;
    item_id: string;
    created_at: string;
    accounts_data: Array<{
        name: string;
        official_name?: string;
        type: string;
        subtype?: string;
        mask?: string;
        balances?: { current?: number };
    }> | null;
}

export function ProfileSection({ email, displayName: initialName }: { email: string; displayName: string | null }) {
    const [displayName, setDisplayName] = useState(initialName || "");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            const res = await authFetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ display_name: displayName }),
            });
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-6">
            <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-blue-500" />
                <h3 className="text-lg font-medium text-white">Profile</h3>
            </div>
            <div className="space-y-4">
                <div>
                    <label htmlFor="settings-display-name" className="text-xs text-zinc-500 mb-1 block">Display Name</label>
                    <div className="flex gap-2">
                        <input
                            id="settings-display-name"
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Enter your name"
                            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                        />
                        <button
                            type="button"
                            onClick={save}
                            disabled={saving}
                            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                        >
                            {saved ? <Check size={14} /> : <Save size={14} />}
                            {saved ? "Saved" : saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>
                <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Email</label>
                    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-400">
                        <Mail size={14} />
                        {email}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ConnectedAccountsSection() {
    const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState<string | null>(null);

    const fetchAccounts = useCallback(async () => {
        try {
            const res = await authFetch("/api/plaid/accounts");
            if (res.ok) {
                const data = await res.json();
                setAccounts(data.items || []);
            }
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    const disconnect = async (itemId: string) => {
        if (!confirm("Are you sure you want to disconnect this account? You'll need to reconnect via Plaid to restore it.")) return;
        setDisconnecting(itemId);
        try {
            const res = await authFetch("/api/plaid/disconnect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ item_id: itemId }),
            });
            if (res.ok) {
                setAccounts(prev => prev.filter(a => a.item_id !== itemId));
            }
        } finally {
            setDisconnecting(null);
        }
    };

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-6">
            <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5 text-blue-500" />
                <h3 className="text-lg font-medium text-white">Connected Accounts</h3>
            </div>
            {loading ? (
                <div className="space-y-3">
                    {[1, 2].map(i => (
                        <div key={i} className="h-16 rounded-lg bg-zinc-800/50 animate-pulse" />
                    ))}
                </div>
            ) : accounts.length === 0 ? (
                <p className="text-sm text-zinc-500">No bank accounts connected. Connect one from the sidebar.</p>
            ) : (
                <div className="space-y-3">
                    {accounts.map(item => (
                        <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    {item.accounts_data && item.accounts_data.length > 0 ? (
                                        <div className="space-y-1">
                                            {item.accounts_data.map((acc, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-white">
                                                        {acc.official_name || acc.name}
                                                    </span>
                                                    {acc.mask && (
                                                        <span className="text-xs text-zinc-500">••••{acc.mask}</span>
                                                    )}
                                                    <span className="text-xs rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400 capitalize">
                                                        {acc.subtype || acc.type}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-sm text-zinc-400">Bank Account</span>
                                    )}
                                    <p className="text-xs text-zinc-600 mt-1">
                                        Connected {new Date(item.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => disconnect(item.item_id)}
                                    disabled={disconnecting === item.item_id}
                                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                                >
                                    <Unplug size={12} />
                                    {disconnecting === item.item_id ? "Disconnecting…" : "Disconnect"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function DataExportSection() {
    const [exporting, setExporting] = useState<string | null>(null);

    const exportAll = async (format: "csv" | "json") => {
        setExporting(format);
        try {
            const res = await authFetch("/api/transactions");
            if (!res.ok) return;
            const data = await res.json();
            const txs = data.transactions || [];

            const rows = txs.map((tx: Record<string, unknown>) => ({
                date: tx.date as string,
                merchant: (tx.merchant_name || tx.name || "Unknown") as string,
                category: Array.isArray(tx.category) ? tx.category[0] : ((tx.category || "") as string),
                amount: tx.amount as number,
            }));

            let blob: Blob;
            let filename: string;

            if (format === "csv") {
                const header = "Date,Merchant,Category,Amount";
                const csvRows = rows.map((r: { date: string; merchant: string; category: string; amount: number }) =>
                    `${r.date},"${String(r.merchant).replace(/"/g, '""')}","${r.category}",${r.amount}`
                );
                blob = new Blob([header + "\n" + csvRows.join("\n")], { type: "text/csv" });
                filename = `arc-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
            } else {
                blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
                filename = `arc-transactions-${new Date().toISOString().slice(0, 10)}.json`;
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(null);
        }
    };

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-6">
            <div className="flex items-center gap-2 mb-4">
                <Download className="h-5 w-5 text-blue-500" />
                <h3 className="text-lg font-medium text-white">Data Export</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-4">Download all your transaction data.</p>
            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={() => exportAll("csv")}
                    disabled={exporting !== null}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
                >
                    {exporting === "csv" ? "Exporting…" : "Export CSV"}
                </button>
                <button
                    type="button"
                    onClick={() => exportAll("json")}
                    disabled={exporting !== null}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
                >
                    {exporting === "json" ? "Exporting…" : "Export JSON"}
                </button>
            </div>
        </div>
    );
}

export function KeyboardShortcutsSection() {
    const shortcuts = [
        { keys: "g then d", action: "Go to Dashboard" },
        { keys: "g then f", action: "Go to Forecast" },
        { keys: "g then b", action: "Go to Budget" },
        { keys: "g then s", action: "Go to Scenarios" },
        { keys: "g then t", action: "Go to Transactions" },
        { keys: "g then x", action: "Go to Settings" },
        { keys: "/", action: "Focus search" },
        { keys: "?", action: "Show shortcut help" },
    ];

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-6">
            <div className="flex items-center gap-2 mb-4">
                <Keyboard className="h-5 w-5 text-blue-500" />
                <h3 className="text-lg font-medium text-white">Keyboard Shortcuts</h3>
            </div>
            <div className="space-y-2">
                {shortcuts.map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5">
                        <span className="text-sm text-zinc-400">{s.action}</span>
                        <kbd className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-300 border border-zinc-700">
                            {s.keys}
                        </kbd>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function DangerZone() {
    const [confirming, setConfirming] = useState(false);

    const deleteAccount = async () => {
        if (!confirm("This will permanently delete your account and ALL data. This action cannot be undone. Are you absolutely sure?")) return;
        // Double-confirm
        const input = prompt("Type DELETE to confirm account deletion:");
        if (input !== "DELETE") return;

        try {
            const res = await authFetch("/api/settings/delete-account", { method: "DELETE" });
            if (res.ok) {
                window.location.href = "/login";
            }
        } catch {
            alert("Failed to delete account. Please try again.");
        }
    };

    return (
        <div className="rounded-xl border border-rose-900/30 bg-rose-950/10 p-6">
            <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-rose-500" />
                <h3 className="text-lg font-medium text-rose-400">Danger Zone</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-4">
                Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <button
                type="button"
                onClick={deleteAccount}
                className="flex items-center gap-1.5 rounded-lg border border-rose-700/50 bg-rose-600/10 px-4 py-2 text-sm font-medium text-rose-400 hover:bg-rose-600/20 hover:text-rose-300 transition-colors"
            >
                <Trash2 size={14} />
                Delete Account
            </button>
        </div>
    );
}
