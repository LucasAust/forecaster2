'use client'

import { useState, useEffect } from 'react'
import { enrollMFA, verifyEnrollment } from '@/app/auth/actions'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

export function MandatoryEnrollment() {
    const [qrCode, setQrCode] = useState<string | null>(null)
    const [factorId, setFactorId] = useState<string | null>(null)
    const [verificationCode, setVerificationCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const router = useRouter()

    useEffect(() => {
        // Start enrollment immediately on mount
        const start = async () => {
            try {
                const result = await enrollMFA()
                setFactorId(result.id)
                setQrCode(result.qrCode)
            } catch (e: any) {
                setError(e.message)
            } finally {
                setIsLoading(false)
            }
        }
        start()
    }, [])

    const verifyCode = async () => {
        if (!factorId || !verificationCode) return

        setIsLoading(true)
        setError(null)
        try {
            await verifyEnrollment(factorId, verificationCode)
            // Successful verification will enable the factor.
            // Redirect to home explicitly.
            router.push('/')
            router.refresh()
        } catch (e: any) {
            setError(e.message)
            setIsLoading(false)
        }
    }

    if (isLoading && !qrCode) {
        return (
            <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="mt-4 text-sm text-zinc-400">Initializing security setup...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="text-center space-y-2">
                <div className="bg-white p-4 rounded-xl w-fit mx-auto mb-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {qrCode && <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />}
                </div>

                <h3 className="font-medium text-white">1. Scan QR Code</h3>
                <p className="text-sm text-zinc-400">
                    Use your authenticator app (Google Authenticator, Authy, etc.) to scan this code.
                </p>
            </div>

            <div className="space-y-4">
                <h3 className="font-medium text-white text-center">2. Verify Code</h3>
                <div className="space-y-2">
                    <label htmlFor="code" className="sr-only">Verification Code</label>
                    <input
                        id="code"
                        type="text"
                        placeholder="000000"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                        className="block w-full text-center tracking-[1em] text-lg rounded-xl border-0 bg-zinc-950/50 py-3 px-4 text-white ring-1 ring-inset ring-zinc-800 placeholder:text-zinc-700 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:leading-6 font-mono"
                    />
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 text-red-500 text-sm p-3 rounded-xl flex items-center justify-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                </div>
            )}

            <button
                onClick={verifyCode}
                disabled={isLoading || verificationCode.length !== 6}
                className="w-full rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-all shadow-lg shadow-blue-500/20"
            >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Activate & Continue'}
            </button>
        </div>
    )
}
