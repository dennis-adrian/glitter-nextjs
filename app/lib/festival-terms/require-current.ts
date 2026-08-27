import { getPublishedFestivalTermsForPage } from "@/app/lib/festival-terms/actions";
import { needsFestivalTermsReacceptance } from "@/app/lib/festival-terms/acceptance";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import type { ProfileType } from "@/app/api/users/definitions";

export async function profileNeedsTermsReacceptance(
  festival: Pick<FestivalBase, "id" | "status">,
  profile: ProfileType | null | undefined,
) {
  const published = await getPublishedFestivalTermsForPage();
  return needsFestivalTermsReacceptance(
    festival,
    profile,
    published?.id ?? null,
  );
}
