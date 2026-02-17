import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Shield } from 'lucide-react'
import { MandatoryEnrollment } from './MandatoryEnrollment'
import { isEmailMfaVerified } from '@/lib/mfa-session'

export default async function EnrollPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Check if already enrolled (TOTP)
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const hasVerifiedFactor = factors?.all?.some(
        f => f.factor_type === 'totp' && f.status === 'verified'
    )

    if (hasVerifiedFactor) {
        redirect('/')
    }

    // Check if already enrolled (email MFA)
    const { data: settings } = await supabase
        .from('user_settings')
        .select('mfa_method')
        .eq('user_id', user.id)
        .maybeSingle()

    if (settings?.mfa_method === 'email') {
        // Only redirect if the user has a valid verified session.
        // If the cookie is missing/expired, the enrollment was never completed
        // or has gone stale — clear it and allow re-enrollment.
        const verified = await isEmailMfaVerified(user.id)
        if (verified) {
            redirect('/')
        }
        // Stale/incomplete enrollment — clear it so the user can start fresh
        await supabase
            .from('user_settings')
            .update({ mfa_method: null })
            .eq('user_id', user.id)
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
            <div className="w-full max-w-md space-y-8">
                <div className="flex flex-col items-center justify-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20">
                        <Shield className="h-7 w-7 text-white" />
                    </div>
                    <h2 className="mt-6 text-3xl font-bold tracking-tight text-white">
                        Secure Your Account
                    </h2>
                    <p className="mt-2 text-sm text-zinc-400">
                        Multi-factor authentication is required to continue.
                    </p>
                </div>

                <div className="mt-8 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                    <MandatoryEnrollment />
                </div>
            </div>
        </div>
    )
}
