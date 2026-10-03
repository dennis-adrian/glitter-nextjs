"use client";

import { CircleAlertIcon, Loader2Icon } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

import InvitationProgress from "@/app/components/festivals/invitations/invitation-progress";
import { useInvitationSender } from "@/app/components/festivals/invitations/use-invitation-sender";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { Label } from "@/app/components/ui/label";
import { Skeleton } from "@/app/components/ui/skeleton";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import type {
  InvitationAudience,
  InvitationKind,
} from "@/app/lib/festivals/invitation-definitions";
import { fetchInvitationAudience } from "@/app/lib/festivals/invitations";
import { cn } from "@/app/lib/utils";

export type FestivalSettingInvitation = {
  festivalId: number;
  kind: InvitationKind;
  /** The checkbox label, given who would receive it. */
  optionLabel: (audience: InvitationAudience) => string;
  /** Extra lines under the checkbox: who is left out, and why. */
  audienceNote?: (audience: InvitationAudience) => string | null;
};

type FestivalSettingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /**
   * The change itself. Omit it for a dialog that only sends the invitation,
   * such as "Enviar invitaciones" on an already-open acreditación.
   */
  onConfirm?: () => Promise<{
    success: boolean;
    message: string;
    /** False when nothing changed; the invitation is then not sent. */
    changed?: boolean;
  }>;
  /** Offer to mail an audience once the change is saved. */
  invitation?: FestivalSettingInvitation;
  /** Something to know before confirming, such as a broken email link. */
  notice?: string | null;
};

type AudienceState =
  | { status: "loading" }
  | { status: "ready"; audience: InvitationAudience }
  | { status: "error"; message: string };

/**
 * Confirmation for a festival switch that the public or participants notice,
 * and — when the change warrants it — the mailing that goes with it.
 *
 * The mailing is a separate, visible choice with the audience counted up
 * front, and its progress stays on screen until it ends, so nobody has to
 * guess whether hundreds of emails went out.
 */
export default function FestivalSettingDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  invitation,
  notice,
}: FestivalSettingDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const checkboxId = useId();
  const [pending, setPending] = useState(false);
  const [sendInvitation, setSendInvitation] = useState(true);
  const [audience, setAudience] = useState<AudienceState>({
    status: "loading",
  });
  const sender = useInvitationSender(
    invitation?.festivalId ?? 0,
    invitation?.kind ?? "visitor_registration",
  );
  const { reset } = sender;
  const sendingOrDone = sender.state.status !== "idle";
  const busy = pending || sender.state.status === "sending";

  const invitationFestivalId = invitation?.festivalId;
  const invitationKind = invitation?.kind;
  useEffect(() => {
    if (!open || invitationFestivalId === undefined || !invitationKind) return;
    let cancelled = false;
    setAudience({ status: "loading" });
    fetchInvitationAudience(invitationFestivalId, invitationKind)
      .then((result) => {
        if (cancelled) return;
        setAudience(
          result.success
            ? { status: "ready", audience: result.audience }
            : { status: "error", message: result.message },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setAudience({
            status: "error",
            message: "No se pudo calcular a quiénes se enviará la invitación.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, invitationFestivalId, invitationKind]);

  useEffect(() => {
    if (!open) {
      reset();
      setSendInvitation(true);
      setPending(false);
    }
  }, [open, reset]);

  function handleOpenChange(next: boolean) {
    // A run in flight lives in this dialog; closing it would stop the run.
    if (!next && busy) return;
    onOpenChange(next);
  }

  const recipients =
    audience.status === "ready" ? audience.audience.recipients : 0;
  const willSend =
    !!invitation &&
    (onConfirm ? sendInvitation : true) &&
    audience.status === "ready" &&
    recipients > 0;
  const sendOnly = !onConfirm;

  async function handleConfirm() {
    setPending(true);
    try {
      if (onConfirm) {
        const result = await onConfirm();
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        if (result.changed === false) {
          // Someone already made this change; its invitation is theirs.
          toast.info(`${result.message}. No se enviaron invitaciones.`);
          onOpenChange(false);
          return;
        }
        toast.success(result.message);
      }
      if (willSend) {
        await sender.start();
        return;
      }
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DrawerDialogContent
        isDesktop={isDesktop}
        className="sm:max-w-[480px]"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>{title}</DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            {description}
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className={cn("space-y-4", !isDesktop && "px-4 pb-6")}>
          {notice && !sendingOrDone ? (
            <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <CircleAlertIcon
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden
              />
              {notice}
            </p>
          ) : null}
          {invitation && !sendingOrDone ? (
            <div className="rounded-lg border p-3">
              {audience.status === "loading" ? (
                <div className="space-y-2" aria-busy="true">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ) : audience.status === "error" ? (
                <p className="text-sm text-destructive">{audience.message}</p>
              ) : sendOnly ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    {invitation.optionLabel(audience.audience)}
                  </p>
                  {invitation.audienceNote?.(audience.audience) ? (
                    <p className="text-muted-foreground">
                      {invitation.audienceNote(audience.audience)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={checkboxId}
                    checked={sendInvitation && recipients > 0}
                    disabled={recipients === 0 || busy}
                    onCheckedChange={(value) => setSendInvitation(!!value)}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor={checkboxId}
                      className="text-sm font-medium leading-snug"
                    >
                      {invitation.optionLabel(audience.audience)}
                    </Label>
                    {invitation.audienceNote?.(audience.audience) ? (
                      <p className="text-sm text-muted-foreground">
                        {invitation.audienceNote(audience.audience)}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {sendingOrDone ? (
            <InvitationProgress
              state={sender.state}
              expected={recipients}
              onRetry={() => void sender.retryFailures()}
            />
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {sendingOrDone ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cerrar
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant={destructive ? "destructive" : "default"}
                  disabled={
                    busy ||
                    (sendOnly &&
                      (audience.status !== "ready" || recipients === 0))
                  }
                  onClick={() => void handleConfirm()}
                >
                  {pending ? (
                    <Loader2Icon
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden
                    />
                  ) : null}
                  {confirmLabel}
                </Button>
              </>
            )}
          </div>
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
