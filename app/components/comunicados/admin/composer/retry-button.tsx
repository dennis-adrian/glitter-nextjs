"use client";

import { RotateCwIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";

/** "Reintentar", next to a count or a preview that could not be read. */
export default function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={onRetry}
    >
      <RotateCwIcon className="mr-1 h-3.5 w-3.5" aria-hidden />
      Reintentar
    </Button>
  );
}
