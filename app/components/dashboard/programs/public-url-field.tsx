"use client";

import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") || "";

type Props = {
  /** Absolute path, e.g. `/programs/glitter-week`. */
  path: string;
  /** Draft content is reachable by admins but 404s for everyone else. */
  isDraft: boolean;
};

/**
 * The public URL for a program or session, shown to admins.
 *
 * Shown for drafts as well, because the slug is generated from the title and an
 * admin otherwise has no way to know the address before publishing. The link is
 * not openable while in draft — the public queries filter on `published`, so
 * the page 404s for everyone, admins included. There is no preview bypass.
 */
export default function PublicUrlField({ path, isDraft }: Props) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState(PUBLIC_BASE_URL);

  useEffect(() => {
    if (PUBLIC_BASE_URL) return;

    const timeoutId = window.setTimeout(
      () => setOrigin(window.location.origin),
      0,
    );
    return () => window.clearTimeout(timeoutId);
  }, []);

  const fullUrl = `${origin}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success("Enlace copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar. Selecciona el enlace manualmente.");
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        {isDraft ? "Enlace público (se activa al publicar)" : "Enlace público"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
          {fullUrl}
        </code>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? (
            <CheckIcon className="mr-1 h-4 w-4" />
          ) : (
            <CopyIcon className="mr-1 h-4 w-4" />
          )}
          {copied ? "Copiado" : "Copiar"}
        </Button>
        {/* No "open" while in draft: the page 404s for everyone until it is
            published, so offering the link would just look broken. */}
        {isDraft ? null : (
          <Button asChild variant="ghost" size="sm">
            <Link href={path} target="_blank" rel="noreferrer">
              <ExternalLinkIcon className="mr-1 h-4 w-4" />
              Abrir
            </Link>
          </Button>
        )}
      </div>
      {isDraft ? (
        <p className="text-xs text-muted-foreground">
          Todavía no está disponible: en borrador, esta dirección devuelve 404
          incluso para el equipo.
        </p>
      ) : null}
    </div>
  );
}
