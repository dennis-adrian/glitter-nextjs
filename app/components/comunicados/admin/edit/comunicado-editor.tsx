"use client";

import { ArrowLeftIcon, RotateCwIcon, SaveIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { missingForSend } from "@/app/components/comunicados/admin/composer/composer-copy";
import MessageCard, {
  type ActionFields,
} from "@/app/components/comunicados/admin/composer/message-card";
import PreviewPanel, {
  type PreviewInput,
} from "@/app/components/comunicados/admin/composer/preview-panel";
import EditConfirmDialog from "@/app/components/comunicados/admin/edit/edit-confirm-dialog";
import {
  EDIT_BACK_LABEL,
  EDIT_BANNER_TEXT,
  EDIT_NOTE_REQUIRED_TEXT,
  editNoteLabel,
} from "@/app/components/comunicados/admin/edit/edit-copy";
import CreditGiftLengthCounter from "@/app/components/credit_gifts/admin/credit-gift-length-counter";
import { Banner } from "@/app/components/ui/banner";
import { Button, buttonVariants } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import type {
  ComunicadoRetractCounts,
  EditComunicadoInput,
  EditComunicadoResult,
} from "@/app/lib/comunicados/contracts";
import { COMUNICADO_EDIT_NOTE_MAX } from "@/app/lib/comunicados/definitions";
import { announcementBlocksToText } from "@/app/lib/comunicados/text";
import { cn } from "@/app/lib/utils";

type Refusal = Extract<EditComunicadoResult, { success: false }>;

/**
 * Refusals that no later save on this page can get past: the comunicado is
 * not as the page shows it, or not editable any more.
 */
const FINAL_REFUSALS = new Set<Refusal["code"]>([
  "STALE",
  "RETRACTED",
  "NOT_SENT",
  "NOT_FOUND",
]);

/** The button as the server reads it: each field trimmed, empty as none. */
function sentAction(action: ActionFields) {
  const label = action.enabled ? action.label.trim() : "";
  const path = action.enabled ? action.path.trim() : "";
  return { label: label || null, path: path || null };
}

export type ComunicadoEditorProps = {
  comunicadoId: number;
  /** The current revision: what the page shows, and what saving expects. */
  revision: number;
  title: string;
  doc: unknown[];
  actionLabel: string | null;
  actionPath: string | null;
  essential: boolean;
  /** The festival an essential email names, as the preview shows it. */
  essentialFestivalName: string | null;
  sendEmail: boolean;
  sendPush: boolean;
  /** The campaign is still processing. */
  sending: boolean;
  /** The report's numbers, which the dialog reads out (G7). */
  counts: ComunicadoRetractCounts;
};

/**
 * "Editar" on a sent comunicado (docs/IMPLEMENTATION-comunicados.md F1, G1,
 * G7): the title, the text and the button of the current revision, with
 * what they will look like beside them. Nothing saves until "Guardar
 * cambios…" is confirmed, so there is no autosave; a note says why it
 * changed, and an essential comunicado requires it.
 */
export default function ComunicadoEditor({
  comunicadoId,
  revision,
  title: revisionTitle,
  doc: revisionDoc,
  actionLabel: revisionActionLabel,
  actionPath: revisionActionPath,
  essential,
  essentialFestivalName,
  sendEmail,
  sendPush,
  sending,
  counts,
}: ComunicadoEditorProps) {
  const router = useRouter();
  const noteId = useId();
  const itemPath = `/dashboard/communications/${comunicadoId}`;
  // Read once, as the editor reads its document: a refresh that brings a
  // newer revision must not have this page's text saved over it unseen, so
  // saving keeps expecting the revision it was written on.
  const [seed] = useState(() => ({
    revision,
    title: revisionTitle,
    doc: revisionDoc,
    actionLabel: revisionActionLabel,
    actionPath: revisionActionPath,
  }));
  const [title, setTitle] = useState(seed.title);
  const [doc, setDoc] = useState(seed.doc);
  /** The admin wrote in the text: BlockNote's own settling is not a change. */
  const [docChanged, setDocChanged] = useState(false);
  const [action, setAction] = useState<ActionFields>(() => ({
    enabled: seed.actionLabel !== null || seed.actionPath !== null,
    label: seed.actionLabel ?? "",
    path: seed.actionPath ?? "",
  }));
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** Why the last save did not go through, shown by the button. */
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  /** Saved: the page is on its way back to the comunicado. */
  const [saved, setSaved] = useState(false);

  const button = sentAction(action);
  const changed =
    docChanged ||
    title.trim() !== seed.title.trim() ||
    button.label !== seed.actionLabel ||
    button.path !== seed.actionPath;
  const noteMissing = essential && !note.trim();
  const text = announcementBlocksToText(doc, { withUrls: false });
  // What a sent comunicado must still have; its audience and essential
  // mark are fixed, so only the message is checked.
  const missing = missingForSend({
    title,
    text,
    audienceEmpty: false,
    action,
    essential: { on: false, reason: "" },
  });
  const outOfDate = refusal !== null && FINAL_REFUSALS.has(refusal.code);
  const canSave =
    changed && !noteMissing && missing.length === 0 && !outOfDate && !saved;
  const unsaved = (changed || note.trim() !== "") && !saved;

  const input: EditComunicadoInput = {
    comunicadoId,
    expectedRevision: seed.revision,
    title,
    doc,
    actionLabel: action.enabled ? action.label : null,
    actionPath: action.enabled ? action.path : null,
    editNote: note.trim() || null,
  };
  const previewInput: PreviewInput = {
    title,
    doc,
    actionLabel: input.actionLabel,
    actionPath: input.actionPath,
    essentialFestivalName,
  };

  // Closing the tab with a change on screen asks first.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  function openConfirm() {
    if (!canSave) return;
    setRefusal(null);
    setConfirmOpen(true);
  }

  function handleResult(result: EditComunicadoResult) {
    if (!result.success) {
      // What was written stays on screen, for another try or to copy it.
      setRefusal(result);
      return;
    }
    setSaved(true);
    toast.success(result.message);
    router.push(itemPath);
    router.refresh();
  }

  return (
    <div className="space-y-4 overflow-y-auto pb-6">
      <Link
        href={itemPath}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-3",
        )}
      >
        <ArrowLeftIcon className="mr-1 h-4 w-4" aria-hidden />
        {EDIT_BACK_LABEL}
      </Link>

      <Banner variant="info">{EDIT_BANNER_TEXT}</Banner>

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <MessageCard
            title={title}
            onTitleChange={setTitle}
            initialDoc={seed.doc}
            onDocChange={(next) => {
              setDoc(next);
              setDocChanged(true);
            }}
            textLength={text.length}
            // Its own refusal speaks of a draft; the server's answer is
            // shown by the button instead.
            contentError={null}
            action={action}
            onActionChange={setAction}
            disabled={saved}
          />

          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor={noteId}>{editNoteLabel(essential)}</Label>
                  <CreditGiftLengthCounter
                    length={note.length}
                    max={COMUNICADO_EDIT_NOTE_MAX}
                  />
                </div>
                <Textarea
                  id={noteId}
                  value={note}
                  maxLength={COMUNICADO_EDIT_NOTE_MAX}
                  rows={3}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={saved}
                  aria-describedby={noteMissing ? `${noteId}-hint` : undefined}
                />
                {noteMissing && (
                  <p
                    id={`${noteId}-hint`}
                    className="text-xs text-amber-700 dark:text-amber-400"
                  >
                    {EDIT_NOTE_REQUIRED_TEXT}
                  </p>
                )}
              </div>

              {refusal && (
                <div
                  role="alert"
                  className="flex flex-col gap-2 rounded-lg border border-[#E8356A] bg-[#E8356A]/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>{refusal.message}</span>
                  {refusal.code === "STALE" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="self-start sm:self-auto"
                      onClick={() => window.location.reload()}
                    >
                      <RotateCwIcon className="mr-1.5 h-4 w-4" aria-hidden />
                      Recargar
                    </Button>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={!canSave}
                  onClick={openConfirm}
                >
                  <SaveIcon className="mr-2 h-4 w-4" aria-hidden />
                  Guardar cambios…
                </Button>
                {missing.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Falta {missing.join(", ")}.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:self-start">
          <PreviewPanel input={previewInput} sendPush={sendPush} />
        </div>
      </div>

      <EditConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        input={input}
        counts={counts}
        sendEmail={sendEmail}
        sendPush={sendPush}
        sending={sending}
        essential={essential}
        onResult={handleResult}
      />
    </div>
  );
}
