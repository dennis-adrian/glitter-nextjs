import LandingV4 from "@/app/components/landing/landing-v4";
import type { LandingPageContentV1 } from "@/app/lib/landing_content/definitions";
import { getPublishedLandingContent } from "@/app/lib/landing_content/data";
import { resolveLandingFestivals } from "@/app/lib/landing_content/resolve";
import { fetchMarketingBannersForLanding } from "@/app/lib/marketing_banners/actions";

export default async function Landing({
  content,
  preview = false,
}: {
  content?: LandingPageContentV1;
  preview?: boolean;
}) {
  const landingContent = content ?? (await getPublishedLandingContent());
  const [resolved, marketingBanners] = await Promise.all([
    resolveLandingFestivals(landingContent, preview),
    fetchMarketingBannersForLanding(false),
  ]);

  return (
    <LandingV4
      content={landingContent}
      marketingBanners={marketingBanners}
      spotlight={resolved.spotlight}
      family={resolved.family}
      preview={preview}
    />
  );
}
