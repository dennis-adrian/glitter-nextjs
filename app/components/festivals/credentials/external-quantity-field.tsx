"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Input } from "@/app/components/ui/input";
import { setExternalCredentialQuantity } from "@/app/lib/credentials/actions";
import {
  CREDENTIALS_COPY,
  EXTERNAL_CREDENTIAL_QUANTITY_MAX,
} from "@/app/lib/credentials/definitions";
import { toastActionError } from "@/app/lib/errors/action-error";
import { cn } from "@/app/lib/utils";

const format = (quantity: number | null) => (quantity == null ? "" : String(quantity));

function parse(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

type Draft = {
  value: string;
  /** The total the field takes as saved: the server's, or the one it just saved. */
  saved: number | null;
  /** The override last rendered, so a refresh that brings a new one is noticed. */
  seen: number | null;
  /** A refresh changed the saved total under an unsaved draft. */
  conflict: boolean;
  /** That draft was refused once and is still on screen, unsaved. */
  reviewing: boolean;
};

/**
 * One external participant's total for the festival. Saves on blur; an
 * empty field goes back to the per-stand default, shown as its placeholder.
 */
export default function ExternalQuantityField({
  festivalId,
  externalParticipantId,
  name,
  override,
  defaultQuantity,
}: {
  festivalId: number;
  externalParticipantId: number;
  name: string;
  /** The saved total, or null while the default applies. */
  override: number | null;
  defaultQuantity: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({
    value: format(override),
    saved: override,
    seen: override,
    conflict: false,
    reviewing: false,
  });
  const [isPending, startTransition] = useTransition();

  // Any refresh can bring a new total (this field's own save, or another
  // admin's). An untouched field follows it; a draft is kept, but saving it
  // as is would silently undo the newer total, so it is flagged for review.
  if (override !== draft.seen) {
    const typed = parse(draft.value);
    const clean = typed === draft.saved;
    setDraft({
      value: clean ? format(override) : draft.value,
      saved: override,
      seen: override,
      conflict: !clean && typed !== override,
      reviewing: clean ? false : draft.reviewing,
    });
  }
  // Marked until it is saved or dropped, so it never reads as the saved total
  // once the warning closes.
  const unsaved = draft.reviewing && parse(draft.value) !== draft.saved;

  // Resets read the draft's own `saved`, not the `override` this render
  // closed over: a refresh may land while the save is in flight.
  function resetToSaved() {
    setDraft((current) => ({
      ...current,
      value: format(current.saved),
      conflict: false,
      reviewing: false,
    }));
  }

  function commit() {
    const next = parse(draft.value);
    if (next === draft.saved) {
      if (draft.conflict || draft.reviewing) {
        setDraft((current) => ({ ...current, conflict: false, reviewing: false }));
      }
      return;
    }
    if (
      next !== null &&
      (!Number.isInteger(next) || next < 0 || next > EXTERNAL_CREDENTIAL_QUANTITY_MAX)
    ) {
      toast.error(`Escribí un número entre 0 y ${EXTERNAL_CREDENTIAL_QUANTITY_MAX}.`);
      resetToSaved();
      return;
    }
    if (draft.conflict) {
      // Refused once, so the admin sees the newer total before replacing it.
      setDraft((current) => ({ ...current, conflict: false, reviewing: true }));
      // defaultQuantity is the total over every stand, not a per-stand count.
      const change =
        draft.saved == null
          ? `${name} volvió a la cantidad por espacio (${defaultQuantity} en total)`
          : `la cantidad de ${name} cambió a ${draft.saved}`;
      toast.warning(
        `Mientras editabas, ${change}. Revisá lo que escribiste y confirmalo de nuevo si querés reemplazarla.`,
        {
          duration: 15_000,
          action: { label: `Usar ${draft.saved ?? defaultQuantity}`, onClick: resetToSaved },
        },
      );
      return;
    }
    const seenAtCommit = draft.seen;
    startTransition(async () => {
      try {
        const result = await setExternalCredentialQuantity({
          festivalId,
          externalParticipantId,
          quantity: next,
        });
        if (!result.success) {
          toast.error(result.message);
          resetToSaved();
          return;
        }
        toast.success(result.message);
        // Taken as saved before the refresh lands, so it reads as clean then.
        // Unless a newer total already arrived while saving: that one came
        // from a later server render, so it stays the saved one.
        setDraft((current) =>
          current.seen === seenAtCommit
            ? { ...current, saved: next, conflict: false, reviewing: false }
            : { ...current, conflict: parse(current.value) !== current.saved, reviewing: false },
        );
        router.refresh();
      } catch (error) {
        toastActionError(error, CREDENTIALS_COPY.genericError);
      }
    });
  }

  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={EXTERNAL_CREDENTIAL_QUANTITY_MAX}
      className={cn("w-20", unsaved && "border-amber-500 dark:border-amber-400")}
      aria-label={`Credenciales para ${name}`}
      aria-invalid={unsaved || undefined}
      placeholder={String(defaultQuantity)}
      value={draft.value}
      disabled={isPending}
      onChange={(event) => {
        const value = event.target.value;
        setDraft((current) => ({ ...current, value }));
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}
