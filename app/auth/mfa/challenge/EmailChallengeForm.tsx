'use client'

import { useState, useEffect, useRef } from 'react'
import { sendEmailMFAChallenge, verifyEmailMFACode } from '@/app/auth/actions'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, Mail, RefreshCw } from 'lucide-react'

export function EmailChallengeForm() {
    const [code, setCode] = useState('')
    const [maskedEmail, setMaskedEmail] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSending, setIsSending] = useState(true)
    const [cooldown, setCooldown] = useState(0)
    const router = useRouter()
    const sentRef = useRef(false)

    // Send code on mount (guarded against React strict mode double-invoke)
    useEffect(() => {
        if (sentRef.current) return
        sentRef.current = true
        const send = async () => {
            try {
                const result = await sendEmailMFAChallenge()
                setMaskedEmail(result.email)
                setCooldown(60)
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Failed to send code')
            } finally {
                setIsSending(false)
            }
        }
        send()
    }, [])

    // Cooldown timer
    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setInterval(() => setCooldown(c => c - 1), 1000)
        return () => clearInterval(timer)
    }, [cooldown])

    const resendCode = async () => {
        setIsSending(true)
        setError(null)
        try {
            const result = await sendEmailMFAChallenge()
            setMaskedEmail(result.email)
            setCooldown(60)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to resend code')
        } finally {
            setIsSending(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            await verifyEmailMFACode(code)
            router.push('/')
            router.refresh()
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Verification failed')
            setIsLoading(false)
        }
    }

    if (isSending && !maskedEmail) {
        return (
            <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="mt-4 text-sm text-zinc-400">Sending verification code...</p>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {maskedEmail && (
                <div className="flex items-center gap-3 rounded-xl bg-zinc-900/50 border border-zinc-800 p-4">
                    <Mail className="h-5 w-5 text-violet-400 shrink-0" />
                    <p className="text-sm text-zinc-400">
                        Code sent to <span className="text-white font-medium">{maskedEmail}</span>
                    </p>
                </div>
            )}

            <div className="space-y-4 rounded-md shadow-sm">
                <div>
                    <label htmlFor="email-code" className="sr-only">Verification Code</label>
                    <input
                        id="email-code"
                        name="code"
                        type="text"
                        required
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                        className="block w-full text-center tracking-[1em] text-2xl rounded-xl border-0 bg-zinc-900/50 py-4 px-4 text-white ring-1 ring-inset ring-zinc-800 placeholder:text-zinc-700 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 font-mono"
                        placeholder="000000"
                    />
                </div>
            </div>

            {error && (
                <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-500 border border-red-500/20 text-center flex items-center justify-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="group relative flex w-full justify-center rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
            >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify Access"}
            </button>

            <button
                type="button"
                onClick={resendCode}
                disabled={cooldown > 0 || isSending}
                className="w-full flex items-center justify-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
            >
                <RefreshCw size={14} className={isSending ? 'animate-spin' : ''} />
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
        </form>
    )
}
