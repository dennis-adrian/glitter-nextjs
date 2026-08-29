import {
  StandBase,
  StandWithReservationsWithParticipants,
} from "@/app/api/stands/definitions";
import { BaseProfile } from "@/app/api/users/definitions";
import { standMatchesParticipant } from "@/app/lib/reservations/policy";

export type StandLabelParts = Pick<StandBase, "label" | "standNumber">;

export function formatStandLabel(stand: StandLabelParts): string {
  return `${stand.label ?? ""}${stand.standNumber}`;
}

export function canStandBeReserved(
  stand: StandWithReservationsWithParticipants,
  profile?: BaseProfile | null,
  subcategoryIds: number[] = [],
) {
  if (!profile) return false;

  if (stand.status !== "available") {
    return false;
  }

  return standMatchesParticipant({
    standCategory: stand.standCategory,
    participationType: stand.participationType,
    eligibleSubcategoryIds: stand.standSubcategories.map(
      (sc) => sc.subcategoryId,
    ),
    profileCategory: profile.category,
    profileParticipationType: profile.participationType,
    profileSubcategoryIds: subcategoryIds,
  });
}
