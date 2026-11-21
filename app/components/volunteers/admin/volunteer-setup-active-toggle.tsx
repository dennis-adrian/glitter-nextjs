"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/app/components/ui/checkbox";
import { toastActionError } from "@/app/lib/errors/action-error";
import { cn } from "@/app/lib/utils";
import {
  VOLUNTEER_ADMIN_COPY,
  type VolunteerAdminResult,
} from "@/app/lib/volunteers/admin-definitions";

/**
 * The "Activo" checkbox of a role or a shift: it saves as soon as it changes
 * and shows the new state meanwhile. With `showLabel` it reads "Activo" next
 * to it, in a 44px tap target, for the phone cards.
 */
export default function VolunteerSetupActiveToggle({
  checked,
  label,
  onToggle,
  showLabel = false,
}: {
  checked: boolean;
  /** The accessible name, e.g. "Montaje, viernes 18, activo". */
  label: string;
  onToggle: (isActive: boolean) => Promise<VolunteerAdminResult>;
  showLabel?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(checked);

  function change(next: boolean) {
    startTransition(async () => {
      setOptimistic(next);
      try {
        const result = await onToggle(next);
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch (error) {
        toastActionError(error, VOLUNTEER_ADMIN_COPY.genericError);
      }
    });
  }

  const box = (
    <Checkbox
      checked={optimistic}
      disabled={isPending}
      aria-label={label}
      onCheckedChange={(value) => change(value === true)}
    />
  );
  if (!showLabel) return box;
  return (
    <label
      className={cn(
        "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-sm font-medium",
        isPending && "cursor-wait",
      )}
    >
      {box}
      <span aria-hidden="true">Activo</span>
    </label>
  );
}
