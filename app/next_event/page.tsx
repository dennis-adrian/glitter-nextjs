import { fetchActiveFestival } from "@/app/api/festivals/actions";
import { fetchUserProfile } from "@/app/api/users/actions";
import { Badge } from "@/app/components/ui/badge";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import {
  CardTitle,
  CardHeader,
  CardContent,
  CardFooter,
  Card,
} from "@/components/ui/card";
import { currentUser } from "@clerk/nextjs";
import { CalendarIcon, ClockIcon, LocateIcon } from "lucide-react";
import Image from "next/image";

export default async function Page() {
  const { festival } = await fetchActiveFestival();
  const user = await currentUser();

  let profile = null;
  if (user) {
    const data = await fetchUserProfile(user.id);
    profile = data?.user;
  }

  if (!festival) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-2xl font-bold text-center text-gray-500">
          No festival found.
        </p>
      </div>
    );
  }

  const isProfileInFestival = profile?.userRequests?.some(
    (request) => request.festivalId === festival.id,
  );

  return (
    <div className="w-full">
      <section className="max-w-screen-xl w-full py-6 sm:py-12 m-auto">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
            <div className="flex flex-col justify-center space-y-4">
              <div>
                <Badge
                  className="sm:text-base font-normal mb-1 sm:mb-2"
                  variant="secondary"
                >
                  Siguiente evento
                </Badge>
                <div>
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                    {festival.name}
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl dark:text-gray-400">
                    Nueva edición con más sorpresas, más artitas y más
                    diversión.
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
        <div className="max-w-screen-xl m-auto">
          <div className="w-full px-4 md:px-6 flex flex-col justify-center items-center">
            <div className="text-left w-full">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                Mapa del Evento
              </h2>
              <p className="max-w-[600px] text-gray-500 md:text-xl dark:text-gray-400">
                {isProfileInFestival
                  ? "Elige tu ubicación en el mapa para reservar tu espacio."
                  : "Explora el mapa para ver los artistas que estarán presentes."}
              </p>
            </div>
            <div className="mt-8">
              <Image
                alt="imagen del evento"
                src="/img/glitter_v2_artists_map.png"
                width={770}
                height={646}
              />
            </div>
          </div>
        </div>
      </section>
      {/* <section className="w-full py-12">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-3 lg:gap-12 xl:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle>Exhibitor 1</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm/relaxed">
                  A brief description about Exhibitor 1.
                </p>
              </CardContent>
              <CardFooter>
                <img
                  alt="Logo"
                  className="aspect-[2/1] overflow-hidden rounded-lg object-contain object-center"
                  height="70"
                  src="/placeholder.svg"
                  width="140"
                />
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Exhibitor 2</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm/relaxed">
                  A brief description about Exhibitor 2.
                </p>
              </CardContent>
              <CardFooter>
                <img
                  alt="Logo"
                  className="aspect-[2/1] overflow-hidden rounded-lg object-contain object-center"
                  height="70"
                  src="/placeholder.svg"
                  width="140"
                />
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Exhibitor 3</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm/relaxed">
                  A brief description about Exhibitor 3.
                </p>
              </CardContent>
              <CardFooter>
                <img
                  alt="Logo"
                  className="aspect-[2/1] overflow-hidden rounded-lg object-contain object-center"
                  height="70"
                  src="/placeholder.svg"
                  width="140"
                />
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Exhibitor 4</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm/relaxed">
                  A brief description about Exhibitor 4.
                </p>
              </CardContent>
              <CardFooter>
                <img
                  alt="Logo"
                  className="aspect-[2/1] overflow-hidden rounded-lg object-contain object-center"
                  height="70"
                  src="/placeholder.svg"
                  width="140"
                />
              </CardFooter>
            </Card>
          </div>
        </div>
      </section> */}
    </div>
  );
}
