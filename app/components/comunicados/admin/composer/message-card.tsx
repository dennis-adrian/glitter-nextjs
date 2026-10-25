"use client";

import { useRef } from "react";

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
import {
  COMUNICADO_ACTION_LABEL_MAX,
  COMUNICADO_TEXT_MAX,
  COMUNICADO_TITLE_MAX,
  comunicadoActionPathProblem,
} from "@/app/lib/comunicados/definitions";
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
  disabled?: boolean;
};

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
  disabled = false,
}: MessageCardProps) {
  // BlockNote can report a change while it mounts (it settles the stored
  // document into its own shape). Only what follows the admin's own input
  // is a change worth saving, as in the blog's editor.
  const touchedRef = useRef(false);
  const markTouched = () => {
    touchedRef.current = true;
  };
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
            aria-describedby={
              contentError
                ? "comunicado-text-counter comunicado-text-error"
                : "comunicado-text-counter"
            }
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
              onChange={(json) => {
                if (!touchedRef.current || !Array.isArray(json)) return;
                onDocChange(json as unknown[]);
              }}
            />
          </div>
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
