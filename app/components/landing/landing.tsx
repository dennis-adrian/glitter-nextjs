import Carousel from "@/app/components/landing/carousel";
import EventFeatures from "@/app/components/landing/event-features";
import NoFestivalBanner from "@/app/components/landing/no-festival-banner";
import MarketingBannerCarousel from "@/app/components/marketing/marketing-banner-carousel";
import { RedirectButton } from "@/app/components/redirect-button";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import { fetchMarketingBannersForLanding } from "@/app/lib/marketing_banners/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import Image from "next/image";

export default async function Landing() {
	const [festival, profile] = await Promise.all([
		getActiveFestival(),
		getCurrentUserProfile(),
	]);
	const marketingBanners = await fetchMarketingBannersForLanding(!!profile);

	return (
		<div className="container p-4 md:p-6">
			{marketingBanners.length > 0 && (
				<div className="mb-6 w-full">
					<MarketingBannerCarousel banners={marketingBanners} />
				</div>
			)}
			{festival ? (
				<section className="text-center">
					<div className="mt-8">
						<div>
							<h1 className="text-4xl font-bold md:text-6xl text-shadow-xs shadow-primary-200">
								Nuestros festivales
							</h1>
							<p className="my-2 leading-6">
								eventos creados para brindar un espacio acogedor y seguro para
								artistas
							</p>
						</div>
						<div className="pt-4 md:pt-8">
							<Carousel />
						</div>
						<div className="py-4 md:py-14">
							<h1 className="text-4xl font-bold md:text-6xl text-shadow-xs shadow-gray-400 my-6 md:my-0">
								El mejor lugar para encontrar
							</h1>
							<EventFeatures />
						</div>
					</div>
				</section>
			) : (
				<NoFestivalBanner />
			)}
		</div>
	);
}
