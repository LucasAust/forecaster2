import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <p className="text-7xl font-bold bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">
          404
        </p>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Page not found
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-xl bg-zinc-800 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-zinc-700 border border-zinc-700"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
