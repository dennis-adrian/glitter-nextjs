"use client";

import Image from "next/image";
import { useState } from "react";

import RetryButton from "@/app/components/comunicados/admin/composer/retry-button";
import {
  DOC_TOO_LONG_MESSAGE,
  isDocFarTooLong,
} from "@/app/components/comunicados/admin/composer/use-autosave";
import { useLiveResult } from "@/app/components/comunicados/admin/composer/use-live-result";
import RichTextHtml from "@/app/components/molecules/rich-text-html";
import NotificationIcon from "@/app/components/notifications/notification-icon";
import NotificationItem from "@/app/components/notifications/notification-item";
import { buttonVariants } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";
import { COMUNICADO_UNTITLED } from "@/app/lib/comunicados/definitions";
import { renderComunicadoPreviewAction } from "@/app/lib/comunicados/preview-actions";
import { formatDateWithTime } from "@/app/lib/formatters";
import {
  NOTIFICATION_CATEGORY_LABELS,
  safeActionPath,
} from "@/app/lib/notifications/definitions";
import { cn } from "@/app/lib/utils";

/** How long the preview waits after the last keystroke. */
const PREVIEW_DEBOUNCE_MS = 600;

export type PreviewInput = {
  title: string;
  doc: unknown[];
  actionLabel: string | null;
  actionPath: string | null;
  /** The festival an essential email names, when it applies. */
  essentialFestivalName: string | null;
};

type PreviewResult = Awaited<ReturnType<typeof renderComunicadoPreviewAction>>;

type PreviewTab = "notification" | "detail" | "email" | "device";

/** Links open in a new tab instead of the frame; the frame runs no scripts. */
function previewDocument(html: string) {
  const base = '<base target="_blank">';
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (head) => `${head}${base}`)
    : `${base}${html}`;
}

function loadPreview(input: PreviewInput) {
  return renderComunicadoPreviewAction(input);
}

/**
 * "Vista previa" (docs/IMPLEMENTATION-comunicados.md G4): the comunicado as
 * the inbox, its page, the email and the device would show it, rendered on
 * the server a moment after the admin stops typing.
 */
