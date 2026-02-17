import { login, signup } from './actions'
import { Wallet } from 'lucide-react'

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>
}) {
    const { error, message } = await searchParams;

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
            <div className="w-full max-w-md space-y-8">
                <div className="flex flex-col items-center justify-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20">
                        <Wallet className="h-7 w-7 text-white" />
                    </div>
                    <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">
                        Welcome to Arc
                    </h1>
                    <p className="mt-2 text-sm text-zinc-400">
                        Sign in to your account or create a new one
                    </p>
                </div>

                {error && (
                    <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-500 border border-red-500/20 text-center">
                        {decodeURIComponent(error)}
                    </div>
                )}

                {message && (
                    <div className="rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-400 border border-emerald-500/20 text-center">
                        {decodeURIComponent(message)}
                    </div>
                )}

                <form className="mt-8 space-y-6">
                    <div className="space-y-4 rounded-md shadow-sm">
                        <div>
                            <label htmlFor="email-address" className="sr-only">
                                Email address
                            </label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="relative block w-full rounded-xl border-0 bg-zinc-900/50 py-3 px-4 text-white ring-1 ring-inset ring-zinc-800 placeholder:text-zinc-500 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                                placeholder="Email address"
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">
                                Password
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="relative block w-full rounded-xl border-0 bg-zinc-900/50 py-3 px-4 text-white ring-1 ring-inset ring-zinc-800 placeholder:text-zinc-500 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                                placeholder="Password"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <button
                            formAction={login}
                            className="group relative flex w-full justify-center rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-all shadow-lg shadow-blue-500/20"
                        >
                            Sign in
                        </button>
                        <button
                            formAction={signup}
                            className="group relative flex w-full justify-center rounded-xl bg-zinc-800 px-3 py-3 text-sm font-semibold text-white hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-800 transition-all border border-zinc-700"
                        >
                            Sign up
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
