import Carousel from "@/app/components/landing/carousel";
import EventFeatures from "@/app/components/landing/event-features";
import NoFestivalBanner from "@/app/components/landing/no-festival-banner";
import FestivalBanner from "@/app/components/molecules/festival-banner";
import { RedirectButton } from "@/app/components/redirect-button";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import Image from "next/image";

export default async function Landing() {
	const festival = await getActiveFestival();

	// let eventRegistrationLink = "";
	// if (festival) {
	// 	eventRegistrationLink = festival.eventDayRegistration
	// 		? `/festivals/${festival.id}/event_day_registration`
	// 		: `/festivals/${festival.id}/registration`;
	// }

	return (
		<div className="container p-4 md:p-6">
			{festival ? (
				<>
					<div>
						{festival.festivalActivities.length > 0 && (
							<div className="relative w-full h-[200px] rounded-lg mb-6 md:mb-10 flex items-center justify-center">
								<Image
									src="/img/banner-caceria-de-sellos.png"
									alt="banner caceria de sellos"
									fill
									sizes="100vw"
									className="object-cover rounded-lg"
									priority
								/>
								<div className="absolute flex flex-col items-center justify-center">
									<h1 className="text-4xl lg:text-5xl mb-4 font-space-grotesk font-bold tracking-wide text-[#002B48] text-shadow-[3px_3px_0_#E3DFDB,-3px_-3px_0_#E3DFDB,3px_-3px_0_#E3DFDB,-3px_3px_0_#E3DFDB]">
										Cacería de Sellos
									</h1>
									<RedirectButton
										className="w-40 bg-transparent border-[#002B48] text-[#002B48]"
										variant="outline"
										href={`/festivals/${festival.id}?tab=activities`}
									>
										Ver detalles
									</RedirectButton>
								</div>
							</div>
						)}
					</div>
					<FestivalBanner festival={festival} />
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
				</>
			) : (
				<NoFestivalBanner />
			)}
		</div>
	);
}
