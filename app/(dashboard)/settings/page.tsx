import { createClient } from '@/utils/supabase/server';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ProfileSection, ConnectedAccountsSection, DataExportSection, KeyboardShortcutsSection, DangerZone } from '@/components/SettingsClient';
import { MfaManager } from './MfaManager';
import { redirect } from 'next/navigation';
import { Shield } from 'lucide-react';

export default async function SettingsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    // Fetch user settings
    const { data: settings } = await supabase
        .from('user_settings')
        .select('display_name, mfa_method')
        .eq('user_id', user.id)
        .maybeSingle();

    // Fetch MFA factors for the MfaManager
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const mfaFactors = (factors?.all || []).map(f => ({
        id: f.id,
        factor_type: f.factor_type,
        status: f.status,
        friendly_name: f.friendly_name || undefined,
    }));

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

                    {/* MFA / Two-Factor Authentication */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Shield className="h-5 w-5 text-violet-500" />
                            <h3 className="text-lg font-medium text-white">Two-Factor Authentication</h3>
                        </div>
                        <MfaManager factors={mfaFactors} mfaMethod={settings?.mfa_method || null} />
                    </div>

                    <DataExportSection />
                    <KeyboardShortcutsSection />
                    <DangerZone />
                </div>
            </div>
        </div>
    );
}
