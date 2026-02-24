"use client";

import { clsx } from "clsx";

/** Skeleton shimmer block for loading states */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
    return (
        <div
            className={clsx(
                "animate-pulse rounded-lg bg-zinc-800/50",
                className
            )}
            style={style}
        />
    );
}

/** Skeleton for a stat card */
export function SkeletonCard() {
    return (
        <div className="glass-card rounded-2xl p-6 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
        </div>
    );
}

/** Skeleton for a chart area */
export function SkeletonChart({ className = "h-[200px]" }: { className?: string }) {
    return (
        <div className={clsx(className, "w-full")}>
            <Skeleton className="h-4 w-40 mb-5" />
            <div className="flex items-end gap-1" style={{ height: "calc(100% - 2.5rem)" }}>
                {Array.from({ length: 14 }).map((_, i) => (
                    <Skeleton
                        key={i}
                        className="flex-1 rounded-sm"
                        style={{ height: `${25 + ((i * 37 + 13) % 60)}%` } as React.CSSProperties}
                    />
                ))}
            </div>
        </div>
    );
}

/** Skeleton for a transaction row */
export function SkeletonRow() {
    return (
        <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
            <div className="flex items-center space-x-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-2 w-20" />
                </div>
            </div>
            <Skeleton className="h-4 w-16" />
        </div>
    );
}

/** Skeleton for a list of transaction rows */
export function SkeletonTransactionList({ count = 5 }: { count?: number }) {
    return (
        <div className="space-y-4">
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonRow key={i} />
            ))}
        </div>
    );
}

/** Skeleton for the full transactions table (with thead) */
export function SkeletonTable({ rows = 8 }: { rows?: number }) {
    return (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 animate-pulse">
            <div className="bg-zinc-900 px-6 py-4 flex gap-8">
                {["w-16", "w-32", "w-24", "w-20", "w-20"].map((w, i) => (
                    <div key={i} className={`h-3 rounded ${w} bg-zinc-800`} />
                ))}
            </div>
            <div className="divide-y divide-zinc-800">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="flex items-center gap-8 px-6 py-4">
                        <div className="h-3 w-20 rounded bg-zinc-800/70" />
                        <div className="h-3 w-32 rounded bg-zinc-800/70" />
                        <div className="h-3 w-20 rounded bg-zinc-800/70" />
                        <div className="h-3 w-16 rounded bg-zinc-800/70 ml-auto" />
                        <div className="h-3 w-16 rounded bg-zinc-800/70" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Skeleton for QuickGlance forecast cards */
export function SkeletonForecastCards({ count = 6 }: { count?: number }) {
    return (
        <div className="flex space-x-4 overflow-x-hidden pb-2">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="min-w-[140px] flex-shrink-0 rounded-xl bg-zinc-800/50 p-4 animate-pulse space-y-3">
                    <div className="h-2.5 w-16 rounded bg-zinc-700/60" />
                    <div className="flex items-center justify-between">
                        <div className="h-6 w-6 rounded-full bg-zinc-700/60" />
                        <div className="h-3.5 w-14 rounded bg-zinc-700/60" />
                    </div>
                    <div className="h-3 w-20 rounded bg-zinc-700/60" />
                </div>
            ))}
        </div>
    );
}

/** Skeleton for the SafeToSpend card */
export function SkeletonSafeToSpend() {
    return (
        <div className="glass-card rounded-2xl p-6 animate-pulse">
            <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-full bg-zinc-800" />
                <div className="space-y-2">
                    <div className="h-3 w-28 rounded bg-zinc-800" />
                    <div className="h-6 w-24 rounded bg-zinc-800" />
                </div>
            </div>
            <div className="flex justify-between mb-2">
                <div className="h-2.5 w-28 rounded bg-zinc-800" />
                <div className="h-2.5 w-24 rounded bg-zinc-800" />
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800" />
        </div>
    );
}

/** Skeleton for the FinancialHealthScore gauge card */
export function SkeletonHealthScore() {
    return (
        <div className="glass-card rounded-2xl p-6 animate-pulse">
            <div className="flex flex-col md:flex-row gap-6 items-center">
                {/* Gauge placeholder */}
                <div className="h-36 w-36 rounded-full bg-zinc-800/60 shrink-0" />
                <div className="flex-1 space-y-3 w-full">
                    <div className="h-3 w-32 rounded bg-zinc-800" />
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="h-7 w-7 rounded-full bg-zinc-800" />
                            <div className="flex-1 space-y-1">
                                <div className="h-2.5 w-24 rounded bg-zinc-800" />
                                <div className="h-1.5 w-full rounded-full bg-zinc-800" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Skeleton for a recurring transaction entry */
export function SkeletonRecurringList({ count = 4 }: { count?: number }) {
    return (
        <div className="space-y-3 animate-pulse">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-zinc-900/50 border border-zinc-800/50 p-3 gap-3">
                    <div className="h-9 w-9 rounded-full bg-zinc-800 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-28 rounded bg-zinc-800" />
                        <div className="h-2.5 w-20 rounded bg-zinc-800" />
                    </div>
                    <div className="h-4 w-16 rounded bg-zinc-800 shrink-0" />
                </div>
            ))}
        </div>
    );
}

/** Empty state component */
export function EmptyState({
    icon,
    title,
    description,
    action,
}: {
    icon?: React.ReactNode;
    title: string;
    description: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
            {icon && <div className="mb-4 rounded-full bg-zinc-800/50 p-4">{icon}</div>}
            <h3 className="text-lg font-semibold text-zinc-300">{title}</h3>
            <p className="mt-1 text-sm text-zinc-500 max-w-sm">{description}</p>
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
