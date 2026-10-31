"use client";

import { CopyIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { duplicateComunicadoAction } from "@/app/lib/comunicados/duplicate-actions";

/**
 * "Duplicar" on any comunicado that is not a draft
 * (docs/IMPLEMENTATION-comunicados.md G6): a new draft with its text, button,
 * email and audience, opened in the composer with "Copia de «…»" (`?copia`
 * names the source). It stays disabled from the click until the composer
 * replaces the page, so a double click cannot leave a second copy behind.
 */
export default function DuplicateComunicadoButton({
  comunicadoId,
  variant = "outline",
  size = "default",
  className,
}: {
  comunicadoId: number;
  variant?: "outline" | "secondary" | "ghost";
  size?: "sm" | "default";
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // The action resolves before the navigation commits; this covers the gap.
  const [opening, setOpening] = useState(false);
  const busy = isPending || opening;

  function duplicate() {
    startTransition(async () => {
      try {
        const result = await duplicateComunicadoAction(comunicadoId);
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        setOpening(true);
        router.push(
          `/dashboard/communications/${result.comunicadoId}?copia=${comunicadoId}`,
        );
      } catch (error) {
        console.error("Error duplicating a comunicado", error);
        toast.error("No pudimos duplicarlo. Probá de nuevo.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={duplicate}
      disabled={busy}
      aria-busy={busy || undefined}
      className={className}
    >
      {busy ? (
        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <CopyIcon className="mr-2 h-4 w-4" aria-hidden />
      )}
      {busy ? "Duplicando…" : "Duplicar"}
    </Button>
  );
}
