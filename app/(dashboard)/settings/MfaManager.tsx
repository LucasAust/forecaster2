'use client'

import { useState } from 'react'
import { enrollMFA, verifyEnrollment, unenrollMFA } from '@/app/auth/actions'
import { Shield, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'

interface MfaManagerProps {
    factors: any[]
}

export function MfaManager({ factors }: MfaManagerProps) {
    const [isEnrolling, setIsEnrolling] = useState(false)
    const [qrCode, setQrCode] = useState<string | null>(null)
    const [factorId, setFactorId] = useState<string | null>(null)
    const [verificationCode, setVerificationCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const verifiedFactor = factors?.find(f => f.status === 'verified')

    const startEnrollment = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const result = await enrollMFA()
            setFactorId(result.id)
            setQrCode(result.qrCode)
            setIsEnrolling(true)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setIsLoading(false)
        }
    }

    const verifyCode = async () => {
        if (!factorId || !verificationCode) return

        setIsLoading(true)
        setError(null)
        try {
            await verifyEnrollment(factorId, verificationCode)
            setSuccess('MFA enabled successfully!')
            setIsEnrolling(false)
            setQrCode(null)
            setFactorId(null)
            setVerificationCode('')
            // Refresh page to show updated status
            window.location.reload()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setIsLoading(false)
        }
    }

    const removeMFA = async () => {
        if (!verifiedFactor) return

        if (!confirm('Are you sure you want to disable MFA? This will lower your account security.')) {
            return
        }

        setIsLoading(true)
        setError(null)
        try {
            await unenrollMFA(verifiedFactor.id)
            setSuccess('MFA disabled successfully.')
            window.location.reload()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setIsLoading(false)
        }
    }

    if (verifiedFactor) {
        return (
            <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                        <h4 className="font-semibold text-green-500 text-sm">MFA is active</h4>
                        <p className="text-xs text-green-500/80">Your account is secured with an authenticator app.</p>
                    </div>
                </div>

                <button
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

    return (
        <div className="space-y-4">
            {!isEnrolling ? (
                <button
                    onClick={startEnrollment}
                    disabled={isLoading}
                    className="group relative flex w-full justify-center rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-all shadow-lg shadow-blue-500/20"
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Enable MFA
                </button>
            ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                    <div className="rounded-xl bg-white p-4 w-fit mx-auto">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {qrCode && <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />}
                    </div>

                    <div className="text-center space-y-2">
                        <p className="text-sm text-zinc-300">
                            1. Scan the QR code with your authenticator app (e.g., Google Authenticator, Authy).
                        </p>
                        <p className="text-sm text-zinc-300">
                            2. Enter the 6-digit code below to verify.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="code" className="sr-only">Verification Code</label>
                        <input
                            id="code"
                            type="text"
                            placeholder="000000"
                            maxLength={6}
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                            className="block w-full text-center tracking-[1em] text-lg rounded-xl border-0 bg-zinc-900/50 py-3 px-4 text-white ring-1 ring-inset ring-zinc-800 placeholder:text-zinc-700 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:leading-6 font-mono"
                        />
                    </div>

                    <button
                        onClick={verifyCode}
                        disabled={isLoading || verificationCode.length !== 6}
                        className="w-full rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-all shadow-lg shadow-blue-500/20"
                    >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Verify & Enable'}
                    </button>

                    <button
                        onClick={() => {
                            setIsEnrolling(false)
                            setQrCode(null)
                            setVerificationCode('')
                            setError(null)
                        }}
                        className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {error && (
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
