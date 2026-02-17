'use client'

import { useState } from 'react'
import { enrollMFA, verifyEnrollment, enrollEmailMFA, verifyEmailMFACode } from '@/app/auth/actions'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, CheckCircle2, Smartphone, Mail } from 'lucide-react'

type MfaMethod = 'totp' | 'email' | null

export function MandatoryEnrollment() {
    const [method, setMethod] = useState<MfaMethod>(null)
    const [qrCode, setQrCode] = useState<string | null>(null)
    const [factorId, setFactorId] = useState<string | null>(null)
    const [maskedEmail, setMaskedEmail] = useState<string | null>(null)
    const [verificationCode, setVerificationCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    const startTOTP = async () => {
        setMethod('totp')
        setIsLoading(true)
        setError(null)
        try {
            const result = await enrollMFA()
            setFactorId(result.id)
            setQrCode(result.qrCode)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to start enrollment')
            setMethod(null)
        } finally {
            setIsLoading(false)
        }
    }

    const startEmail = async () => {
        setMethod('email')
        setIsLoading(true)
        setError(null)
        try {
            const result = await enrollEmailMFA()
            setMaskedEmail(result.email)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to start enrollment')
            setMethod(null)
        } finally {
            setIsLoading(false)
        }
    }

    const verifyCode = async () => {
        if (!verificationCode) return

        setIsLoading(true)
        setError(null)
        try {
            if (method === 'totp' && factorId) {
                await verifyEnrollment(factorId, verificationCode)
            } else if (method === 'email') {
                await verifyEmailMFACode(verificationCode)
            }
            router.push('/')
            router.refresh()
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Verification failed')
            setIsLoading(false)
        }
    }

    // Method selection screen
    if (!method) {
        return (
            <div className="space-y-6">
                <p className="text-sm text-zinc-400 text-center">
                    Choose how you want to verify your identity:
                </p>
                <div className="grid gap-3">
                    <button
                        type="button"
                        onClick={startTOTP}
                        className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left hover:border-zinc-600 transition-colors"
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400">
                            <Smartphone size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white">Authenticator App</p>
                            <p className="text-xs text-zinc-500">Use Google Authenticator, Authy, etc.</p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={startEmail}
                        className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left hover:border-zinc-600 transition-colors"
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/20 text-violet-400">
                            <Mail size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white">Email Code</p>
                            <p className="text-xs text-zinc-500">Receive a code to your email address</p>
                        </div>
                    </button>
                </div>

                {error && (
                    <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                    </div>
                )}
            </div>
        )
    }

    if (isLoading && !qrCode && !maskedEmail) {
        return (
            <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="mt-4 text-sm text-zinc-400">Initializing security setup...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* TOTP: QR Code */}
            {method === 'totp' && qrCode && (
                <div className="text-center space-y-2">
                    <div className="bg-white p-4 rounded-xl w-fit mx-auto mb-6">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
                    </div>
                    <h3 className="font-medium text-white">1. Scan QR Code</h3>
                    <p className="text-sm text-zinc-400">
                        Use your authenticator app (Google Authenticator, Authy, etc.) to scan this code.
                    </p>
                </div>
            )}

            {/* Email: Confirmation */}
            {method === 'email' && maskedEmail && (
                <div className="text-center space-y-2">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/20 text-violet-400 mx-auto mb-4">
                        <Mail size={32} />
                    </div>
                    <h3 className="font-medium text-white">Check Your Email</h3>
                    <p className="text-sm text-zinc-400">
                        We sent a 6-digit code to <span className="text-white">{maskedEmail}</span>
                    </p>
                </div>
            )}

            {/* Verification Input */}
            <div className="space-y-4">
                <h3 className="font-medium text-white text-center">
                    {method === 'totp' ? '2. Verify Code' : 'Enter Code'}
                </h3>
                <div className="space-y-2">
                    <label htmlFor="code" className="sr-only">Verification Code</label>
                    <input
                        id="code"
                        type="text"
                        placeholder="000000"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                        className="block w-full text-center tracking-[1em] text-2xl rounded-xl border-0 bg-zinc-900/50 py-4 px-4 text-white ring-1 ring-inset ring-zinc-800 placeholder:text-zinc-700 focus:ring-2 focus:ring-inset focus:ring-blue-600 font-mono"
                    />
                </div>

                {error && (
                    <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                    </div>
                )}

                <button
                    type="button"
                    onClick={verifyCode}
                    disabled={isLoading || verificationCode.length !== 6}
                    className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Verify & Continue'}
                </button>

                <button
                    type="button"
                    onClick={() => { setMethod(null); setError(null); setVerificationCode(''); setQrCode(null); setMaskedEmail(null); }}
                    className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                    ← Choose a different method
                </button>
            </div>
        </div>
    )
}
