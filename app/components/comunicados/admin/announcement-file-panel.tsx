"use client";

import {
  FilePanel,
  useBlockNoteEditor,
  type FilePanelProps,
} from "@blocknote/react";
import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";

import type { AnnouncementEditor } from "@/app/components/comunicados/admin/announcement-toolbar";
import { COMUNICADO_IMAGE_UPLOAD_FAILED } from "@/app/components/comunicados/admin/use-comunicado-image-upload";
import { Input } from "@/app/components/ui/input";
import {
  COMUNICADO_IMAGE_HELP,
  COMUNICADO_IMAGE_TYPES,
  COMUNICADO_MAX_IMAGES,
} from "@/app/lib/comunicados/definitions";
import {
  COMUNICADO_IMAGE_CAP_MESSAGE,
  countComunicadoImages,
} from "@/app/lib/comunicados/images";

/**
 * The comunicado editor's file panel (C4): BlockNote's panel with the upload
 * tab alone. Its default panel always adds an "Embed" tab, and an address
 * typed there would be an image from another site, which sending refuses
 * (C2.5).
 */
export default function AnnouncementFilePanel({ blockId }: FilePanelProps) {
  return (
    <FilePanel
      blockId={blockId}
      tabs={[
        {
          name: "Subir",
          tabPanel: <AnnouncementUploadTab blockId={blockId} />,
        },
      ]}
    />
  );
}

/**
 * Picks a JPEG or PNG, uploads it through the editor's `uploadFile` and puts
 * its address in the image block the panel opened for. A refusal shows here;
 * the upload hook toasts it as well.
 */
export function AnnouncementUploadTab({ blockId }: FilePanelProps) {
  // The editor was made from `announcementEditorSchema`; the context types
  // it as the default schema.
  const editor = useBlockNoteEditor() as unknown as AnnouncementEditor;
  const inputId = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    if (!editor.uploadFile) return;
    // The block waiting for this file has no address yet, so it is not
    // counted: six others already fill the comunicado.
    if (countComunicadoImages(editor.document) >= COMUNICADO_MAX_IMAGES) {
      setError(COMUNICADO_IMAGE_CAP_MESSAGE);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      // Without the block's id: BlockNote 0.54's image would swap its "add"
      // button for "Loading..." and, after a failure, never put it back, so
      // a second upload into it would throw before it started
      // (`createFileBlockWrapper`). This panel shows the upload instead.
      const url = await editor.uploadFile(file);
      if (typeof url !== "string") {
        throw new Error(COMUNICADO_IMAGE_UPLOAD_FAILED);
      }
      // Removed while it uploaded: there is nothing to show it in.
      if (!editor.getBlock(blockId)) return;
      // Any change to the document closes the panel (`FilePanelExtension`).
      editor.updateBlock(blockId, { props: { url } });
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message
          ? failure.message
          : COMUNICADO_IMAGE_UPLOAD_FAILED,
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex w-72 max-w-full flex-col gap-2">
      <Input
        id={inputId}
        type="file"
        accept={COMUNICADO_IMAGE_TYPES.join(",")}
        aria-label="Archivo de imagen"
        aria-describedby={
          error ? `${inputId}-help ${inputId}-error` : `${inputId}-help`
        }
        disabled={uploading || !editor.uploadFile}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Lets the same file be picked again after a refusal.
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
        {COMUNICADO_IMAGE_HELP}
      </p>
      {uploading && (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Subiendo la imagen…
        </p>
      )}
      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
