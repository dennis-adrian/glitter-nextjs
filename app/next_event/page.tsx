import { Metadata } from "next";

import { currentUser } from "@clerk/nextjs";

import { CalendarIcon, ClockIcon, LocateIcon } from "lucide-react";
import Image from "next/image";

import { fetchActiveFestival } from "@/app/api/festivals/actions";
import { fetchStandsByFestivalId } from "@/app/api/stands/actions";
import { fetchUserProfile } from "@/app/api/users/actions";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import NextFestival from "@/app/components/next_event/next-festival";
import { Participants } from "@/app/components/next_event/participants/grid";
import { Badge } from "@/app/components/ui/badge";
import { getFestivalDateLabel } from "@/app/helpers/next_event";

export const metadata: Metadata = {
  title: "Próximo Evento",
  description: "Participa en el próximo evento de Festival Glitter",
};

export default async function Page() {
  const festival = await fetchActiveFestival({ acceptedUsersOnly: true });
  const user = await currentUser();

  let profile = null;
  if (user) {
    const data = await fetchUserProfile(user.id);
    profile = data?.user;
  }

  if (!festival) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-center text-2xl font-bold text-gray-500">
          No festival found.
        </p>
      </div>
    );
  }

  const inFestival = isProfileInFestival(festival.id, profile);
  const stands = await fetchStandsByFestivalId(festival.id);
  const confirmedReservations = festival.standReservations.filter(
    (reservation) => reservation.status === "accepted",
  );

  return (
    <div className="w-full">
      <section className="m-auto w-full max-w-screen-xl py-6 sm:py-12">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
            <div className="flex flex-col justify-center space-y-4">
              <div>
                <Badge
                  className="mb-1 font-normal sm:mb-2 sm:text-base"
                  variant="secondary"
                >
                  Siguiente evento
                </Badge>
                <div>
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                    {festival.name}
                  </h1>
                  <p className="text-muted-foreground max-w-[600px] md:text-xl dark:text-gray-400">
                    {festival.description}
                  </p>
                </div>
              </div>
              <div className="grid gap-2 py-4">
                <div>
                  <CalendarIcon className="mr-2 inline-block h-4 w-4" />
                  Fecha: {getFestivalDateLabel(festival)}
                </div>
                <div>
                  <ClockIcon className="mr-2 inline-block h-4 w-4" />
                  Hora: 10:00 AM a 7:00 PM
                </div>
                <div>
                  <LocateIcon className="mr-2 inline-block h-4 w-4" />
                  Ubicación: {festival.locationLabel}
                </div>
              </div>
            </div>
            <Image
              alt="expositor en el evento"
              className="mx-auto max-h-[372px] max-w-[236px] overflow-hidden object-bottom sm:w-full lg:order-last"
              height={422}
              src="/img/mascot_stand.png"
              width={286}
            />
          </div>
        </div>
      </section>
      <section className="w-full bg-gray-100 py-12">
        <div className="m-auto max-w-screen-xl">
          <div className="flex w-full flex-col items-center justify-center px-4 md:px-6">
            <div className="w-full text-left">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                Mapa del Evento
              </h2>
              <p className="max-w-[600px] text-gray-500 md:text-xl dark:text-gray-400">
                {inFestival
                  ? "Elige tu ubicación en el mapa para reservar tu espacio o explora los participantes"
                  : "Explora el mapa para ver los artistas que estarán presentes."}
              </p>
            </div>
            <div className="mt-8">
              <NextFestival profile={profile} stands={stands} />
            </div>
          </div>
        </div>
      </section>
      {confirmedReservations.length > 0 && (
        <section className="m-auto max-w-screen-xl py-12">
          <div className="container px-4 md:px-6">
            <div className="mb-4 w-full text-left">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                Participantes
              </h2>
            </div>
            <Participants festivalId={festival.id} />
          </div>
        </section>
      )}
    </div>
  );
}
