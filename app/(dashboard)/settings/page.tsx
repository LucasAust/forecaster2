import { Shield } from 'lucide-react';
import { createClient } from '@/utils/supabase/server';
import { MfaManager } from './MfaManager';

export default async function SettingsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return null;
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasMfa = factors?.all?.some(f => f.status === 'verified');

    return (
        <div className="flex-1 space-y-8 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-white">Settings</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <div className="col-span-4 space-y-4">
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
                            {/* Client component will be mounted here for MFA management */}
                            <div className="rounded-lg bg-zinc-900/50 p-4">
                                <p className="text-sm text-zinc-400 mb-4">
                                    Multi-factor authentication (MFA) adds an extra layer of security to your account.
                                </p>
                                <MfaManager factors={factors?.all || []} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
