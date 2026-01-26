import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Shield } from 'lucide-react'
import { ChallengeForm } from './ChallengeForm'

export default async function ChallengePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totpFactor = factors?.all?.find(f => f.factor_type === 'totp' && f.status === 'verified')

    if (!totpFactor) {
        // No verified factor found, redirect to dashboard (or settings?)
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
