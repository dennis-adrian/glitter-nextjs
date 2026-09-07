"use client";

import {
  CheckIcon,
  CopyIcon,
  LinkIcon,
  LoaderIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import type { ShareLinkSummary } from "@/app/lib/posts/definitions";
import {
  createShareLink,
  regenerateShareLink,
  revokeShareLink,
  updateShareLinkExpiry,
} from "@/app/lib/posts/share-actions";

type Props = {
  postId: number;
  initialLink: ShareLinkSummary | null;
};

/**
 * Generate, copy, re-share and revoke the post's unlisted link.
 *
 * The URL is shown every time the sheet is opened, not once at creation: the
 * token is stored as issued precisely so the author can come back a month
 * later and send the same link to one more person, without breaking it for
 * everyone who already has it.
 */
export default function ShareLinkPanel({ postId, initialLink }: Props) {
  const [link, setLink] = useState<ShareLinkSummary | null>(initialLink);
  const [expiresAt, setExpiresAt] = useState(toInputValue(initialLink));
  const [busy, setBusy] = useState<null | "create" | "expiry" | "cycle">(null);
  const [copied, setCopied] = useState(false);

  const run = async <T,>(
    kind: "create" | "expiry" | "cycle",
    action: () => Promise<T>,
  ): Promise<T> => {
    setBusy(kind);
    try {
      return await action();
    } finally {
      setBusy(null);
    }
  };

  const generate = () =>
    run("create", async () => {
      const result = await createShareLink(postId, expiresAt || null);
      if (!result.success) return toast.error(result.message);
      setLink(result.link);
      setExpiresAt(toInputValue(result.link));
      toast.success("Enlace generado");
    });

  const saveExpiry = () =>
    run("expiry", async () => {
      const result = await updateShareLinkExpiry(postId, expiresAt || null);
      if (!result.success) return toast.error(result.message);
      setLink(result.link);
      toast.success(
        result.link.expiresAt
          ? "Vencimiento actualizado"
          : "El enlace ya no vence",
      );
    });

  const regenerate = () =>
    run("cycle", async () => {
      const result = await regenerateShareLink(postId);
      if (!result.success) return toast.error(result.message);
      setLink(result.link);
      setCopied(false);
      toast.success("Enlace regenerado. El anterior dejó de funcionar.");
    });

  const revoke = () =>
    run("cycle", async () => {
      const result = await revokeShareLink(postId);
      if (!result.success) return toast.error(result.message);
      setLink(null);
      setExpiresAt("");
      setCopied(false);
      toast.success("Enlace revocado");
    });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el texto y copialo a mano.");
    }
  };

  const expiryChanged = expiresAt !== toInputValue(link);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label className="text-base">Compartir en privado</Label>
        <p className="text-xs text-muted-foreground">
          Un enlace para mostrar el artículo a quien vos quieras, sin publicarlo
          ni listarlo en el blog. Cualquiera que tenga el enlace puede leerlo.
        </p>
      </div>

      {link ? (
        <>
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={link.url}
                className="text-xs"
                aria-label="Enlace para compartir"
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
            <p
              className={`flex items-center gap-1.5 text-xs ${
                link.isExpired ? "text-amber-600" : "text-muted-foreground"
              }`}
            >
              <LinkIcon className="h-3 w-3 shrink-0" />
              {link.isExpired
                ? "Este enlace venció. Cambiá el vencimiento para reactivarlo."
                : "Activo. Podés volver acá y reenviarlo cuando quieras."}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="share-expires" className="text-xs">
              Vencimiento (opcional)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="share-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              {expiryChanged && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={saveExpiry}
                >
                  {busy === "expiry" && (
                    <LoaderIcon className="mr-2 h-3 w-3 animate-spin" />
                  )}
                  Guardar
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Dejalo en blanco para que el enlace no venza.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={regenerate}
            >
              {busy === "cycle" ? (
                <LoaderIcon className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCwIcon className="mr-2 h-3 w-3" />
              )}
              Regenerar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={revoke}
            >
              Revocar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Regenerar da una dirección nueva y desactiva la anterior — usalo si
            el enlace llegó a quien no debía.
          </p>
        </>
      ) : (
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
            disabled={busy !== null}
            onClick={generate}
            className="justify-self-start"
          >
            {busy === "create" && (
              <LoaderIcon className="mr-2 h-3 w-3 animate-spin" />
            )}
            Generar enlace
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * `datetime-local` wants local wall-clock time with no zone, so the stored
 * instant has to be shifted out of UTC before slicing. Formatting it any other
 * way shows the author a time that is not the one the link expires at.
 */
function toInputValue(link: ShareLinkSummary | null): string {
  if (!link?.expiresAt) return "";
  const date = new Date(link.expiresAt);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
