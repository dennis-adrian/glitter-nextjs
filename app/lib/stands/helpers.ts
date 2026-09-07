import { StandBase } from "@/app/api/stands/definitions";
import { standMatchesParticipant } from "@/app/lib/reservations/policy";

export type StandLabelParts = Pick<StandBase, "label" | "standNumber">;

export function formatStandLabel(stand: StandLabelParts): string {
  return `${stand.label ?? ""}${stand.standNumber}`;
}

type ReservableStand = {
  status?: string;
  effectiveStatus?: string;
  standCategory: string;
  participationType: string;
  eligibleSubcategoryIds?: readonly number[];
  standSubcategories?: Array<{ subcategoryId: number }>;
};

type ReservableProfile = {
  category: string | null | undefined;
  participationType: string | null | undefined;
};

export function canStandBeReserved(
  stand: ReservableStand,
  profile?: ReservableProfile | null,
  subcategoryIds: number[] = [],
) {
  if (!profile) return false;

  const status = stand.effectiveStatus ?? stand.status;
  if (status !== "available") {
    return false;
  }

  const eligibleSubcategoryIds =
    stand.eligibleSubcategoryIds ??
    stand.standSubcategories?.map((sc) => sc.subcategoryId) ??
    [];

  return standMatchesParticipant({
    standCategory: stand.standCategory,
    participationType: stand.participationType,
    eligibleSubcategoryIds,
    profileCategory: profile.category,
    profileParticipationType: profile.participationType,
    profileSubcategoryIds: subcategoryIds,
  });
}
