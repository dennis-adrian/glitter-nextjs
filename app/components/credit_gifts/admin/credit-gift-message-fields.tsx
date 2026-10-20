"use client";

import { useRef } from "react";

import CreditGiftLengthCounter from "@/app/components/credit_gifts/admin/credit-gift-length-counter";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import {
  CREDIT_GIFT_INTERNAL_NOTE_MAX_LENGTH,
  CREDIT_GIFT_MESSAGE_MAX_LENGTH,
  CREDIT_GIFT_NAME_PLACEHOLDER,
  CREDIT_GIFT_OCCASION_LABELS,
  CREDIT_GIFT_OCCASIONS,
  CREDIT_GIFT_TITLE_MAX_LENGTH,
  type CreditGiftOccasion,
} from "@/app/lib/credit_gifts/definitions";

type CreditGiftMessageFieldsProps = {
  occasion: CreditGiftOccasion;
  onOccasionChange: (occasion: CreditGiftOccasion) => void;
  title: string;
  onTitleChange: (title: string) => void;
  message: string;
  onMessageChange: (message: string) => void;
  internalNote: string;
  onInternalNoteChange: (note: string) => void;
  disabled?: boolean;
};

/**
 * The occasion pre-fills a title and a message the admin can rewrite. The
 * internal note is a separate field on purpose: what the team writes for
 * itself must never end up in the participant's wallet.
 */
export default function CreditGiftMessageFields({
  occasion,
  onOccasionChange,
  title,
  onTitleChange,
  message,
  onMessageChange,
  internalNote,
  onInternalNoteChange,
  disabled = false,
}: CreditGiftMessageFieldsProps) {
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const titleHasPlaceholder = title.includes(CREDIT_GIFT_NAME_PLACEHOLDER);

  function insertName() {
    const field = messageRef.current;
    const start = field?.selectionStart ?? message.length;
    const end = field?.selectionEnd ?? message.length;
    const next =
      message.slice(0, start) +
      CREDIT_GIFT_NAME_PLACEHOLDER +
      message.slice(end);
    if (next.length > CREDIT_GIFT_MESSAGE_MAX_LENGTH) return;
    onMessageChange(next);
    requestAnimationFrame(() => {
      const caret = start + CREDIT_GIFT_NAME_PLACEHOLDER.length;
      field?.focus();
      field?.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium" id="credit-gift-occasion-label">
          Motivo
        </p>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-labelledby="credit-gift-occasion-label"
        >
          {CREDIT_GIFT_OCCASIONS.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              role="radio"
              aria-checked={occasion === value}
              variant={occasion === value ? "default" : "outline"}
              disabled={disabled}
              onClick={() => onOccasionChange(value)}
            >
              {CREDIT_GIFT_OCCASION_LABELS[value]}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="credit-gift-title" className="text-sm font-medium">
            Título
          </label>
          <CreditGiftLengthCounter
            length={title.length}
            max={CREDIT_GIFT_TITLE_MAX_LENGTH}
          />
        </div>
        <Input
          id="credit-gift-title"
          value={title}
          maxLength={CREDIT_GIFT_TITLE_MAX_LENGTH}
          onChange={(event) => onTitleChange(event.target.value)}
          disabled={disabled}
          aria-invalid={titleHasPlaceholder}
          aria-describedby="credit-gift-title-hint"
        />
        <p
          id="credit-gift-title-hint"
          className={
            titleHasPlaceholder
              ? "text-xs text-red-600 dark:text-red-400"
              : "text-xs text-muted-foreground"
          }
        >
          {titleHasPlaceholder
            ? `El título es igual para todos: sacá ${CREDIT_GIFT_NAME_PLACEHOLDER} y usalo en el mensaje.`
            : "Es igual para todos. Lo ven en el correo y en la billetera."}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="credit-gift-message" className="text-sm font-medium">
            Mensaje para el participante
          </label>
          <CreditGiftLengthCounter
            length={message.length}
            max={CREDIT_GIFT_MESSAGE_MAX_LENGTH}
          />
        </div>
        <Textarea
          id="credit-gift-message"
          ref={messageRef}
          value={message}
          maxLength={CREDIT_GIFT_MESSAGE_MAX_LENGTH}
          onChange={(event) => onMessageChange(event.target.value)}
          disabled={disabled}
          rows={4}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="font-mono"
            onClick={insertName}
            disabled={
              disabled ||
              message.length + CREDIT_GIFT_NAME_PLACEHOLDER.length >
                CREDIT_GIFT_MESSAGE_MAX_LENGTH
            }
          >
            {CREDIT_GIFT_NAME_PLACEHOLDER}
          </Button>
          <p className="text-xs text-muted-foreground">
            Se reemplaza por el nombre de cada participante. Texto simple, sin
            formato.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <label
            htmlFor="credit-gift-internal-note"
            className="text-sm font-medium"
          >
            Nota interna
          </label>
          <CreditGiftLengthCounter
            length={internalNote.length}
            max={CREDIT_GIFT_INTERNAL_NOTE_MAX_LENGTH}
          />
        </div>
        <Textarea
          id="credit-gift-internal-note"
          value={internalNote}
          maxLength={CREDIT_GIFT_INTERNAL_NOTE_MAX_LENGTH}
          onChange={(event) => onInternalNoteChange(event.target.value)}
          placeholder="Ej: cortesía para el sector B por el cambio de ubicación."
          disabled={disabled}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Obligatoria. Solo la ve el equipo; el participante nunca.
        </p>
      </div>
    </div>
  );
}
