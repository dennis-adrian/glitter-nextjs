"use client";

import { RefreshCwIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";

/**
 * What an error boundary shows when an action failed because the tab is stale.
 * Its usual "Intentar nuevamente" re-renders the same old build, so it would
 * fail the same way; only a reload fetches the new one.
 */
export default function StaleDeploymentNotice() {
  return (
    <div className="container mx-auto flex min-h-[50vh] items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-xl space-y-3 rounded-md border p-5 text-center">
        <h1 className="text-lg font-semibold">
          Hay una nueva versión de la app
        </h1>
        <p className="text-sm text-muted-foreground">
          Recargá la página para continuar.
        </p>
        <Button type="button" onClick={() => window.location.reload()}>
          <RefreshCwIcon className="size-4" />
          Recargar página
        </Button>
      </div>
    </div>
  );
}
