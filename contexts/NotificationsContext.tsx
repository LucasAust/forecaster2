"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface Notification {
    id: string;
    type: "warning" | "info" | "success" | "alert";
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    action?: { label: string; href: string };
}

interface NotificationsContextType {
    notifications: Notification[];
    unreadCount: number;
    addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void;
    markRead: (id: string) => void;
    markAllRead: () => void;
    clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const STORAGE_KEY = "arc-notifications";

function loadNotifications(): Notification[] {
    if (typeof window === "undefined") return [];
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        return JSON.parse(stored).map((n: Omit<Notification, "timestamp"> & { timestamp: string }) => ({ ...n, timestamp: new Date(n.timestamp) }));
    } catch {
        return [];
    }
}

function saveNotifications(notifications: Notification[]) {
    // Keep only last 50
    const trimmed = notifications.slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    useEffect(() => {
        setNotifications(loadNotifications());
    }, []);

    const addNotification = useCallback((n: Omit<Notification, "id" | "timestamp" | "read">) => {
        setNotifications(prev => {
            // Prevent duplicate alerts with same title within 1 hour
            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            const isDuplicate = prev.some(
                p => p.title === n.title && p.timestamp.getTime() > oneHourAgo
            );
            if (isDuplicate) return prev;

            const notification: Notification = {
                ...n,
                id: Date.now().toString() + Math.random().toString(36).slice(2),
                timestamp: new Date(),
                read: false,
            };
            const updated = [notification, ...prev];
            saveNotifications(updated);
            return updated;
        });
    }, []);

    const markRead = useCallback((id: string) => {
        setNotifications(prev => {
            const updated = prev.map(n => n.id === id ? { ...n, read: true } : n);
            saveNotifications(updated);
            return updated;
        });
    }, []);

    const markAllRead = useCallback(() => {
        setNotifications(prev => {
            const updated = prev.map(n => ({ ...n, read: true }));
            saveNotifications(updated);
            return updated;
        });
    }, []);

    const clearAll = useCallback(() => {
        setNotifications([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <NotificationsContext.Provider value={{ notifications, unreadCount, addNotification, markRead, markAllRead, clearAll }}>
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotifications() {
    const ctx = useContext(NotificationsContext);
    if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
    return ctx;
}
