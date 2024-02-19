import Image from "next/image";

import { londrinaSolid, junegull } from "@/ui/fonts";

import bg_image from "../public/img/bg_w_1280.png";
import { currentUser } from "@clerk/nextjs";
import { fetchActiveFestival } from "@/app/api/festivals/actions";
import LandingRedirectButton from "@/app/components/landing/redirect-button";
import { FestivalInfo } from "@/app/components/landing/festival-info-card";

export default async function Home() {
  const user = await currentUser();
  const festival = await fetchActiveFestival({ acceptedUsersOnly: true });

  return (
    <div className="text-center">
      <section className="max-w-[1400px] m-auto py-0 md:px-6">
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
          <div className="flex flex-col md:flex-row text-white md:justify-between md:gap-16">
            <div className="flex flex-col md:gap-8 md:text-left sm:p-6 md:backdrop-blur-sm">
              <div>
                <div className="m-auto mt-2">
                  <span className={junegull.className}>
                    <h1 className="text-5xl text-white sm:text-7xl">
                      ¡Brillemos juntos!
                    </h1>
                  </span>
                </div>
                <p className="m-auto py-4 md:py-0 text-xl leading-6 md:text-2xl font-semibold">
                  Festival para que los artistas brillen
                </p>
              </div>
              <div className="hidden md:block">
                <div className="font-semibold text-3xl">Próximo Evento</div>
                <div className="text-xl mt-1">
                  <p>
                    No te quedes fuera y participa de{" "}
                    {festival ? (
                      <span>
                        <strong>{festival.name}</strong>
                      </span>
                    ) : (
                      "nuestro próximo evento"
                    )}
                  </p>
                </div>
                {festival && <FestivalInfo festival={festival} />}
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
      <section className="md:hidden text-secondary-foreground m-auto bg-amber-50 px-4 py-8">
        <div className="font-semibold text-3xl">Próximo Evento</div>
        <div className="text-lg mt-4">
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
      <section className="m-auto max-w-screen-md bg-white p-8 sm:mt-8">
        <h1 className={`${londrinaSolid.className} text-4xl`}>
          ¿Quiénes somos?
        </h1>
        <p className="m-auto max-w-screen-sm py-4 text-center text-xl leading-6">
          <strong>Glitter</strong> es una productora de eventos artísticos
          dedicada a proporcionar un espacio seguro y acogedor para que
          ilustradores, artistas y autores de cómics puedan mostrar y vender su
          arte
        </p>
      </section>
    </div>
  );
}
