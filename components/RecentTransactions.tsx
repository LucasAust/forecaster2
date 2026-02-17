"use client";

import { ArrowDownRight, ArrowUpRight, CreditCard } from "lucide-react";
import { useSync } from "@/contexts/SyncContext";
import { getDisplayMerchant } from "@/lib/merchants";
import { SkeletonTransactionList, EmptyState } from "@/components/Skeleton";

export function RecentTransactions() {
    const { transactions, loadingStage } = useSync();

    if (loadingStage === 'transactions') return <SkeletonTransactionList count={5} />;

    // Get last 5 transactions
    const recent = transactions.slice(0, 5);

    if (transactions.length === 0) return (
        <EmptyState
            icon={<CreditCard className="h-6 w-6 text-zinc-600" />}
            title="No transactions yet"
            description="Connect your bank account to see your recent activity here."
        />
    );

    return (
        <div className="space-y-4">
            {recent.map((tx, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                    <div className="flex items-center space-x-3">
                        <div className={`rounded-full p-2 ${tx.amount > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                            {tx.amount > 0 ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white">{getDisplayMerchant(tx)}</p>
                            <p className="text-xs text-zinc-500">{new Date(tx.date).toLocaleDateString()}</p>
                        </div>
                    </div>
                    <span className={`text-sm font-bold ${tx.amount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {tx.amount > 0 ? '−' : '+'}${Math.abs(tx.amount).toFixed(2)}
                    </span>
                </div>
            ))}
        </div>
    );
}
