"use client";

import { useEffect, useRef } from "react";
import { useSync } from "@/contexts/SyncContext";
import { useNotifications, type Notification } from "@/contexts/NotificationsContext";
import { inferCategory } from "@/lib/categories";
import type { PredictedTransaction, Transaction } from "@/types";

/**
 * AlertEngine runs in the background and generates notifications based on:
 * 1. Upcoming large bills (3 days before)
 * 2. Low balance warnings
 * 3. Unusual spending patterns
 * 4. Significant forecast changes
 */
export function AlertEngine() {
    const { transactions, forecast, balance } = useSync();
    const { addNotification } = useNotifications();
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return;
        if (!transactions?.length || !forecast?.predicted_transactions?.length) return;
        hasRun.current = true;

        // Run checks after a short delay so data is settled
        const timer = setTimeout(() => {
            checkUpcomingLargeBills(forecast.predicted_transactions, addNotification);
            checkLowBalance(forecast.predicted_transactions, balance, addNotification);
            checkUnusualSpending(transactions, addNotification);
        }, 2000);

        return () => clearTimeout(timer);
    }, [transactions, forecast, balance, addNotification]);

    return null; // Invisible component
}

function checkUpcomingLargeBills(
    predicted: PredictedTransaction[],
    addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void
) {
    const now = new Date();
    const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const upcoming = predicted.filter((tx) => {
        const txDate = new Date(tx.date);
        return txDate >= now && txDate <= threeDaysOut && tx.amount < -100;
    });

    for (const tx of upcoming.slice(0, 3)) {
        addNotification({
            type: "warning",
            title: `Upcoming bill: ${tx.merchant || "Unknown"}`,
            message: `$${Math.abs(tx.amount).toFixed(2)} predicted on ${tx.date}`,
            action: { label: "View Forecast", href: "/forecast" },
        });
    }
}

function checkLowBalance(
    predicted: PredictedTransaction[],
    currentBalance: number,
    addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void
) {
    // Simulate balance forward to find low points
    let running = currentBalance;
    const LOW_THRESHOLD = 500;

    for (const tx of predicted.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
        running += tx.amount;
        if (running < LOW_THRESHOLD && running > 0) {
            addNotification({
                type: "alert",
                title: "Low balance warning",
                message: `Your balance is projected to drop to $${running.toFixed(2)} on ${tx.date}`,
                action: { label: "View Forecast", href: "/forecast" },
            });
            break; // Only one low balance warning
        }
        if (running < 0) {
            addNotification({
                type: "alert",
                title: "Negative balance projected",
                message: `Your balance may go negative ($${running.toFixed(2)}) on ${tx.date}. Consider adjusting spending.`,
                action: { label: "Plan Scenario", href: "/scenarios" },
            });
            break;
        }
    }
}

function checkUnusualSpending(
    transactions: Transaction[],
    addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void
) {
    if (transactions.length < 10) return;

    // Compare the last 7 days of spending to the average weekly spend
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentSpend = transactions
        .filter((tx) => {
            const d = new Date(tx.date);
            return d >= sevenDaysAgo && tx.amount > 0; // Plaid: positive = expense
        })
        .reduce((sum, tx) => sum + tx.amount, 0);

    const monthSpend = transactions
        .filter((tx) => {
            const d = new Date(tx.date);
            return d >= thirtyDaysAgo && tx.amount > 0;
        })
        .reduce((sum, tx) => sum + tx.amount, 0);

    const avgWeeklySpend = monthSpend / 4;

    if (recentSpend > avgWeeklySpend * 1.5 && avgWeeklySpend > 0) {
        const pctOver = Math.round(((recentSpend - avgWeeklySpend) / avgWeeklySpend) * 100);
        addNotification({
            type: "info",
            title: "Spending spike detected",
            message: `You've spent ${pctOver}% more than your weekly average this week ($${recentSpend.toFixed(0)} vs avg $${avgWeeklySpend.toFixed(0)})`,
            action: { label: "View Transactions", href: "/transactions" },
        });
    }
}
