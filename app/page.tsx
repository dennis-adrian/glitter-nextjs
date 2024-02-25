import Image from "next/image";

import { londrinaSolid, junegull } from "@/ui/fonts";

import bg_image from "../public/img/bg_w_1280.png";
import { currentUser } from "@clerk/nextjs";
import { fetchActiveFestival } from "@/app/api/festivals/actions";
import LandingRedirectButton from "@/app/components/landing/redirect-button";
import { FestivalInfo } from "@/app/components/landing/festival-info-card";
import Carousel from "@/app/components/landing/carousel";
import EventFeatures from "@/app/components/landing/event-features";

export default async function Home() {
  const user = await currentUser();
  const festival = await fetchActiveFestival({ acceptedUsersOnly: true });

  return (
    <div className="m-auto max-w-[1400px] text-center text-lg md:text-2xl">
      <section className="py-0 md:px-6">
        <div className="relative flex flex-col p-6 md:p-10 lg:p-20">
          <div className="-z-10">
            <Image
              className="md:rounded-2xl"
              alt="background image"
              src={bg_image}
              placeholder="blur"
              quality={100}
              fill
              style={{
                objectFit: "cover",
              }}
            />
          </div>
          <div className="text-glitter-blue-950 flex flex-col md:flex-row md:justify-between md:gap-16">
            <div className="flex flex-col sm:p-6 md:gap-8 md:text-left md:backdrop-blur-sm">
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
              <div className="bg-card/50 hidden rounded-lg p-6 backdrop-blur-sm md:block">
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
                className="hidden md:flex"
                userId={user?.id}
              />
            </div>
            <Image
              className="m-auto"
              src="/img/mascot.png"
              alt="Mascota Glitter"
              width={300}
              height={300}
            />
          </div>
        </div>
      </section>
      <section className="bg-gradient-to-br from-primary-100 to-accent-50 px-3 py-8 md:py-14 md:hidden md:px-6">
        <div className="text-4xl font-semibold">Próximo Evento</div>
        <div className="mt-4 text-lg">
          <p>
            No te quedes fuera y participa de{" "}
            {festival ? (
              <span className="whitespace-nowrap">
                <strong>{festival.name}</strong>
              </span>
            ) : (
              "nuestro próximo evento"
            )}
          </p>
        </div>
        {festival && <FestivalInfo festival={festival} />}
        <LandingRedirectButton className="md:hidden" userId={user?.id} />
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
      <section className="px-3 pt-8 md:pt-14 md:px-6">
        <h1 className="text-4xl font-bold md:text-6xl">
          El mejor lugar para encontrar
        </h1>
        <EventFeatures />
      </section>
    </div>
  );
}
