import { formatPrice } from "@/app/components/maps/admin/stand-manage/shared";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import type { FullTableOption } from "@/app/lib/reservations/stand-change-queries";

export type FullTableChoice = {
  standId: number;
  label: string;
  /** Null when this half can be picked. */
  disabledReason: string | null;
  companionLabel: string | null;
  fullTablePrice: number | null;
};

/**
 * One half of a declared table, as the create form's picker sees it.
 *
 * Unpriced and malformed tables are listed with their reason rather than
 * dropped: an admin who paired two stands and forgot the price needs to see
 * that the table exists and why it cannot be assigned, not an empty list that
 * looks like the feature is broken.
 */
export function toFullTableChoice(option: FullTableOption): FullTableChoice {
  const name = formatStandLabel(option);
  const companionLabel =
    option.companionStandId != null
      ? `${option.companionLabel ?? ""}${option.companionStandNumber}`
      : null;
  const label = companionLabel
    ? `${name} + ${companionLabel} — ${option.sectorName}`
    : `${name} — ${option.sectorName}`;

  if (option.companionStandId == null) {
    return {
      standId: option.standId,
      label,
      disabledReason: "La mesa no tiene exactamente dos espacios",
      companionLabel: null,
      fullTablePrice: option.fullTablePrice,
    };
  }
  if (option.fullTablePrice == null) {
    return {
      standId: option.standId,
      label,
      disabledReason: "La mesa no tiene precio configurado",
      companionLabel,
      fullTablePrice: null,
    };
  }
  if (!option.selfAvailable || !option.companionAvailable) {
    return {
      standId: option.standId,
      label,
      disabledReason: !option.selfAvailable
        ? "Este espacio ya está ocupado"
        : "La otra mitad ya está ocupada",
      companionLabel,
      fullTablePrice: option.fullTablePrice,
    };
  }

  return {
    standId: option.standId,
    label: `${label} · ${formatPrice(option.fullTablePrice)}`,
    disabledReason: null,
    companionLabel,
    fullTablePrice: option.fullTablePrice,
  };
}

export function toFullTableChoices(
  options: readonly FullTableOption[],
): FullTableChoice[] {
  return options.map(toFullTableChoice);
}
