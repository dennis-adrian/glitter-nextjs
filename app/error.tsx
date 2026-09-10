"use client";

import { useEffect } from "react";

import { Button } from "@/app/components/ui/button";

/**
 * The last boundary before a blank page.
 *
 * The data readers used to catch their own failures and return an empty list,
 * so a broken query looked like a page with nothing on it and never reached a
 * boundary at all. They rethrow now, which means any segment without a closer
 * `error.tsx` needs somewhere to land — this is it.
 */
export default function RootError({
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
    <main className="container mx-auto flex min-h-[50vh] items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-xl space-y-3 rounded-md border p-5 text-center">
        <h1 className="text-lg font-semibold">¡Algo salió mal!</h1>
        <p className="text-sm text-muted-foreground">
          No pudimos cargar esta página. Intentá nuevamente. Si el problema
          continúa, escribinos y lo resolvemos.
        </p>
        <Button type="button" variant="outline" onClick={() => reset()}>
          Intentar nuevamente
        </Button>
      </div>
    </main>
  );
}
