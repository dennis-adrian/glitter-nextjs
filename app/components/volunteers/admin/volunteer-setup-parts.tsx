import { PlusIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { CardDescription, CardHeader } from "@/app/components/ui/card";

/**
 * The header every setup card shares ("Fechas", "Turnos", "Roles"): title,
 * description and, for the two lists, an "Agregar …" button.
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
  addLabel?: string;
  onAdd?: () => void;
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
      {addLabel && onAdd && (
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
      )}
    </CardHeader>
  );
}
