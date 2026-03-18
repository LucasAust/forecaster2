"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
          <AlertTriangle className="h-7 w-7 text-red-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Something went wrong
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            {error.message || "An unexpected error occurred."}
          </p>
        </div>
        <button
          onClick={() => reset()}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
