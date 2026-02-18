'use client'

import { useState } from 'react'
import { verifyTOTPChallenge } from '@/app/auth/actions'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'

export function ChallengeForm({ factorId }: { factorId: string }) {
    const [code, setCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            await verifyTOTPChallenge(factorId, code)
            router.push('/')
            router.refresh()
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Verification failed')
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4 rounded-md shadow-sm">
                <div>
                    <label htmlFor="code" className="sr-only">Authentication Code</label>
                    <input
                        id="code"
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
        </form>
    )
}