export default function PreviewPanel({
  input,
  sendPush,
}: {
  input: PreviewInput;
  sendPush: boolean;
}) {
  const [tab, setTab] = useState<PreviewTab>("notification");
  // The device tab goes away with the tick; its place falls back to the first.
  const activeTab = tab === "device" && !sendPush ? "notification" : tab;
  // The autosave keeps such a text back too: it is not worth a request.
  const tooLong = isDocFarTooLong(input.doc);
  const { result, stale, failed, retry } = useLiveResult<
    PreviewInput,
    PreviewResult
  >({
    input: tooLong ? null : input,
    load: loadPreview,
    delayMs: PREVIEW_DEBOUNCE_MS,
  });
  // Shown on the item and the page as "recién" and today; fixed on open.
  const [openedAt] = useState(() => new Date().toISOString());
  const title = input.title.replace(/\s+/g, " ").trim() || COMUNICADO_UNTITLED;
  const action =
    input.actionLabel?.trim() && safeActionPath(input.actionPath?.trim())
      ? { label: input.actionLabel.trim(), path: input.actionPath!.trim() }
      : null;
  const ready = result?.success ? result : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vista previa</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setTab(value as PreviewTab)}
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="notification">Notificación</TabsTrigger>
            <TabsTrigger value="detail">Detalle</TabsTrigger>
            <TabsTrigger value="email">Correo</TabsTrigger>
            {sendPush && <TabsTrigger value="device">Dispositivo</TabsTrigger>}
          </TabsList>

          {tooLong ? (
            <p className="mt-3 rounded-lg border p-3 text-sm text-muted-foreground">
              {DOC_TOO_LONG_MESSAGE}
            </p>
          ) : failed ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3">
              <p className="text-sm text-muted-foreground" role="status">
                No se pudo generar la vista previa.
              </p>
              <RetryButton onRetry={retry} />
            </div>
          ) : result && !result.success ? (
            <p className="mt-3 rounded-lg border p-3 text-sm text-muted-foreground">
              {result.message}
            </p>
          ) : !ready ? (
            <div
              className="mt-3 space-y-2 rounded-lg border p-3"
              aria-busy="true"
            >
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div
              className={cn("transition-opacity", stale && "opacity-60")}
              aria-busy={stale}
            >
              <TabsContent value="notification">
                <div className="overflow-hidden rounded-lg border bg-background">
                  <NotificationItem
                    static
                    item={{
                      id: 0,
                      kind: "comunicado",
                      category: "announcements",
                      title,
                      body: ready.excerpt,
                      actionPath: action?.path ?? null,
                      actionLabel: action?.label ?? null,
                      creditDelta: null,
                      opensDetail: true,
                      readAt: null,
                      createdAt: openedAt,
                      editedAt: null,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Así aparece en sus notificaciones. Al tocarlo se abre el
                  detalle.
                </p>
              </TabsContent>

              <TabsContent value="detail">
                <DetailPreview
                  title={title}
                  html={ready.detailHtml}
                  action={action}
                  at={openedAt}
                />
              </TabsContent>

              <TabsContent value="email">
                <div className="overflow-hidden rounded-lg border">
                  <dl className="space-y-1 border-b bg-muted/40 p-3 text-sm">
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-muted-foreground">
                        De
                      </dt>
                      <dd className="min-w-0 break-words">
                        {ready.email.from}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-muted-foreground">
                        Asunto
                      </dt>
                      <dd className="min-w-0 break-words font-medium">
                        {ready.email.subject}
                      </dd>
                    </div>
                  </dl>
                  <iframe
                    title={`Vista previa del correo: ${ready.email.subject}`}
                    srcDoc={previewDocument(ready.email.html)}
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    className="block h-[60vh] w-full bg-white md:h-[520px]"
                  />
                  <p className="border-t p-2 text-xs text-muted-foreground">
                    Así lo vería una persona con tu nombre. El enlace para darse
                    de baja no funciona en la vista previa.
                  </p>
                </div>
              </TabsContent>

              {sendPush && (
                <TabsContent value="device">
                  <DevicePreview title={title} />
                </TabsContent>
              )}
            </div>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

/**
 * The comunicado's own page (H2), drawn like `NotificationDetail` with the
 * rendered text in place of its plain body, and the button inert.
 */
function DetailPreview({
  title,
  html,
  action,
  at,
}: {
  title: string;
  html: string;
  action: { label: string; path: string } | null;
  at: string;
}) {
  return (
    <article className="space-y-4 rounded-lg border bg-background p-4">
      <header className="flex items-start gap-3">
        <NotificationIcon kind="comunicado" category="announcements" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            {NOTIFICATION_CATEGORY_LABELS.announcements} ·{" "}
            {formatDateWithTime(new Date(at))}
          </p>
          <h3 className="font-display text-xl font-bold leading-tight">
            {title}
          </h3>
        </div>
      </header>
      {html.trim() ? (
        <RichTextHtml html={html} className="text-base" />
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay texto.</p>
      )}
      {action && (
        <span
          className={cn(buttonVariants(), "pointer-events-none")}
          aria-label={`Botón: ${action.label} (lleva a ${action.path})`}
        >
          {action.label}
        </span>
      )}
    </article>
  );
}

/** A lock screen with the push as it arrives (H4). */
function DevicePreview({ title }: { title: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-b from-slate-800 to-slate-950 p-4 pb-10">
      <p
        className="mb-4 text-center text-3xl font-light tabular-nums text-white/90"
        aria-hidden
      >
        9:41
      </p>
      <div className="rounded-2xl bg-white/85 p-3 text-slate-900 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Image
            src="/icons/glitter-192.png"
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 rounded-md"
          />
          <span className="font-semibold uppercase tracking-wide">Glitter</span>
          <span className="ml-auto">ahora</span>
        </div>
        <p className="mt-1.5 text-sm font-semibold leading-snug">{title}</p>
        <p className="text-sm leading-snug text-slate-700">
          Tocá para ver el detalle.
        </p>
      </div>
    </div>
  );
}
