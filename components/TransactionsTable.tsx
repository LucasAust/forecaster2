"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { clsx } from "clsx";
import { useEffect, useState, useMemo, forwardRef, useImperativeHandle } from "react";
import { useSync } from "@/contexts/SyncContext";
import { inferCategory } from "@/lib/categories";
import { getDisplayMerchant } from "@/lib/merchants";
import { TransactionDrawer } from "@/components/TransactionDrawer";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SkeletonTable } from "@/components/Skeleton";
import type { DisplayTransaction, ExportRow } from "@/types";

const PAGE_SIZE = 30;

export interface TransactionsTableHandle {
    exportData: (format: "csv" | "json") => void;
}

export const TransactionsTable = forwardRef<TransactionsTableHandle, {
    filter?: 'all' | 'actual' | 'predicted';
    searchQuery?: string;
    dateFrom?: string;
    dateTo?: string;
    amountMin?: number;
    amountMax?: number;
    categoryFilter?: string;
}>(function TransactionsTable({
    filter = 'all',
    searchQuery = '',
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    categoryFilter,
}, ref) {
    const { transactions, forecast, loadingStage, balance } = useSync();
    const [selectedTx, setSelectedTx] = useState<DisplayTransaction | null>(null);

    // 1. Separate, normalize, sort, compute balances — all memoized
    const { processedActuals, processedPredicted, allTransactions } = useMemo(() => {
        let actualTransactions: DisplayTransaction[] = [];
        let predictedTransactions: DisplayTransaction[] = [];

        if (transactions) {
            actualTransactions = transactions
                .map((t) => ({ ...t, amount: -t.amount, type: 'actual' as const, dateObj: new Date(t.date), category: [inferCategory(t)] }))
                .sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
        }

        if (forecast && forecast.predicted_transactions) {
            predictedTransactions = forecast.predicted_transactions
                .map((t) => ({ ...t, amount: t.amount, type: 'predicted' as const, dateObj: new Date(t.date), category: [inferCategory(t)] }))
                .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
        }

        // Calculate Balances for Actuals (backwards from current)
        let tempBalance = balance;
        const procActuals = actualTransactions.map(tx => {
            const rowBalance = tempBalance;
            tempBalance = tempBalance - tx.amount;
            return { ...tx, balance: rowBalance };
        });

        // Calculate Balances for Predicted (forwards from current)
        tempBalance = balance;
        const procPredicted = predictedTransactions.map(tx => {
            tempBalance = tempBalance + tx.amount;
            return { ...tx, balance: tempBalance };
        });

        const all = [...procPredicted, ...procActuals].sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

        return { processedActuals: procActuals, processedPredicted: procPredicted, allTransactions: all };
    }, [transactions, forecast, balance]);

    // 2. Filter — memoized separately
    const filtered = useMemo(() => {
        return allTransactions.filter(tx => {
            if (filter === 'actual' && tx.type !== 'actual') return false;
            if (filter === 'predicted' && tx.type !== 'predicted') return false;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const merchant = (tx.merchant_name || tx.name || tx.merchant || "").toLowerCase();
                const category = (Array.isArray(tx.category) ? tx.category[0] : (tx.category || "")).toString().toLowerCase();
                if (!merchant.includes(q) && !category.includes(q)) return false;
            }

            if (dateFrom) {
                const fromDate = new Date(dateFrom);
                if (tx.dateObj < fromDate) return false;
            }
            if (dateTo) {
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59, 999);
                if (tx.dateObj > toDate) return false;
            }

            const absAmount = Math.abs(tx.amount);
            if (amountMin !== undefined && absAmount < amountMin) return false;
            if (amountMax !== undefined && absAmount > amountMax) return false;

            if (categoryFilter) {
                const txCat = Array.isArray(tx.category) ? tx.category[0] : (tx.category || "");
                if (txCat !== categoryFilter) return false;
            }

            return true;
        });
    }, [allTransactions, filter, searchQuery, dateFrom, dateTo, amountMin, amountMax, categoryFilter]);

    // Export handler
    useImperativeHandle(ref, () => ({
        exportData(format: "csv" | "json") {
            const rows: ExportRow[] = filtered.map((tx) => ({
                date: tx.date,
                merchant: getDisplayMerchant(tx),
                category: Array.isArray(tx.category) ? tx.category[0] : (tx.category || "Uncategorized"),
                amount: tx.amount,
                balance: tx.balance ?? 0,
                type: tx.type,
            }));

            let blob: Blob;
            let filename: string;

            if (format === "csv") {
                const header = "Date,Merchant,Category,Amount,Balance,Type";
                const csvRows = rows.map((r) =>
                    `${r.date},"${r.merchant.replace(/"/g, '""')}","${r.category}",${r.amount.toFixed(2)},${r.balance.toFixed(2)},${r.type}`
                );
                blob = new Blob([header + "\n" + csvRows.join("\n")], { type: "text/csv" });
                filename = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
            } else {
                blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
                filename = `transactions-${new Date().toISOString().slice(0, 10)}.json`;
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        },
    }), [filtered]);

    // Pagination
    const [page, setPage] = useState(0);
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const paginatedRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    // Reset page when filters change
    useEffect(() => {
        setPage(0);
    }, [filter, searchQuery, dateFrom, dateTo, amountMin, amountMax, categoryFilter]);

    if (loadingStage === 'transactions' && transactions.length === 0) {
        return <SkeletonTable rows={8} />;
    }

    if (filtered.length === 0) {
        return (
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
                <p className="text-zinc-400">No transactions found.</p>
                <p className="text-xs text-zinc-500 mt-2">Try adjusting your filters.</p>
            </div>
        );
    }

    return (
        <>
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
            <table className="w-full text-left text-sm">
                <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
                    <tr>
                        <th className="px-6 py-4 font-medium">Date</th>
                        <th className="px-6 py-4 font-medium">Merchant</th>
                        <th className="px-6 py-4 font-medium">Category</th>
                        <th className="px-6 py-4 font-medium text-right">Amount</th>
                        <th className="px-6 py-4 font-medium text-right">Running Balance</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                    {paginatedRows.map((tx) => (
                        <tr
                            key={tx.transaction_id || `${tx.date}-${tx.name || tx.merchant}-${tx.amount}`}
                            onClick={() => setSelectedTx(tx)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTx(tx); } }}
                            tabIndex={0}
                            className={clsx(
                                "hover:bg-zinc-800/50 transition-colors cursor-pointer",
                                tx.type === "predicted" ? "bg-blue-900/5" : ""
                            )}
                        >
                            <td className={clsx("px-6 py-4 font-medium", tx.type === "predicted" ? "text-blue-400 italic" : "text-zinc-300")}>
                                {tx.date}
                            </td>
                            <td className={clsx("px-6 py-4 font-medium", tx.type === "predicted" ? "text-blue-400 italic" : "text-white")}>
                                {getDisplayMerchant(tx)}
                                {tx.type === "predicted" && <span className="ml-2 text-[10px] not-italic rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-500">Predicted</span>}
                            </td>
                            <td className={clsx("px-6 py-4", tx.type === "predicted" ? "text-blue-400/80 italic" : "text-zinc-400")}>
                                {Array.isArray(tx.category) ? tx.category[0] : (tx.category || "Uncategorized")}
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className={clsx("flex items-center justify-end font-medium", tx.amount > 0 ? "text-emerald-400" : "text-rose-400")}>
                                    {tx.amount > 0 ? '+' : '−'}${Math.abs(typeof tx.amount === 'number' ? tx.amount : parseFloat(tx.amount)).toFixed(2)}
                                </div>
                            </td>
                            <td className={clsx("px-6 py-4 text-right font-medium", tx.type === "predicted" ? "text-blue-400 italic" : "text-zinc-400")}>
                                ${(tx.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-zinc-800 px-6 py-3">
                    <p className="text-xs text-zinc-500">
                        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Previous page"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            let pageNum: number;
                            if (totalPages <= 5) {
                                pageNum = i;
                            } else if (page < 3) {
                                pageNum = i;
                            } else if (page > totalPages - 4) {
                                pageNum = totalPages - 5 + i;
                            } else {
                                pageNum = page - 2 + i;
                            }
                            return (
                                <button
                                    type="button"
                                    key={pageNum}
                                    onClick={() => setPage(pageNum)}
                                    className={clsx(
                                        "h-7 w-7 rounded-md text-xs font-medium transition-colors",
                                        page === pageNum
                                            ? "bg-blue-600 text-white"
                                            : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                                    )}
                                >
                                    {pageNum + 1}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Next page"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
        <TransactionDrawer
            transaction={selectedTx}
            onClose={() => setSelectedTx(null)}
            onCategoryChange={(tx, newCat) => {
                const updated = { ...tx, category: [newCat] };
                setSelectedTx(updated);
            }}
        />
        </>
    );
});
