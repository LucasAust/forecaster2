import { Sidebar } from "@/components/Sidebar";
import { SyncProvider } from "@/contexts/SyncContext";
import { DashboardShell } from "@/components/DashboardShell";

export default function DashboardLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <SyncProvider>
            <DashboardShell>
                <div className="flex min-h-screen">
                    <Sidebar />
                    <main className="flex-1 p-8">
                        {children}
                    </main>
                </div>
            </DashboardShell>
        </SyncProvider>
    );
}
