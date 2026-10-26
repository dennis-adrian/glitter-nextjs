"use client";

import { RotateCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import ChannelsCard from "@/app/components/comunicados/admin/composer/channels-card";
import {
  type ComposerEnv,
  missingForSend,
} from "@/app/components/comunicados/admin/composer/composer-copy";
import ComposerHeader from "@/app/components/comunicados/admin/composer/composer-header";
import MessageCard from "@/app/components/comunicados/admin/composer/message-card";
import PreviewPanel, {
  type PreviewInput,
} from "@/app/components/comunicados/admin/composer/preview-panel";
import RecipientsCard, {
  type SourceKind,
} from "@/app/components/comunicados/admin/composer/recipients-card";
import SendPanel from "@/app/components/comunicados/admin/composer/send-panel";
import {
  type ComposerDraft,
  type ComposerFestivalOption,
  type ComposerFields,
  type ComposerListOption,
  type ComposerPerson,
  type ComposerSourceNames,
  composerFieldsOf,
  draftFieldsOf,
} from "@/app/components/comunicados/admin/composer/types";
import { useDraftAutosave } from "@/app/components/comunicados/admin/composer/use-autosave";
import { useLiveResult } from "@/app/components/comunicados/admin/composer/use-live-result";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";
import {
  discardComunicadoDraftAction,
  previewComunicadoAudienceAction,
  saveComunicadoDraftAction,
} from "@/app/lib/comunicados/actions";
import {
  type ComunicadoAudience,
  isEmptyComunicadoAudience,
} from "@/app/lib/comunicados/definitions";
import { sendComunicadoTestAction } from "@/app/lib/comunicados/test-send";
import { announcementBlocksToText } from "@/app/lib/comunicados/text";

/** How long the live counts wait after the audience or a channel changes. */
const AUDIENCE_PREVIEW_DEBOUNCE_MS = 600;

type AudiencePreviewInput = {
  audience: ComunicadoAudience;
  essential: boolean;
  sendEmail: boolean;
};

function loadAudiencePreview(input: AudiencePreviewInput) {
  return previewComunicadoAudienceAction(input);
}

/** Every refusal of a count is worth asking again: the input is valid. */
function audiencePreviewFailed(
  result: Awaited<ReturnType<typeof loadAudiencePreview>>,
) {
  return !result.success;
}

export type ComunicadoComposerProps = {
  draft: ComposerDraft;
  festivals: ComposerFestivalOption[];
  lists: ComposerListOption[];
  names: ComposerSourceNames;
  /** `notifications` is public for participants: the bell is open to all. */
  notificationsLaunched: boolean;
  pushLaunched: boolean;
  env: ComposerEnv;
};

/**
 * One page, no wizard (docs/IMPLEMENTATION-comunicados.md G4): the message,
 * who gets it and how on the left; what they will see and the test send on
 * the right. Every change is saved a moment later; nothing here sends to
 * anyone but the admin.
 */
export default function ComunicadoComposer({
  draft,
  festivals,
  lists,
  names: initialNames,
  notificationsLaunched,
  pushLaunched,
  env,
}: ComunicadoComposerProps) {
  const router = useRouter();
  const [fields, setFields] = useState<ComposerFields>(() =>
    composerFieldsOf(draft),
  );
  const [names, setNames] = useState(initialNames);
  const [discarding, setDiscarding] = useState(false);
  const [testPending, startTest] = useTransition();

  const autosave = useDraftAutosave({
    comunicadoId: draft.id,
    initialVersion: draft.version,
    fields: draftFieldsOf(fields),
    save: saveComunicadoDraftAction,
    // Back and Forward would bring this draft and the list as they opened.
    // Not after a discard: the autosave skips it then.
    onLeave: () => router.refresh(),
  });
  const { controller } = autosave;
  const blocked = autosave.status.kind === "blocked" ? autosave.status : null;
  const locked = blocked !== null || discarding;

  const update = (patch: Partial<ComposerFields>) =>
    setFields((current) => ({ ...current, ...patch }));
  const updateAudience = (
    change: (audience: ComunicadoAudience) => ComunicadoAudience,
  ) =>
    setFields((current) => ({
      ...current,
      audience: change(current.audience),
    }));

  const text = announcementBlocksToText(fields.doc, { withUrls: false });
  const audienceEmpty = isEmptyComunicadoAudience(fields.audience);

  const audienceAnswer = useLiveResult({
    input: audienceEmpty
      ? null
      : {
          audience: fields.audience,
          essential: fields.essential,
          sendEmail: fields.sendEmail,
        },
    load: loadAudiencePreview,
    delayMs: AUDIENCE_PREVIEW_DEBOUNCE_MS,
    failedWhen: audiencePreviewFailed,
  });
  const preview = audienceAnswer.result?.success
    ? audienceAnswer.result.preview
    : null;
  const previewError = !audienceAnswer.failed
    ? null
    : audienceAnswer.result?.success === false
      ? audienceAnswer.result.message
      : "No pudimos contar los destinatarios. Probá de nuevo.";

  const essentialFestival =
    fields.essential && fields.sendEmail && preview?.essentialAllowed.ok
      ? (preview.essentialAllowed.festival?.name ?? null)
      : null;
  const previewInput: PreviewInput = {
    title: fields.title,
    doc: fields.doc,
    actionLabel: fields.actionEnabled ? fields.actionLabel : null,
    actionPath: fields.actionEnabled ? fields.actionPath : null,
    essentialFestivalName: essentialFestival,
  };

  const missing = missingForSend({
    title: fields.title,
    text,
    audienceEmpty,
    action: {
      enabled: fields.actionEnabled,
      label: fields.actionLabel,
      path: fields.actionPath,
    },
    essential: { on: fields.essential, reason: fields.essentialReason },
  });

  // Leaving the tab saves at once; closing it with something unsaved asks.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void controller.flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [controller]);

  useEffect(() => {
    if (!autosave.unsaved || discarding) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [autosave.unsaved, discarding]);

  function addPerson(person: ComposerPerson) {
    setNames((current) => ({
      ...current,
      people: { ...current.people, [person.id]: person },
    }));
    updateAudience((audience) =>
      audience.people.includes(person.id)
        ? audience
        : { ...audience, people: [...audience.people, person.id] },
    );
  }

  function removeSource(kind: SourceKind, id: number) {
    updateAudience((audience) => ({
      festivals:
        kind === "festival"
          ? audience.festivals.filter((current) => current !== id)
          : audience.festivals,
      lists:
        kind === "list"
          ? audience.lists.filter((current) => current !== id)
          : audience.lists,
      people:
        kind === "person"
          ? audience.people.filter((current) => current !== id)
          : audience.people,
    }));
  }

  function testSend() {
    startTest(async () => {
      // The test mails the stored draft, so what is on screen goes first.
      const flushed = await controller.flush();
      if (!flushed.ok) {
        toast.error(flushed.message);
        return;
      }
      try {
        const result = await sendComunicadoTestAction(draft.id);
        if (result.success) toast.success(result.message);
        else toast.error(result.message);
      } catch (error) {
        console.error("Error sending a comunicado test", error);
        toast.error(
          "No pudimos enviarte la prueba. Intentá de nuevo en unos minutos.",
        );
      }
    });
  }

  async function discard(): Promise<boolean> {
    setDiscarding(true);
    // No save may reach a draft being deleted.
    const resume = await controller.pause();
    try {
      const result = await discardComunicadoDraftAction(draft.id);
      if (result.success) {
        // Gone: nothing to save on leaving, and the list is fresh already.
        controller.markDiscarded();
        toast.success(result.message);
        router.replace("/dashboard/communications");
        return true;
      }
      toast.error(result.message);
    } catch (error) {
      console.error("Error discarding a comunicado draft", error);
      toast.error("No se pudo descartar el borrador.");
    }
    resume();
    setDiscarding(false);
    return false;
  }

  return (
    <div className="space-y-4">
      <ComposerHeader
        status={autosave.status}
        onDiscard={discard}
        discarding={discarding}
      />

      {blocked && (
        <Banner variant="danger" title="Los cambios ya no se guardan">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{blocked.message}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => window.location.reload()}
            >
              <RotateCwIcon className="mr-1.5 h-4 w-4" aria-hidden />
              Recargar
            </Button>
          </div>
        </Banner>
      )}
      {draft.scheduleMissed && (
        <Banner variant="warning" title="No se envió a la hora programada">
          {draft.scheduleMissedDetail ??
            "La programación no se pudo enviar y quedó como borrador."}
        </Banner>
      )}
      {!notificationsLaunched && (
        <Banner variant="info">
          Las notificaciones de la app todavía no son públicas: por ahora a los
          participantes solo les llega el correo. Lo van a ver en la app cuando
          la campana se abra a todos.
        </Banner>
      )}
      {draft.audienceUnreadable && (
        <Banner variant="warning">
          No pudimos leer los destinatarios guardados. Elegilos de nuevo.
        </Banner>
      )}

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div
          className="min-w-0 space-y-4"
          // A field left is a pause in the writing: save it now.
          onBlurCapture={() => void controller.flush()}
        >
          <MessageCard
            title={fields.title}
            onTitleChange={(title) => update({ title })}
            initialDoc={draft.doc}
            onDocChange={(doc) => update({ doc })}
            textLength={text.length}
            contentError={autosave.contentError}
            action={{
              enabled: fields.actionEnabled,
              label: fields.actionLabel,
              path: fields.actionPath,
            }}
            onActionChange={(action) =>
              update({
                actionEnabled: action.enabled,
                actionLabel: action.label,
                actionPath: action.path,
              })
            }
            disabled={locked}
          />
          <RecipientsCard
            audience={fields.audience}
            names={names}
            festivals={festivals}
            lists={lists}
            preview={preview}
            previewStale={audienceAnswer.stale}
            previewError={previewError}
            onRetryPreview={audienceAnswer.retry}
            env={env}
            onAddFestival={(festivalId) =>
              updateAudience((audience) =>
                audience.festivals.includes(festivalId)
                  ? audience
                  : {
                      ...audience,
                      festivals: [...audience.festivals, festivalId],
                    },
              )
            }
            onAddList={(listId) =>
              updateAudience((audience) =>
                audience.lists.includes(listId)
                  ? audience
                  : { ...audience, lists: [...audience.lists, listId] },
              )
            }
            onAddPerson={addPerson}
            onRemove={removeSource}
            disabled={locked}
          />
          <ChannelsCard
            sendEmail={fields.sendEmail}
            onSendEmailChange={(sendEmail) => update({ sendEmail })}
            sendPush={fields.sendPush}
            onSendPushChange={(sendPush) => update({ sendPush })}
            essential={fields.essential}
            onEssentialChange={(essential) => update({ essential })}
            essentialReason={fields.essentialReason}
            onEssentialReasonChange={(essentialReason) =>
              update({ essentialReason })
            }
            preview={preview}
            pushLaunched={pushLaunched}
            disabled={locked}
          />
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:self-start">
          <PreviewPanel input={previewInput} sendPush={fields.sendPush} />
          <SendPanel
            preview={preview}
            audienceEmpty={audienceEmpty}
            sendEmail={fields.sendEmail}
            sendPush={fields.sendPush}
            missing={missing}
            onTestSend={testSend}
            testPending={testPending}
            disabled={locked}
          />
        </div>
      </div>
    </div>
  );
}
