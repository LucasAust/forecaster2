import { Sidebar } from "@/components/Sidebar";
import { SyncProvider } from "@/contexts/SyncContext";
import { DashboardShell } from "@/components/DashboardShell";
import { MobileHeader } from "@/components/MobileHeader";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { AlertEngine } from "@/components/AlertEngine";
import { NotificationBell } from "@/components/NotificationBell";

export default function DashboardLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <SyncProvider>
            <PreferencesProvider>
            <NotificationsProvider>
            <DashboardShell>
                <KeyboardShortcutsProvider>
                <AlertEngine />
                <div className="flex min-h-screen">
                    {/* Desktop sidebar — hidden on mobile */}
                    <div className="hidden md:block">
                        <Sidebar />
                    </div>
                    <div className="flex-1 flex flex-col">
                        {/* Mobile header with hamburger — visible only on mobile */}
                        <MobileHeader />
                        {/* Notification bell — top right corner */}
                        <div className="absolute top-4 right-4 z-40 hidden md:block">
                            <NotificationBell />
                        </div>
                        <main className="flex-1 p-4 md:p-8" role="main" aria-label="Page content">
                            {children}
                        </main>
                    </div>
                </div>
                </KeyboardShortcutsProvider>
            </DashboardShell>
            </NotificationsProvider>
            </PreferencesProvider>
        </SyncProvider>
    );
}
