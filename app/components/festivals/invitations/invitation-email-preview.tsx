"use client";

import { ChevronDownIcon, ChevronUpIcon, MailIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import type { InvitationKind } from "@/app/lib/festivals/invitation-definitions";
import { previewInvitationEmail } from "@/app/lib/festivals/invitations";

type InvitationEmailPreviewProps = {
  festivalId: number;
  kind: InvitationKind;
  disabled?: boolean;
};

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; from: string; subject: string; html: string }
  | { status: "error"; message: string };

/**
 * Links in the preview open in a new tab instead of replacing the frame, and
 * the frame runs no scripts: the email is the only thing in it.
 */
function previewDocument(html: string) {
  const base = '<base target="_blank">';
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (head) => `${head}${base}`)
    : `${base}${html}`;
}

/**
 * The invitation exactly as a recipient would get it, rendered on demand so
 * the admin can check the content before mailing hundreds of people.
 */
export default function InvitationEmailPreview({
  festivalId,
  kind,
  disabled = false,
}: InvitationEmailPreviewProps) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });

  async function load() {
    setPreview({ status: "loading" });
    try {
      const result = await previewInvitationEmail(festivalId, kind);
      setPreview(
        result.success
          ? {
              status: "ready",
              from: result.from,
              subject: result.subject,
              html: result.html,
            }
          : { status: "error", message: result.message },
      );
    } catch {
      setPreview({
        status: "error",
        message: "No se pudo generar la vista previa del correo.",
      });
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    // Rendered once per dialog: the festival does not change while it is open.
    if (next && preview.status !== "ready" && preview.status !== "loading") {
      void load();
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={disabled}
        aria-expanded={open}
        onClick={toggle}
      >
        <MailIcon className="mr-2 h-4 w-4" aria-hidden />
        {open ? "Ocultar el correo" : "Ver el correo antes de enviar"}
        {open ? (
          <ChevronUpIcon className="ml-auto h-4 w-4" aria-hidden />
        ) : (
          <ChevronDownIcon className="ml-auto h-4 w-4" aria-hidden />
        )}
      </Button>

      {open ? (
        preview.status === "ready" ? (
          <div className="overflow-hidden rounded-lg border">
            <dl className="space-y-1 border-b bg-muted/40 p-3 text-sm">
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted-foreground">De</dt>
                <dd className="min-w-0 break-words">{preview.from}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted-foreground">Asunto</dt>
                <dd className="min-w-0 break-words font-medium">
                  {preview.subject}
                </dd>
              </div>
            </dl>
            <iframe
              title={`Vista previa: ${preview.subject}`}
              srcDoc={previewDocument(preview.html)}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              className="block h-[45vh] w-full bg-white md:h-[520px]"
            />
            <p className="border-t p-2 text-xs text-muted-foreground">
              Así lo vería una persona con tu nombre. El enlace para darse de
              baja no funciona en la vista previa.
            </p>
          </div>
        ) : preview.status === "error" ? (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <p className="text-destructive">{preview.message}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void load()}
            >
              Reintentar
            </Button>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border p-3" aria-busy="true">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-48 w-full" />
          </div>
        )
      ) : null}
    </div>
  );
}
