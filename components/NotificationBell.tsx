"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck, Trash2, AlertTriangle, Info, TrendingDown, DollarSign } from "lucide-react";
import { useNotifications, Notification } from "@/contexts/NotificationsContext";
import { clsx } from "clsx";
import Link from "next/link";

const TYPE_ICONS: Record<Notification["type"], React.ElementType> = {
    warning: AlertTriangle,
    info: Info,
    success: Check,
    alert: TrendingDown,
};

const TYPE_COLORS: Record<Notification["type"], string> = {
    warning: "text-amber-400",
    info: "text-blue-400",
    success: "text-emerald-400",
    alert: "text-rose-400",
};

export function NotificationBell() {
    const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div className="relative" ref={panelRef}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="relative rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                title="Notifications"
            >
                <Bell size={18} />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 z-50 w-80 max-h-96 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                        <h3 className="text-sm font-semibold text-white">Notifications</h3>
                        <div className="flex items-center gap-2">
                            {unreadCount > 0 && (
                                <button
                                    type="button"
                                    onClick={markAllRead}
                                    className="text-xs text-zinc-500 hover:text-white transition-colors"
                                    title="Mark all read"
                                >
                                    <CheckCheck size={14} />
                                </button>
                            )}
                            {notifications.length > 0 && (
                                <button
                                    type="button"
                                    onClick={clearAll}
                                    className="text-xs text-zinc-500 hover:text-rose-400 transition-colors"
                                    title="Clear all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* List */}
                    <div className="overflow-y-auto max-h-72">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
                                <Bell size={24} className="mb-2 opacity-40" />
                                <p className="text-xs">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map(n => {
                                const Icon = TYPE_ICONS[n.type];
                                return (
                                    <div
                                        key={n.id}
                                        onClick={() => markRead(n.id)}
                                        className={clsx(
                                            "flex gap-3 px-4 py-3 border-b border-zinc-800/50 cursor-pointer transition-colors hover:bg-zinc-900/50",
                                            !n.read && "bg-zinc-900/30"
                                        )}
                                    >
                                        <Icon size={16} className={clsx("mt-0.5 shrink-0", TYPE_COLORS[n.type])} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className={clsx("text-xs font-medium truncate", n.read ? "text-zinc-400" : "text-white")}>
                                                    {n.title}
                                                </p>
                                                {!n.read && (
                                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                                                )}
                                            </div>
                                            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.message}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[10px] text-zinc-600">
                                                    {formatTimeAgo(n.timestamp)}
                                                </span>
                                                {n.action && (
                                                    <Link
                                                        href={n.action.href}
                                                        onClick={() => setOpen(false)}
                                                        className="text-[10px] text-blue-400 hover:text-blue-300"
                                                    >
                                                        {n.action.label} →
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function formatTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
