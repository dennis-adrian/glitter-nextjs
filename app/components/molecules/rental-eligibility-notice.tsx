import { InfoIcon } from "lucide-react";

import { cn } from "@/app/lib/utils";

export const RENTAL_ELIGIBILITY_NOTICE =
  "El alquiler está disponible solo para participantes verificados con una reserva de stand aceptada en un festival activo.";

export default function RentalEligibilityNotice({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground",
        className,
      )}
    >
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{RENTAL_ELIGIBILITY_NOTICE}</p>
    </div>
  );
}
