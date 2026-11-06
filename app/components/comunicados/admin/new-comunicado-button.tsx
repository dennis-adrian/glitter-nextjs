"use client";

import { Loader2Icon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { createComunicadoDraftAction } from "@/app/lib/comunicados/actions";

/**
 * "Nuevo comunicado" (G3): creates an empty draft and opens it. It stays
 * disabled from the click until the composer replaces the page, so a double
 * click cannot leave a second empty draft behind.
 */
export default function NewComunicadoButton({
  className,
}: {
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // The action resolves before the navigation commits; this covers the gap.
  const [opening, setOpening] = useState(false);
  const busy = isPending || opening;

  function create() {
    startTransition(async () => {
      try {
        const result = await createComunicadoDraftAction();
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        setOpening(true);
        router.push(`/dashboard/communications/${result.comunicadoId}`);
      } catch (error) {
        console.error("Error creating a comunicado draft", error);
        toast.error("No se pudo crear el borrador. Intentá de nuevo.");
      }
    });
  }

  return (
    <Button
      type="button"
      onClick={create}
      disabled={busy}
      aria-busy={busy || undefined}
      className={className}
    >
      {busy ? (
        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <PlusIcon className="mr-2 h-4 w-4" aria-hidden />
      )}
      Nuevo comunicado
    </Button>
  );
}
