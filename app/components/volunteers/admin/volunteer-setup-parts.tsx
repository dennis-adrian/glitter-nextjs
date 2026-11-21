import { PlusIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/app/components/ui/button";
import { CardDescription, CardHeader } from "@/app/components/ui/card";

/**
 * Pieces the setup page's "Turnos" and "Roles" cards share: the header with
 * its "Agregar …" button, the amber notice and a field's error line.
 */

export function SetupCardHeader({
  titleId,
  title,
  description,
  addLabel,
  onAdd,
  addDisabled,
}: {
  titleId: string;
  title: string;
  description: string;
  addLabel: string;
  onAdd: () => void;
  addDisabled?: boolean;
}) {
  return (
    <CardHeader className="flex-row flex-wrap items-end justify-between gap-3 space-y-0 p-4 pb-3 md:p-6 md:pb-3">
      <div className="min-w-0 flex-[1_1_20rem] space-y-1.5">
        <h2 id={titleId} className="text-lg leading-tight font-semibold">
          {title}
        </h2>
        <CardDescription className="break-words">{description}</CardDescription>
      </div>
      <Button
        type="button"
        variant="outline"
        wrap
        className="min-h-11 flex-1 basis-40 gap-2 sm:flex-none md:min-h-10"
        onClick={onAdd}
        disabled={addDisabled}
      >
        <PlusIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
        {addLabel}
      </Button>
    </CardHeader>
  );
}

/** The amber box: something to know before saving, not an error. */
export function SetupWarning({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="flex min-w-0 items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
    >
      <TriangleAlertIcon
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

export function SetupFieldError({
  id,
  message,
}: {
  id: string;
  message?: string;
}) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/** Field errors of a zod parse, by their first path segment. */
export function fieldErrors<Field extends string>(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in errors)) {
      errors[field as Field] = issue.message;
    }
  }
  return errors;
}
