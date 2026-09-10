"use client";

import { AlertCircleIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";

/**
 * This page reads the festival's confirmed participants to build the stands a
 * visitor can vote for. That read used to return an empty list when it failed,
 * so a broken query showed an activity with nothing to vote for and looked like
 * the activity itself was empty. It rethrows now, and lands here.
 */
export default function FestivalActivityError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="mx-auto max-w-xl space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-5 text-center">
        <AlertCircleIcon className="mx-auto size-8 text-destructive" />
        <h1 className="font-semibold">No se pudo cargar la actividad</h1>
        <p className="text-sm text-muted-foreground">
          Ocurrió un error al consultar los datos. Intentá nuevamente. Si el
          problema continúa, escribinos y lo resolvemos.
        </p>
        <Button type="button" variant="outline" onClick={reset}>
          Intentar nuevamente
        </Button>
      </div>
    </div>
  );
}
