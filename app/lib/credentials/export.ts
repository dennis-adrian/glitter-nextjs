/**
 * The credentials CSV: pure, so the export route and the batch dialog's
 * "Exportar estas N en CSV" build the same file.
 */

import { DateTime } from "luxon";

import type { CredentialHolder } from "@/app/lib/credentials/calculate";
import {
  CREDENTIAL_GROUP_LABELS,
  CREDENTIAL_RESERVATION_STATUS_LABELS,
} from "@/app/lib/credentials/definitions";
import { printStateLabel } from "@/app/lib/credentials/print-labels";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { serializeCsvRows } from "@/app/lib/orders/csv";

export const CREDENTIALS_CSV_HEADER = [
  "Grupo",
  "Nombre en la credencial",
  "Detalle",
  "Espacio",
  "Reserva",
  "Con nombre",
  "Sin nombre",
  "Impresión",
] as const;

export type CredentialsCsvRow = {
  holder: CredentialHolder;
  /** Override the counts, e.g. what a batch sends rather than the entitlement. */
  named?: number;
  unnamed?: number;
};

/**
 * One line per holder, in the order given (the page's). Holders no longer
 * owed anything ("Ya no corresponde") are left out: the file is what to
 * produce. Cells are neutralised against spreadsheet formulas.
 */
export function serializeCredentialsCsv(
  rows: readonly (CredentialHolder | CredentialsCsvRow)[],
): string {
  const lines = rows
    .map((row) => ("holder" in row ? row : { holder: row }))
    .filter(({ holder }) => !holder.stale)
    .map(({ holder, named, unnamed }) => [
      CREDENTIAL_GROUP_LABELS[holder.group],
      holder.name,
      holder.note ?? "",
      holder.standLabel ?? "",
      holder.reservationStatus
        ? CREDENTIAL_RESERVATION_STATUS_LABELS[holder.reservationStatus]
        : "",
      named ?? holder.named,
      unnamed ?? holder.unnamed,
      holder.print ? printStateLabel(holder.print) : "",
    ]);
  return serializeCsvRows([CREDENTIALS_CSV_HEADER, ...lines]);
}

/** `credenciales-<slug|id>-<yyyy-MM-dd>.csv`, the date in La Paz. */
export function credentialsExportFilename(
  festival: { id: number; name: string },
  today: Date = new Date(),
): string {
  const slug = festival.name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  const day = DateTime.fromJSDate(today, { zone: STORE_TIMEZONE }).toISODate();
  return `credenciales-${slug || festival.id}-${day}.csv`;
}
