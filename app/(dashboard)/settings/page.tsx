import { createClient } from '@/utils/supabase/server';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ProfileSection, ConnectedAccountsSection, DataExportSection, KeyboardShortcutsSection, DangerZone } from '@/components/SettingsClient';
import { redirect } from 'next/navigation';

export default async function SettingsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    // Fetch user settings
    const { data: settings } = await supabase
        .from('user_settings')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle();

    return (
        <div className="flex-1 space-y-8 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Left column */}
                <div className="space-y-6">
                    <ProfileSection email={user.email || ""} displayName={settings?.display_name || null} />

                    <ThemeToggle />
                </div>

                {/* Right column */}
                <div className="space-y-6">
                    <ConnectedAccountsSection />
                    <DataExportSection />
                    <KeyboardShortcutsSection />
                    <DangerZone />
                </div>
            </div>
        </div>
    );
}
