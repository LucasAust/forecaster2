'use client'

import { useState } from 'react'
import { enrollMFA, verifyEnrollment, unenrollMFA, enrollEmailMFA, verifyEmailMFACode, unenrollEmailMFA } from '@/app/auth/actions'
import { Shield, Loader2, CheckCircle2, AlertCircle, Trash2, Smartphone, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'

import type { MfaFactor } from '@/types';

interface MfaManagerProps {
    factors: MfaFactor[]
    mfaMethod: string | null
}

export function MfaManager({ factors, mfaMethod }: MfaManagerProps) {
    const router = useRouter()
    const [enrollMethod, setEnrollMethod] = useState<'totp' | 'email' | null>(null)
    const [qrCode, setQrCode] = useState<string | null>(null)
    const [factorId, setFactorId] = useState<string | null>(null)
    const [maskedEmail, setMaskedEmail] = useState<string | null>(null)
    const [verificationCode, setVerificationCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const verifiedFactor = factors?.find(f => f.status === 'verified')
    const isActive = !!(verifiedFactor || mfaMethod === 'email')
    const activeMethod = verifiedFactor ? 'totp' : mfaMethod === 'email' ? 'email' : null

    const startTOTP = async () => {
        setEnrollMethod('totp')
        setIsLoading(true)
        setError(null)
        try {
            const result = await enrollMFA()
            setFactorId(result.id)
            setQrCode(result.qrCode)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to start enrollment')
            setEnrollMethod(null)
        } finally {
            setIsLoading(false)
        }
    }

    const startEmail = async () => {
        setEnrollMethod('email')
        setIsLoading(true)
        setError(null)
        try {
            const result = await enrollEmailMFA()
            setMaskedEmail(result.email)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to start enrollment')
            setEnrollMethod(null)
        } finally {
            setIsLoading(false)
        }
    }

    const verifyCode = async () => {
        if (!verificationCode) return

        setIsLoading(true)
        setError(null)
        try {
            if (enrollMethod === 'totp' && factorId) {
                await verifyEnrollment(factorId, verificationCode)
            } else if (enrollMethod === 'email') {
                await verifyEmailMFACode(verificationCode)
            }
            setSuccess('MFA enabled successfully!')
            setEnrollMethod(null)
            setQrCode(null)
            setMaskedEmail(null)
            setFactorId(null)
            setVerificationCode('')
            router.refresh()
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to verify code')
        } finally {
            setIsLoading(false)
        }
    }

    const removeMFA = async () => {
        if (!confirm('Are you sure you want to disable MFA? This will lower your account security.')) {
            return
        }

        setIsLoading(true)
        setError(null)
        try {
            if (activeMethod === 'totp' && verifiedFactor) {
                await unenrollMFA(verifiedFactor.id)
            } else if (activeMethod === 'email') {
                await unenrollEmailMFA()
            }
            setSuccess('MFA disabled successfully.')
            router.refresh()
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to disable MFA')
        } finally {
            setIsLoading(false)
        }
    }

    // Active MFA state
    if (isActive) {
        return (
            <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                        <h4 className="font-semibold text-green-500 text-sm">MFA is active</h4>
                        <p className="text-xs text-green-500/80">
                            {activeMethod === 'totp'
                                ? 'Your account is secured with an authenticator app.'
                                : 'Your account is secured with email verification codes.'
                            }
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-zinc-900/50 border border-zinc-800 p-3">
                    {activeMethod === 'totp' ? (
                        <Smartphone className="h-4 w-4 text-blue-400" />
                    ) : (
                        <Mail className="h-4 w-4 text-violet-400" />
                    )}
                    <span className="text-sm text-zinc-400">
                        Method: <span className="text-white">{activeMethod === 'totp' ? 'Authenticator App' : 'Email Code'}</span>
                    </span>
                </div>

                <button
                    type="button"
                    onClick={removeMFA}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 w-full rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm font-semibold text-red-500 hover:bg-red-500/20 transition-all"
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Disable MFA
                </button>
                {error && (
                    <div className="bg-red-500/10 text-red-500 text-sm p-3 rounded-xl flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}
            </div>
        )
    }

    // Enrollment flow
    return (
        <div className="space-y-4">
            {!enrollMethod ? (
                <div className="space-y-3">
                    <p className="text-sm text-zinc-400">Choose an MFA method:</p>
                    <button
                        type="button"
                        onClick={startTOTP}
                        disabled={isLoading}
                        className="flex items-center gap-4 w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left hover:border-zinc-600 transition-colors disabled:opacity-50"
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 shrink-0">
                            <Smartphone size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white">Authenticator App</p>
                            <p className="text-xs text-zinc-500">Google Authenticator, Authy, etc.</p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={startEmail}
                        disabled={isLoading}
                        className="flex items-center gap-4 w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left hover:border-zinc-600 transition-colors disabled:opacity-50"
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/20 text-violet-400 shrink-0">
                            <Mail size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white">Email Code</p>
                            <p className="text-xs text-zinc-500">Receive a code to your email address</p>
                        </div>
                    </button>
                </div>
            ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                    {/* TOTP: QR Code */}
                    {enrollMethod === 'totp' && qrCode && (
                        <>
                            <div className="rounded-xl bg-white p-4 w-fit mx-auto">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-sm text-zinc-300">Scan with your authenticator app, then enter the code below.</p>
                            </div>
                        </>
                    )}

                    {/* Email: Confirmation */}
                    {enrollMethod === 'email' && maskedEmail && (
                        <div className="flex items-center gap-3 rounded-xl bg-violet-600/10 border border-violet-600/20 p-4">
                            <Mail className="h-5 w-5 text-violet-400 shrink-0" />
                            <p className="text-sm text-zinc-300">
                                Code sent to <span className="text-white font-medium">{maskedEmail}</span>
                            </p>
                        </div>
                    )}

                    {/* Code input */}
                    <div className="space-y-2">
                        <label htmlFor="mfa-settings-code" className="sr-only">Verification Code</label>
                        <input
                            id="mfa-settings-code"
                            type="text"
                            placeholder="000000"
                            maxLength={6}
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                            className="block w-full text-center tracking-[1em] text-lg rounded-xl border-0 bg-zinc-900/50 py-3 px-4 text-white ring-1 ring-inset ring-zinc-800 placeholder:text-zinc-700 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:leading-6 font-mono"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={verifyCode}
                        disabled={isLoading || verificationCode.length !== 6}
                        className="w-full rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-all shadow-lg shadow-blue-500/20"
                    >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Verify & Enable'}
                    </button>

                    <button
                        type="button"
                        onClick={() => { setEnrollMethod(null); setQrCode(null); setMaskedEmail(null); setVerificationCode(''); setError(null); }}
                        className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {error && !enrollMethod && (
                <div className="bg-red-500/10 text-red-500 text-sm p-3 rounded-xl flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                </div>
            )}
            {enrollMethod && error && (
                <div className="bg-red-500/10 text-red-500 text-sm p-3 rounded-xl flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                </div>
            )}
            {success && (
                <div className="bg-green-500/10 text-green-500 text-sm p-3 rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    {success}
                </div>
            )}
        </div>
    )
}
