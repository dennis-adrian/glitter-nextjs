"use client";

import { AlertCircleIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";

export default function InfractionsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="mx-auto max-w-xl space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-5 text-center">
        <AlertCircleIcon className="mx-auto size-8 text-destructive" />
        <h1 className="font-semibold">
          No se pudo cargar la información de infracciones
        </h1>
        <p className="text-sm text-muted-foreground">
          Ocurrió un error al consultar los datos. Intentá nuevamente. Si el
          problema continúa, revisá la conexión con la base de datos.
        </p>
        <Button type="button" variant="outline" onClick={reset}>
          Intentar nuevamente
        </Button>
      </div>
    </div>
  );
}
