import GeneralInfoDetails from "@/app/components/festivals/general-info-details";
import Carousel from "@/app/components/landing/carousel";
import EventFeatures from "@/app/components/landing/event-features";
import LandingRedirectButton from "@/app/components/landing/redirect-button";
import { RedirectButton } from "@/app/components/redirect-button";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import Image from "next/image";

export default async function Home() {
  const festival = await getActiveFestival();

  let eventRegistrationLink = "";
  if (festival) {
    eventRegistrationLink = festival.eventDayRegistration
      ? `/festivals/${festival.id}/event_day_registration`
      : `/festivals/${festival.id}/registration`;
  }

  return (
    <div className="container p-4 md:p-6">
      {festival && (
        <>
          <div className="relative p-4 flex flex-col items-center">
            {/* got this code for the background from nextjs image docs */}
            <Image
              className="-z-10 object-cover rounded-md brightness-50 md:hidden"
              alt="imagen de fondo"
              src="/img/twinkler/twinkler-banner-500x500.png"
              quality={100}
              fill
              sizes="100vw"
            />
            <Image
              className="-z-10 object-cover rounded-md brightness-50 hidden md:block"
              alt="imagen de fondo"
              src="/img/twinkler/twinkler-banner-1500x720.png"
              quality={100}
              fill
              sizes="100vw"
            />
            <Image
              className="mt-4"
              alt="twinkler logo"
              src="/img/twinkler/twinkler-logo-white.png"
              height={80}
              width={270}
            />
            <div className="backdrop-blur-sm bg-white/60 m-4 rounded-md px-4 md:max-w-fit">
              <GeneralInfoDetails festival={festival} noMascot />
            </div>
            {festival.publicRegistration ? (
              <div className="space-x-2 my-2">
                <RedirectButton
                  className="hover:bg-white"
                  variant="outline"
                  href={`/festivals/${festival.id}`}
                >
                  Ver evento
                </RedirectButton>
                <RedirectButton variant="cta" href={eventRegistrationLink}>
                  Registrar asistencia
                </RedirectButton>
              </div>
            ) : (
              <LandingRedirectButton
                className="w-80"
                festivalId={festival?.id}
              />
            )}
          </div>
          <section className="text-center">
            <div className="mt-8">
              <div>
                <h1 className="text-4xl font-bold md:text-6xl text-shadow-sm shadow-primary-200">
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
                <h1 className="text-4xl font-bold md:text-6xl text-shadow-sm shadow-gray-400 my-6 md:my-0">
                  El mejor lugar para encontrar
                </h1>
                <EventFeatures />
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
