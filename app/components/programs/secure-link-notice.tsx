"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";

type Props = {
  url: string;
};

/**
 * The buyer's recovery link, shown on the page itself.
 *
 * This is the fallback for email never arriving — spam folders, typos, a
 * provider rejecting us. Without it, an undelivered email would mean a lost
 * ticket, so the link is presented for saving rather than buried.
 */
export default function SecureLinkNotice({ url }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Enlace copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar. Selecciona el enlace manualmente.");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/40 p-4">
      <p className="text-sm font-medium">Guarda este enlace</p>
      <p className="text-sm text-muted-foreground">
        Es la única forma de recuperar tu entrada si pierdes el correo. No lo
        compartas: quien lo tenga puede ver tu inscripción.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">
          {url}
        </code>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? (
            <CheckIcon className="mr-1 h-4 w-4" />
          ) : (
            <CopyIcon className="mr-1 h-4 w-4" />
          )}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}
