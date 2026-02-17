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
        <div className={clsx("glass-card rounded-2xl p-6", className)}>
            <Skeleton className="h-4 w-40 mb-4" />
            <div className="flex items-end gap-1 h-[calc(100%-2rem)]">
                {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton
                        key={i}
                        className="flex-1"
                        style={{ height: `${30 + Math.random() * 60}%` } as React.CSSProperties}
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
