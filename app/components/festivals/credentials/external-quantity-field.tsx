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
  const [value, setValue] = useState(override == null ? "" : String(override));
  const [isPending, startTransition] = useTransition();

  function commit() {
    const trimmed = value.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next === override) return;
    if (
      next !== null &&
      (!Number.isInteger(next) || next < 0 || next > EXTERNAL_CREDENTIAL_QUANTITY_MAX)
    ) {
      toast.error(`Escribí un número entre 0 y ${EXTERNAL_CREDENTIAL_QUANTITY_MAX}.`);
      setValue(override == null ? "" : String(override));
      return;
    }
    startTransition(async () => {
      try {
        const result = await setExternalCredentialQuantity({
          festivalId,
          externalParticipantId,
          quantity: next,
        });
        if (!result.success) {
          toast.error(result.message);
          setValue(override == null ? "" : String(override));
          return;
        }
        toast.success(result.message);
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
      className="w-20"
      aria-label={`Credenciales para ${name}`}
      placeholder={String(defaultQuantity)}
      value={value}
      disabled={isPending}
      onChange={(event) => setValue(event.target.value)}
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
