"use client";

import { CheckIcon, CopyIcon, LinkIcon, LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { formatFullDate } from "@/app/lib/formatters";
import type { ShareLinkSummary } from "@/app/lib/posts/definitions";
import {
  createShareLink,
  revokeShareLink,
} from "@/app/lib/posts/share-actions";

type Props = {
  postId: number;
  initialLink: ShareLinkSummary | null;
};

/**
 * Generate, copy and revoke the post's unlisted share link.
 *
 * The raw URL is only ever in this component's state, and only right after the
 * action that minted it: the server keeps a digest, so there is nothing to
 * show on a later visit. That is why the copy field appears once, with a
 * warning, and why "generar uno nuevo" says plainly that the old link dies.
 */
export default function ShareLinkPanel({ postId, initialLink }: Props) {
  const [link, setLink] = useState<ShareLinkSummary | null>(initialLink);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    const result = await createShareLink(postId, expiresAt || null);
    setBusy(false);

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    setFreshUrl(result.url);
    setLink({
      id: -1,
      createdAt: new Date(),
      expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
      isExpired: false,
    });
    setCopied(false);
    toast.success("Enlace generado");
  };

  const revoke = async () => {
    setBusy(true);
    const result = await revokeShareLink(postId);
    setBusy(false);

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    setLink(null);
    setFreshUrl(null);
    setExpiresAt("");
    toast.success("Enlace revocado");
  };

  const copy = async () => {
    if (!freshUrl) return;
    try {
      await navigator.clipboard.writeText(freshUrl);
      setCopied(true);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el texto y copialo a mano.");
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label className="text-base">Compartir en privado</Label>
        <p className="text-xs text-muted-foreground">
          Un enlace para mostrar el artículo a quien vos quieras, sin
          publicarlo ni listarlo en el blog. Cualquiera que tenga el enlace
          puede leerlo.
        </p>
      </div>

      {freshUrl && (
        <div className="grid gap-2 rounded-md border border-sky-300 bg-sky-50 p-3">
          <Label htmlFor="share-url" className="text-xs text-sky-900">
            Copialo ahora — por seguridad no vamos a poder volver a mostrarlo.
          </Label>
          <div className="flex gap-2">
            <Input
              id="share-url"
              readOnly
              value={freshUrl}
              className="bg-white text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copy}
              aria-label="Copiar enlace"
            >
              {copied ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {link && (
        <div className="grid gap-2 rounded-md border p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <LinkIcon className="h-4 w-4" />
            {link.isExpired ? "Enlace vencido" : "Enlace activo"}
          </p>
          <p className="text-xs text-muted-foreground">
            {link.expiresAt
              ? `${link.isExpired ? "Venció" : "Vence"} el ${formatFullDate(link.expiresAt)}.`
              : "No vence. Podés revocarlo cuando quieras."}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={revoke}
            className="justify-self-start"
          >
            Revocar
          </Button>
        </div>
      )}

      {/*
        The expiry field stays available while a link is active, so that
        "generar uno nuevo" can also be "generar uno que venza el viernes".
        Hiding it once a link existed quietly forced every replacement to be a
        link that never expires.
      */}
      <div className="grid gap-2">
        <Label htmlFor="share-expires" className="text-xs">
          Vencimiento (opcional)
        </Label>
        <Input
          id="share-expires"
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Dejalo en blanco para que el enlace no venza.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={generate}
          className="justify-self-start"
        >
          {busy && <LoaderIcon className="mr-2 h-3 w-3 animate-spin" />}
          {link ? "Generar uno nuevo" : "Generar enlace"}
        </Button>
        {link && (
          <p className="text-xs text-muted-foreground">
            Generar uno nuevo desactiva el anterior.
          </p>
        )}
      </div>
    </div>
  );
}
