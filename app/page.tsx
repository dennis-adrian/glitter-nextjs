import Image from "next/image";

import { junegull } from "@/ui/fonts";

import { currentUser } from "@clerk/nextjs";
import { fetchActiveFestival } from "@/app/data/festivals/actions";
import LandingRedirectButton from "@/app/components/landing/redirect-button";
import { FestivalInfo } from "@/app/components/landing/festival-info-card";
import Carousel from "@/app/components/landing/carousel";
import EventFeatures from "@/app/components/landing/event-features";

export default async function Home() {
  const user = await currentUser();
  const festival = await fetchActiveFestival({ acceptedUsersOnly: true });

  return (
    <div className="text-center text-lg md:text-2xl">
      <section className="">
        <div className="relative max-w-[1450px] mx-auto flex flex-col py-10 px-4 md:px-0">
          <div className="-z-10">
            <Image
              className="hidden md:block rounded-md"
              alt="background image"
              src="/img/background-md.png"
              quality={100}
              fill
              style={{
                objectFit: "cover",
              }}
            />
            <Image
              className="md:hidden"
              alt="background image"
              src="/img/background-sm.png"
              quality={100}
              fill
              style={{
                objectFit: "cover",
              }}
            />
          </div>
          <div className="flex flex-wrap mx-auto">
            <div className="flex flex-col items-center mx-auto sm:p-6 md:gap-8 md:text-left gap-4">
              <div>
                <div className="m-auto mt-2">
                  <span className={junegull.className}>
                    <h1 className="text-shadow text-5xl text-white shadow-blue-950 sm:text-7xl">
                      ¡Brillemos juntos!
                    </h1>
                  </span>
                </div>
                <p className="text-shadow-sm m-auto py-4 text-xl font-semibold leading-6 shadow-white md:py-0 md:text-2xl">
                  Festival para que los artistas brillen
                </p>
              </div>
              {/* <div className="bg-card/50 hidden rounded-lg p-6 backdrop-blur-sm md:block"> */}
              <div className="text-white container mx-auto">
                <div className="text-3xl font-semibold">Próximo Evento</div>
                <div className="text-xl">
                  <p>
                    No te quedes fuera y participa de{" "}
                    {festival ? (
                      <span className="whitespace-nowrap font-semibold">
                        {festival.name}
                      </span>
                    ) : (
                      "nuestro próximo evento"
                    )}
                  </p>
                </div>
                {festival && (
                  <FestivalInfo className="p-0 pt-4" festival={festival} />
                )}
              </div>
              <LandingRedirectButton
                className="w-[320px] mt-4"
                festivalId={festival?.id}
              />
            </div>
            <Image
              className="mx-auto hidden md:block"
              src="/img/mascot-md.png"
              alt="Mascota Glitter"
              width={617}
              height={670}
            />
            <Image
              className="mx-auto md:hidden my-6"
              src="/img/mascot-sm.png"
              alt="Mascota Glitter"
              width={327}
              height={327}
            />
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
