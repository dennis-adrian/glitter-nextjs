import {
  formatPrice,
  getCategoryLabel,
  type StandCategory,
} from "@/app/components/maps/admin/stand-manage/shared";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import type { StandChangeOption } from "@/app/lib/reservations/stand-change-queries";

export type StandChangeChoice = {
  standId: number;
  label: string;
  /** Null when the stand can be picked. */
  disabledReason: string | null;
  /** Set when picking this stand would move two reservations, not one. */
  exchangeWith: string | null;
  price: number;
};

/**
 * What the picker shows for one stand, and why it cannot be picked.
 *
 * Occupied stands stay selectable on purpose: choosing one is how an admin
 * reaches the exchange, and filtering them out would make the exchange
 * undiscoverable. Only the things no decision can fix are disabled — and they
 * are disabled with their reason rather than hidden, so a stand missing from
 * the list never reads as the feature being broken.
 */
export function toStandChangeChoice(
  option: StandChangeOption,
  currentStandId: number,
): StandChangeChoice {
  const name = formatStandLabel(option);
  // Category and price go through the admin stand vocabulary rather than being
  // interpolated raw: `stand_category` is a database enum in English, and
  // dropping it into a Spanish sentence leaves "gastronomy" sitting in the
  // middle of one.
  const label = `${name} — ${option.sectorName} · ${getCategoryLabel(
    option.standCategory as StandCategory,
  )} · ${formatPrice(option.individualPrice)}`;

  if (option.standId === currentStandId) {
    return {
      standId: option.standId,
      label,
      disabledReason: "La reserva ya ocupa este espacio",
      exchangeWith: null,
      price: option.individualPrice,
    };
  }
  if (option.heldNow) {
    return {
      standId: option.standId,
      label,
      disabledReason: "Alguien lo está reservando en este momento",
      exchangeWith: null,
      price: option.individualPrice,
    };
  }
  if (option.occupant?.isFullTable) {
    return {
      standId: option.standId,
      label,
      disabledReason:
        "Lo ocupa una mesa completa, que no se puede intercambiar",
      exchangeWith: null,
      price: option.individualPrice,
    };
  }

  return {
    standId: option.standId,
    label,
    disabledReason: null,
    exchangeWith: option.occupant?.displayName ?? null,
    price: option.individualPrice,
  };
}

export function toStandChangeChoices(
  options: readonly StandChangeOption[],
  currentStandId: number,
): StandChangeChoice[] {
  return options.map((option) => toStandChangeChoice(option, currentStandId));
}

/**
 * Why this reservation cannot be moved at all, if it cannot.
 *
 * Returned as a reason rather than a boolean so the control can stay on the
 * page and say what is wrong. A vanished control reads as a missing feature.
 */
export function standChangeDisabledReason(input: {
  isGlobalAdmin: boolean;
  liveMemberCount: number;
  reservationStatus: string;
}): string | null {
  if (!input.isGlobalAdmin) {
    return "Solo un administrador general puede mover una reserva.";
  }
  if (
    input.reservationStatus !== "pending" &&
    input.reservationStatus !== "verification_payment" &&
    input.reservationStatus !== "accepted"
  ) {
    return "Esta reserva ya no ocupa un espacio.";
  }
  if (input.liveMemberCount !== 1) {
    return "Una mesa completa no se puede mover. Reducila a media mesa primero.";
  }
  return null;
}
