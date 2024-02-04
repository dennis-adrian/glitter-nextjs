import { ElementSize } from "@/app/api/stands/definitions";
import { ProfileType } from "@/app/api/users/definitions";

export const getStandSize = (
  imageSize: { width: number; height: number },
  proportions: { wide: number; narrow: number },
): ElementSize => ({
  wide: imageSize.width * (proportions.wide || 0.089),
  narrow: imageSize.height * (proportions.narrow || 0.059),
});

export function isProfileInFestival(
  festivalId: number,
  profile?: ProfileType | null,
) {
  if (!profile) return false;

  return profile?.userRequests?.some(
    (request) => request.festivalId === festivalId,
  );
}
