import GeneralInfoDetails from "@/app/components/festivals/general-info-details";
import Carousel from "@/app/components/landing/carousel";
import EventFeatures from "@/app/components/landing/event-features";
import NoFestivalBanner from "@/app/components/landing/no-festival-banner";
import { RedirectButton } from "@/app/components/redirect-button";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import Image from "next/image";

export default async function Landing() {
	const festival = await getActiveFestival();

	let eventRegistrationLink = "";
	if (festival) {
		eventRegistrationLink = festival.eventDayRegistration
			? `/festivals/${festival.id}/event_day_registration`
			: `/festivals/${festival.id}/registration`;
	}

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
									<h1 className="text-4xl lg:text-5xl mb-4 font-isidora font-bold italic tracking-wide text-[#002B48] text-shadow-[3px_3px_0_#E3DFDB,-3px_-3px_0_#E3DFDB,3px_-3px_0_#E3DFDB,-3px_3px_0_#E3DFDB]">
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
					<div className="flex justify-center items-center max-w-screen-lg mx-auto gap-8 lg:gap-20">
						<div className="flex flex-col items-center">
							<Image
								alt="festival logo"
								src="/img/glitter/glitter-v8-logo-760x160.png"
								height={80}
								width={380}
							/>
							<Image
								className="lg:hidden my-4"
								alt="mascota del evento"
								src={festival.mascotUrl || ""}
								height={222}
								width={282}
							/>
							<GeneralInfoDetails
								className="p-0 lg:mb-0"
								detailsClassName="flex-col items-start p-0"
								festival={festival}
								noMascot
							/>
							{festival.publicRegistration ? (
								<div className="space-x-2 my-2">
									<RedirectButton
										className="hover:bg-white"
										variant="outline"
										href={`/festivals/${festival.id}?tab=sectors`}
									>
										Ver evento
									</RedirectButton>
									<RedirectButton variant="cta" href={eventRegistrationLink}>
										Registrar asistencia
									</RedirectButton>
								</div>
							) : (
								<RedirectButton
									className="my-2 lg:my-0 w-32"
									href={`/festivals/${festival.id}?tab=sectors`}
								>
									Ver evento
								</RedirectButton>
							)}
						</div>
						<Image
							className="hidden lg:block"
							alt="mascota max el caiman"
							src={festival.mascotUrl || "/img/glitter/max-500x500.png"}
							height={394}
							width={500}
						/>
					</div>
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
