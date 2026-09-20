"use client";

import { useEffect } from "react";
import Link from "next/link";

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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground">
        The page could not be loaded. Please try again.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <div className="flex gap-4">
        <button onClick={reset} className="text-primary hover:underline">
          Try again
        </button>
        <Link href="/imports" className="text-primary hover:underline">
          Go to imports
        </Link>
      </div>
    </div>
  );
}
