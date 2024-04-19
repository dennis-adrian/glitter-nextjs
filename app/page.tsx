import Image from "next/image";

import { junegull } from "@/ui/fonts";

import { currentUser } from "@clerk/nextjs";
import { fetchActiveFestival } from "@/app/data/festivals/actions";
import LandingRedirectButton from "@/app/components/landing/redirect-button";
import { FestivalInfo } from "@/app/components/landing/festival-info-card";
import Carousel from "@/app/components/landing/carousel";
import EventFeatures from "@/app/components/landing/event-features";
import LandingBanner from "@/app/components/landing/banner";

export default async function Home() {
  const user = await currentUser();
  const festival = await fetchActiveFestival({ acceptedUsersOnly: true });

  return (
    <div className="text-center text-lg md:text-2xl">
      <section>
        <div className="relative mx-auto flex flex-col py-4 md:py-10">
          <LandingBanner />
          <div className="flex flex-wrap mx-auto justify-center md:justify-between max-w-[420px] sm:max-w-full sm:w-full md:px-4 gap-4">
            <div className="flex flex-col mx-auto md:text-left gap-5 md:gap-8 lg:gap-16">
              <div className="m-auto mt-2">
                <span className={junegull.className}>
                  <h1 className="text-shadow-sm md:text-shadow text-5xl md:text-4xl lg:text-5xl text-white shadow-blue-950">
                    ¡Brillemos juntos!
                  </h1>
                </span>
              </div>
              <div className="md:flex md:flex-col md:gap-2 md:items-center hidden">
                <div className="text-white">
                  <div className="text-xl md:text-3xl font-semibold">
                    Próximo Evento
                  </div>
                  {festival && (
                    <FestivalInfo
                      className="text-base max-w-sm py-2 md:py-4"
                      festival={festival}
                    />
                  )}
                </div>
                <LandingRedirectButton
                  className="w-[320px]"
                  festivalId={festival?.id}
                />
              </div>
            </div>
            <Image
              className="mx-auto hidden xl:block"
              src="/img/mascot-xl.png"
              alt="Mascota Glitter"
              width={617}
              height={670}
            />
            <Image
              className="mx-auto hidden lg:block"
              src="/img/mascot-lg.png"
              alt="Mascota Glitter"
              width={480}
              height={442}
            />
            <Image
              className="mx-auto lg:hidden"
              src="/img/mascot-sm.png"
              alt="Mascota Glitter"
              width={327}
              height={327}
            />
            <div className="text-white rounded-md flex flex-col gap-2 items-center w-full backdrop-blur-sm md:hidden">
              <div>
                <div className="text-3xl font-semibold my-2">
                  Próximo Evento
                </div>
                {festival && (
                  <FestivalInfo className="py-2" festival={festival} />
                )}
              </div>
              <LandingRedirectButton
                className="w-[320px]"
                festivalId={festival?.id}
              />
            </div>
          </div>
        </div>
      </section>
      <section className="px-3 pt-8 md:pt-14 md:px-6">
        <h1 className="text-4xl font-bold md:text-6xl">
          Esto es el{" "}
          <span className="from-primary to-accent whitespace-nowrap bg-gradient-to-br bg-clip-text tracking-tight text-transparent">
            Festival Glitter
          </span>
        </h1>
        <p className="my-2 leading-6">
          un evento creado para brindar un espacio acogedor y seguro para
          artistas
        </p>
        <div className="pt-4 md:pt-8">
          <Carousel />
        </div>
      </section>
      <section className="px-3 py-8 md:py-14 md:px-6">
        <h1 className="text-4xl font-bold md:text-6xl">
          El mejor lugar para encontrar
        </h1>
        <EventFeatures />
      </section>
    </div>
  );
}
