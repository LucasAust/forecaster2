import { Shield } from 'lucide-react';
import { createClient } from '@/utils/supabase/server';
import { MfaManager } from './MfaManager';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ProfileSection, ConnectedAccountsSection, DataExportSection, KeyboardShortcutsSection, DangerZone } from '@/components/SettingsClient';
import { redirect } from 'next/navigation';

export default async function SettingsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasTotpMfa = factors?.all?.some(f => f.factor_type === 'totp' && f.status === 'verified');

    // Fetch user settings (including mfa_method)
    const { data: settings } = await supabase
        .from('user_settings')
        .select('display_name, mfa_method')
        .eq('user_id', user.id)
        .single();

    const hasMfa = hasTotpMfa || settings?.mfa_method === 'email';

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

                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-6">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Shield className="h-5 w-5 text-blue-500" />
                                    <h3 className="text-lg font-medium text-white">Security</h3>
                                </div>
                                <p className="text-sm text-zinc-400">
                                    Manage your account security and multi-factor authentication.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${hasMfa
                                    ? "bg-green-500/10 text-green-500 ring-1 ring-inset ring-green-500/20"
                                    : "bg-zinc-500/10 text-zinc-400 ring-1 ring-inset ring-zinc-500/20"
                                    }`}>
                                    {hasMfa ? "MFA Enabled" : "MFA Disabled"}
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 border-t border-zinc-800 pt-6">
                            <div className="rounded-lg bg-zinc-900/50 p-4">
                                <p className="text-sm text-zinc-400 mb-4">
                                    Multi-factor authentication (MFA) adds an extra layer of security to your account.
                                </p>
                                <MfaManager factors={factors?.all || []} mfaMethod={settings?.mfa_method || null} />
                            </div>
                        </div>
                    </div>
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
