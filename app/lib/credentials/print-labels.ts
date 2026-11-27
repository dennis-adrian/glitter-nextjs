import { DateTime } from "luxon";

import type { HolderPrint } from "@/app/lib/credentials/calculate";
import type { PrintState } from "@/app/lib/credentials/definitions";
import { STORE_TIMEZONE } from "@/app/lib/formatters";

/** "14 nov", in La Paz. */
export function shortPrintDate(date: Date): string {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE })
    .setLocale("es")
    .toFormat("d LLL")
    .replace(".", "");
}

/** The badge text for a holder's print state (§6.2). */
export function printStateLabel(print: HolderPrint): string {
  if (print.nameChanged && print.state !== "stale") return "Cambió el nombre";
  switch (print.state) {
    case "new":
      return "Nueva";
    case "printed":
      return print.lastPrintedAt
        ? `Impresa el ${shortPrintDate(print.lastPrintedAt)}`
        : "Impresa";
    case "partial":
      return `Faltan ${print.missing}`;
    case "surplus":
      return `Sobran ${print.surplus}`;
    case "stale":
      return "Ya no corresponde";
  }
}

export const PRINT_STATE_BADGE: Record<
  PrintState,
  "amber" | "green" | "outline" | "red"
> = {
  new: "amber",
  printed: "green",
  partial: "amber",
  surplus: "outline",
  stale: "red",
};
