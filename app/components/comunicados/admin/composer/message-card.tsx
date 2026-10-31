"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CreditGiftLengthCounter from "@/app/components/credit_gifts/admin/credit-gift-length-counter";
import RichTextEditor from "@/app/components/organisms/rich-text-editor";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import { textCounterText } from "@/app/components/comunicados/admin/composer/composer-copy";
import { useComunicadoImageUpload } from "@/app/components/comunicados/admin/use-comunicado-image-upload";
import {
  COMUNICADO_ACTION_LABEL_MAX,
  COMUNICADO_FOREIGN_IMAGE_MESSAGE,
  COMUNICADO_TEXT_MAX,
  COMUNICADO_TITLE_MAX,
  comunicadoActionPathProblem,
} from "@/app/lib/comunicados/definitions";
import { foreignComunicadoImageUrls } from "@/app/lib/comunicados/images";
import { cn } from "@/app/lib/utils";

export type ActionFields = { enabled: boolean; label: string; path: string };

type MessageCardProps = {
  title: string;
  onTitleChange: (title: string) => void;
  /** Read once: the editor keeps its own document afterwards. */
  initialDoc: unknown[];
  onDocChange: (doc: unknown[]) => void;
  /** Plain-text length, as the server limits it. */
  textLength: number;
  /** The server refused the text on the last save (C2). */
  contentError: string | null;
  action: ActionFields;
  onActionChange: (action: ActionFields) => void;
  /**
   * Whether an image is still uploading: until it answers, the text holds it
   * with no address, and anything sent or saved would go without it.
   */
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
};

/**
 * What the editor says about images from another site (C2.5): a draft keeps
 * them, sending refuses them.
 */
export function foreignImagesText(count: number) {
  return count === 1
    ? COMUNICADO_FOREIGN_IMAGE_MESSAGE
    : `${count} imágenes no están subidas a Glitter: subilas de nuevo.`;
}

/**
 * "Mensaje" (docs/IMPLEMENTATION-comunicados.md G4, C6): the title that is the
 * email's subject, the announcement text and the optional button to a Glitter
 * page.
 */
