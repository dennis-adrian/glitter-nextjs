"use client";

import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { processPendingComunicadosAction } from "@/app/lib/comunicados/process-actions";

type ProcessPendingButtonProps = {
  className?: string;
  size?: "sm" | "default";
};

/**
 * "Procesar envíos pendientes", previews only
 * (docs/IMPLEMENTATION-comunicados.md D9): Vercel runs crons in production
 * only. One run at a time from here: it stays disabled until the server
 * answers, and the server takes one click per 30 s across every admin.
 */
export default function ProcessPendingButton({
  className,
  size = "default",
}: ProcessPendingButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function processPending() {
    startTransition(async () => {
      try {
        const result = await processPendingComunicadosAction();
        if (result.success) toast.success(result.message);
        else toast.error(result.message);
        router.refresh();
      } catch (error) {
        console.error("Error processing pending comunicados", error);
        toast.error(
          "No pudimos procesar los envíos. Intentá de nuevo en unos minutos.",
        );
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={processPending}
      disabled={isPending}
      aria-busy={isPending || undefined}
      className={className}
    >
      {isPending ? (
        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <RefreshCwIcon className="mr-2 h-4 w-4" aria-hidden />
      )}
      {isPending ? "Procesando…" : "Procesar envíos pendientes"}
    </Button>
  );
}
