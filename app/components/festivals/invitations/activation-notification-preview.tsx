"use client";

import { BellIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useState } from "react";

import NotificationItem from "@/app/components/notifications/notification-item";
import PushDevicePreview from "@/app/components/notifications/push-device-preview";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { previewActivationNotification } from "@/app/lib/festivals/activation-notifications";
import type { ActivationNotificationPreviewResult } from "@/app/lib/festivals/invitation-definitions";

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      preview: Extract<ActivationNotificationPreviewResult, { success: true }>;
    }
  | { status: "error"; message: string };

/**
 * The activation notice as a participant gets it: the row in their
 * notifications and, when it goes as a push, their lock screen. Rendered on
 * demand from the festival as it is now.
 */
export default function ActivationNotificationPreview({
  festivalId,
  showPush,
  disabled = false,
}: {
  festivalId: number;
  /** Whether the push is ticked: the lock screen only shows then. */
  showPush: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PreviewState>({ status: "idle" });
  // The row reads "recién"; fixed when the dialog renders it.
  const [openedAt] = useState(() => new Date().toISOString());

  async function load() {
    setState({ status: "loading" });
    try {
      const result = await previewActivationNotification(festivalId);
      setState(
        result.success
          ? { status: "ready", preview: result }
          : { status: "error", message: result.message },
      );
    } catch {
      setState({
        status: "error",
        message: "No se pudo generar la vista previa de la notificación.",
      });
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && state.status !== "ready" && state.status !== "loading") {
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
        <BellIcon className="mr-2 h-4 w-4" aria-hidden />
        {open
          ? "Ocultar la notificación"
          : "Ver la notificación antes de enviar"}
        {open ? (
          <ChevronUpIcon className="ml-auto h-4 w-4" aria-hidden />
        ) : (
          <ChevronDownIcon className="ml-auto h-4 w-4" aria-hidden />
        )}
      </Button>

      {open ? (
        state.status === "ready" ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                En sus notificaciones de Glitter
              </p>
              <div className="overflow-hidden rounded-lg border bg-background">
                <NotificationItem
                  static
                  item={{
                    id: 0,
                    kind: "festival_participant_invitation",
                    category: "reservations",
                    title: state.preview.item.title,
                    body: state.preview.item.body,
                    actionPath: state.preview.item.actionPath,
                    actionLabel: state.preview.item.actionLabel,
                    creditDelta: null,
                    opensDetail: false,
                    readAt: null,
                    createdAt: openedAt,
                    editedAt: null,
                  }}
                />
              </div>
            </div>
            {showPush ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Como push, en su dispositivo
                </p>
                <PushDevicePreview
                  title={state.preview.push.title}
                  body={state.preview.push.body}
                />
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Al tocarla se abren los términos y condiciones del festival.
            </p>
          </div>
        ) : state.status === "error" ? (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <p className="text-destructive">{state.message}</p>
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
            <Skeleton className="h-24 w-full" />
          </div>
        )
      ) : null}
    </div>
  );
}
