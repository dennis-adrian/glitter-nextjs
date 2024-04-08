"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Optionally log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <main className="flex h-full flex-col items-center justify-center">
      <h2 className="text-center my-4">¡Algo salió mal!</h2>
      <Button
        onClick={
          // Attempt to recover by trying to re-render the route
          () => reset()
        }
      >
        Intenta de nuevo
      </Button>
    </main>
  );
}
