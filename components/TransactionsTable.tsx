"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { useSync } from "@/contexts/SyncContext";

export function TransactionsTable({ filter = 'all', searchQuery = '' }: { filter?: 'all' | 'actual' | 'predicted', searchQuery?: string }) {
    const { transactions, forecast, loadingStage, balance } = useSync();

    // 1. Separate and Sort Data
    let actualTransactions: any[] = [];
    let predictedTransactions: any[] = [];

    // NOTE: We normalize amounts so that EXPENSE is NEGATIVE and INCOME is POSITIVE.
    // Plaid usually provides positive amounts for expenses. So we invert them (-1 * amount).
    // If the data source changes, this might need adjustment.

    if (transactions) {
        // Sort Actual: Descending (Newest First) for calculation
        // ACTUALS (Plaid style): Expense is Positive. We INVERT to match Standard (Expense is Negative).
        actualTransactions = transactions
            .map((t: any) => ({ ...t, amount: -t.amount, type: 'actual', dateObj: new Date(t.date) }))
            .sort((a: any, b: any) => b.dateObj.getTime() - a.dateObj.getTime());
    }

    if (forecast && forecast.predicted_transactions) {
        // Sort Predicted: Ascending (Oldest/Soonest First) for forward calculation
        // PREDICTED (Standard style): Expense is already Negative. Keep as is.
        predictedTransactions = forecast.predicted_transactions
            .map((t: any) => ({ ...t, amount: t.amount, type: 'predicted', dateObj: new Date(t.date) }))
            .sort((a: any, b: any) => a.dateObj.getTime() - b.dateObj.getTime());
    }

    // 2. Calculate Balances
    const currentBalance = balance;

    // Process Actuals (Backwards from Current Balance)
    // We start at Current Balance.
    // For the most recent transaction (t0), the balance AFTER it is CurrentBalance.
    // The balance BEFORE it (which is the balance for the NEXT row t-1) is CurrentBalance - Amount.
    // Since Amount is Negative for Expense: Current - (-Expense) = Current + Expense. (Balance was higher before).

    let tempBalance = currentBalance;
    const processedActuals = actualTransactions.map(tx => {
        const rowBalance = tempBalance;
        tempBalance = tempBalance - tx.amount; // "Un-do" the transaction to get previous balance
        return { ...tx, balance: rowBalance };
    });

    // Process Predicted (Forwards from Current Balance)
    // We start at Current Balance.
    // For the first predicted transaction (t1), value is Current + Amount.
    // Since Amount is Negative for Expense: Current + (-Expense) = Current - Expense. (Balance goes down).

    tempBalance = currentBalance;
    const processedPredicted = predictedTransactions.map(tx => {
        tempBalance = tempBalance + tx.amount; // Apply the transaction
        return { ...tx, balance: tempBalance };
    });

    // 3. Combine and Sort for Display (Descending: Future -> Present -> Past)
    const allTransactions = [...processedPredicted, ...processedActuals].sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

    // 4. Filter
    const filtered = allTransactions.filter(tx => {
        // Type filter
        if (filter === 'actual' && tx.type !== 'actual') return false;
        if (filter === 'predicted' && tx.type !== 'predicted') return false;

        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const merchant = (tx.merchant_name || tx.name || tx.merchant || "").toLowerCase();
            const category = (Array.isArray(tx.category) ? tx.category[0] : (tx.category || "")).toString().toLowerCase();
            return merchant.includes(q) || category.includes(q);
        }

        return true;
    });

    if (loadingStage === 'transactions' && transactions.length === 0) {
        return <div className="text-sm text-zinc-500 p-6">Loading transactions...</div>;
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
                    {filtered.slice(0, 100).map((tx: any, idx: number) => (
                        <tr
                            key={idx}
                            className={clsx(
                                "hover:bg-zinc-800/50 transition-colors",
                                tx.type === "predicted" ? "bg-blue-900/5" : ""
                            )}
                        >
                            <td className={clsx("px-6 py-4 font-medium", tx.type === "predicted" ? "text-blue-400 italic" : "text-zinc-300")}>
                                {tx.date}
                            </td>
                            <td className={clsx("px-6 py-4 font-medium", tx.type === "predicted" ? "text-blue-400 italic" : "text-white")}>
                                {tx.merchant_name || tx.name || tx.merchant}
                                {tx.type === "predicted" && <span className="ml-2 text-[10px] not-italic rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-500">Predicted</span>}
                            </td>
                            <td className={clsx("px-6 py-4", tx.type === "predicted" ? "text-blue-400/80 italic" : "text-zinc-400")}>
                                {Array.isArray(tx.category) ? tx.category[0] : (tx.category || "Uncategorized")}
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className={clsx("flex items-center justify-end font-medium", tx.amount > 0 ? "text-emerald-500" : "text-white")}>
                                    {tx.amount > 0 ? "+" : ""}{typeof tx.amount === 'number' ? tx.amount.toFixed(2) : parseFloat(tx.amount).toFixed(2)}
                                </div>
                            </td>
                            <td className={clsx("px-6 py-4 text-right font-medium", tx.type === "predicted" ? "text-blue-400 italic" : "text-zinc-400")}>
                                ${tx.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
