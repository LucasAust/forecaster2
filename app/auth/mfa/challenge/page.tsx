import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Shield } from 'lucide-react'
import { ChallengeForm } from './ChallengeForm'
import { EmailChallengeForm } from './EmailChallengeForm'

export default async function ChallengePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Check which MFA method is configured
    const { data: settings } = await supabase
        .from('user_settings')
        .select('mfa_method')
        .eq('user_id', user.id)
        .single()

    const mfaMethod = settings?.mfa_method

    // TOTP flow
    if (mfaMethod === 'totp') {
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const totpFactor = factors?.all?.find(f => f.factor_type === 'totp' && f.status === 'verified')

        if (!totpFactor) {
            redirect('/')
        }

        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
                <div className="w-full max-w-md space-y-8">
                    <div className="flex flex-col items-center justify-center text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20">
                            <Shield className="h-7 w-7 text-white" />
                        </div>
                        <h2 className="mt-6 text-3xl font-bold tracking-tight text-white">
                            Two-Factor Authentication
                        </h2>
                        <p className="mt-2 text-sm text-zinc-400">
                            Enter the code from your authenticator app
                        </p>
                    </div>
                    <div className="mt-8">
                        <ChallengeForm factorId={totpFactor.id} />
                    </div>
                </div>
            </div>
        )
    }

    // Email flow
    if (mfaMethod === 'email') {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
                <div className="w-full max-w-md space-y-8">
                    <div className="flex flex-col items-center justify-center text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20">
                            <Shield className="h-7 w-7 text-white" />
                        </div>
                        <h2 className="mt-6 text-3xl font-bold tracking-tight text-white">
                            Email Verification
                        </h2>
                        <p className="mt-2 text-sm text-zinc-400">
                            We&apos;ll send a code to your email address
                        </p>
                    </div>
                    <div className="mt-8">
                        <EmailChallengeForm />
                    </div>
                </div>
            </div>
        )
    }

    // No MFA configured — shouldn't reach here, redirect to enrollment
    redirect('/auth/mfa/enroll')
}
