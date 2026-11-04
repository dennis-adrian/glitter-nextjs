import type { FestivalBase } from "@/app/lib/festivals/definitions";

export type FestivalBannerSource = Pick<
  FestivalBase,
  "festivalBannerUrl" | "festivalBannerMobileUrl"
>;

export type ResolvedFestivalBanner = {
  /** Shown from `md` up: the 3:1 banner, or the 3:2 one when it is the only one. */
  wideSrc: string;
  /**
   * Shown below `md` when the festival has both banners. Null means one image
   * serves every width, as before the phone banner existed.
   */
  mobileSrc: string | null;
  /** `wideSrc` is the 3:2 phone banner, the festival's only one. */
  wideIsPhoneBanner: boolean;
};

/**
 * Which banner each width shows. Phones get the 3:2 banner when there is one
 * and the 3:1 otherwise (every festival from before the phone banner); wider
 * screens get the 3:1, or the 3:2 when it is the only one, rather than
 * nothing. Null when the festival has neither.
 */
export function resolveFestivalBanner(
  festival: FestivalBannerSource,
): ResolvedFestivalBanner | null {
  // The form saves a cleared field as null, but treat "" the same way.
  const wide = festival.festivalBannerUrl || null;
  const mobile = festival.festivalBannerMobileUrl || null;

  if (!wide && !mobile) return null;
  if (!wide)
    return { wideSrc: mobile!, mobileSrc: null, wideIsPhoneBanner: true };
  if (!mobile || wide === mobile) {
    return { wideSrc: wide, mobileSrc: null, wideIsPhoneBanner: false };
  }
  return { wideSrc: wide, mobileSrc: mobile, wideIsPhoneBanner: false };
}

export function hasFestivalBanner(festival: FestivalBannerSource) {
  return resolveFestivalBanner(festival) !== null;
}