export default function MessageCard({
  title,
  onTitleChange,
  initialDoc,
  onDocChange,
  textLength,
  contentError,
  action,
  onActionChange,
  onUploadingChange,
  disabled = false,
}: MessageCardProps) {
  // BlockNote can report a change while it mounts (it settles the stored
  // document into its own shape). Only what follows the admin's own input
  // is a change worth saving, as in the blog's editor.
  const touchedRef = useRef(false);
  const markTouched = () => {
    touchedRef.current = true;
  };
  const upload = useComunicadoImageUpload();
  // A paste, a drop and the "Imagen" panel all upload through here.
  const [uploads, setUploads] = useState(0);
  const uploadFile = useCallback(
    async (file: File) => {
      setUploads((count) => count + 1);
      try {
        return await upload(file);
      } finally {
        setUploads((count) => count - 1);
      }
    },
    [upload],
  );
  useEffect(() => {
    onUploadingChange?.(uploads > 0);
  }, [uploads, onUploadingChange]);
  // What the editor shows, for the images flag: the server keeps a foreign
  // image on a draft and says nothing (C2.5), so the editor tells.
  const [doc, setDoc] = useState(initialDoc);
  const foreignImages = useMemo(
    () => foreignComunicadoImageUrls(doc).length,
    [doc],
  );
  const pathProblem = action.path
    ? comunicadoActionPathProblem(action.path)
    : null;
  const overText = textLength > COMUNICADO_TEXT_MAX;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mensaje</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="comunicado-title">Título</Label>
            <CreditGiftLengthCounter
              length={title.length}
              max={COMUNICADO_TITLE_MAX}
            />
          </div>
          <Input
            id="comunicado-title"
            value={title}
            maxLength={COMUNICADO_TITLE_MAX}
            placeholder="Por ejemplo: Cambio de horario de armado"
            onChange={(event) => onTitleChange(event.target.value)}
            disabled={disabled}
            aria-describedby="comunicado-title-hint"
          />
          <p
            id="comunicado-title-hint"
            className="text-xs text-muted-foreground"
          >
            Es el asunto del correo y el título de la notificación.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p id="comunicado-text-label" className="text-sm font-medium">
              Texto
            </p>
            <span
              id="comunicado-text-counter"
              className={cn(
                "text-xs tabular-nums",
                overText
                  ? "font-medium text-red-600 dark:text-red-400"
                  : "text-muted-foreground",
              )}
            >
              {textCounterText(textLength)}
            </span>
          </div>
          <div
            role="group"
            aria-labelledby="comunicado-text-label"
            aria-describedby={[
              "comunicado-text-counter",
              foreignImages > 0 && "comunicado-text-images",
              contentError && "comunicado-text-error",
            ]
              .filter(Boolean)
              .join(" ")}
            onKeyDownCapture={markTouched}
            onPasteCapture={markTouched}
            onDropCapture={markTouched}
            onCutCapture={markTouched}
            onPointerDownCapture={markTouched}
            onCompositionStartCapture={markTouched}
          >
            <RichTextEditor
              variant="announcement"
              initialContent={initialDoc}
              placeholder="Escribí el anuncio. Podés usar títulos, listas y enlaces."
              editable={!disabled}
              uploadFile={disabled ? undefined : uploadFile}
              onChange={(json) => {
                if (!Array.isArray(json)) return;
                setDoc(json as unknown[]);
                if (!touchedRef.current) return;
                onDocChange(json as unknown[]);
              }}
            />
          </div>
          {foreignImages > 0 && (
            <p
              id="comunicado-text-images"
              className="text-xs text-amber-700 dark:text-amber-400"
            >
              {foreignImagesText(foreignImages)}
            </p>
          )}
          {overText && !contentError && (
            <p className="text-xs text-red-600 dark:text-red-400">
              El texto puede tener hasta{" "}
              {COMUNICADO_TEXT_MAX.toLocaleString("es-BO")} caracteres para
              enviarse.
            </p>
          )}
          {contentError && (
            <p
              id="comunicado-text-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {contentError} El resto del borrador se guardó.
            </p>
          )}
        </div>

        <fieldset className="space-y-3" disabled={disabled}>
          <legend className="text-sm font-medium">Botón (opcional)</legend>
          <div className="flex items-center gap-3">
            <Switch
              id="comunicado-action-toggle"
              checked={action.enabled}
              disabled={disabled}
              onCheckedChange={(enabled) =>
                // Off clears both fields, so nothing half-written is kept.
                onActionChange(
                  enabled
                    ? { ...action, enabled: true }
                    : { enabled: false, label: "", path: "" },
                )
              }
            />
            <Label htmlFor="comunicado-action-toggle">Agregar un botón</Label>
          </div>
          {action.enabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="comunicado-action-label">
                    Texto del botón
                  </Label>
                  <CreditGiftLengthCounter
                    length={action.label.length}
                    max={COMUNICADO_ACTION_LABEL_MAX}
                  />
                </div>
                <Input
                  id="comunicado-action-label"
                  value={action.label}
                  maxLength={COMUNICADO_ACTION_LABEL_MAX}
                  placeholder="Ver mi reserva"
                  onChange={(event) =>
                    onActionChange({ ...action, label: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comunicado-action-path">
                  Página de Glitter
                </Label>
                <Input
                  id="comunicado-action-path"
                  value={action.path}
                  placeholder="/my_participations"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) =>
                    onActionChange({ ...action, path: event.target.value })
                  }
                  aria-invalid={pathProblem !== null}
                  aria-describedby="comunicado-action-path-hint"
                />
                <p
                  id="comunicado-action-path-hint"
                  className={
                    pathProblem
                      ? "text-xs text-red-600 dark:text-red-400"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {pathProblem ??
                    "Pegá un enlace de Glitter. Para enlazar otro sitio, ponelo en el texto."}
                </p>
              </div>
            </div>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}
