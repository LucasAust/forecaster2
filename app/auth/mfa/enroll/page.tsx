import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Shield } from 'lucide-react'
import { MandatoryEnrollment } from './MandatoryEnrollment'

export default async function EnrollPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Check if already enrolled (TOTP)
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const hasVerifiedFactor = factors?.all?.some(f => f.status === 'verified')

    if (hasVerifiedFactor) {
        redirect('/')
    }

    // Check if already enrolled (email MFA)
    const { data: settings } = await supabase
        .from('user_settings')
        .select('mfa_method')
        .eq('user_id', user.id)
        .single()

    if (settings?.mfa_method === 'email') {
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
