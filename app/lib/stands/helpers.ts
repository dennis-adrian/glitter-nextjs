import {
  StandBase,
  StandWithReservationsWithParticipants,
} from "@/app/api/stands/definitions";
import { BaseProfile } from "@/app/api/users/definitions";

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

  const profileCategory =
    profile.category === "new_artist" ? "illustration" : profile.category;

  if (stand.standCategory !== profileCategory || stand.status !== "available") {
    return false;
  }

  if (stand.participationType !== profile.participationType) {
    return false;
  }

  if (stand.standSubcategories.length > 0) {
    return subcategoryIds.some((id) =>
      stand.standSubcategories.some((sc) => sc.subcategoryId === id),
    );
  }

  return true;
}
