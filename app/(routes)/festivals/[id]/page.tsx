import { currentUser } from "@clerk/nextjs";
import { Metadata } from "next";
import { z } from "zod";

import { fetchUserProfile } from "@/app/api/users/actions";
import Festival from "@/app/components/festivals/festival";
import { fetchBaseFestival } from "@/app/data/festivals/actions";
import { userCategoryEnum } from "@/db/schema";
import { UserCategory } from "@/app/api/users/definitions";
import Terms from "@/app/components/festivals/terms";
import { Badge } from "@/app/components/ui/badge";
import { CalendarIcon, ClockIcon, LocateIcon } from "lucide-react";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import Image from "next/image";
import { imagesSrc } from "@/app/lib/maps/config";
import { RedirectButton } from "@/app/components/redirect-button";
import { Suspense } from "react";
import FestivalSkeleton from "@/app/components/festivals/festival-skeleton";
import { formatDateToTimezone } from "@/app/lib/formatters";

export const metadata: Metadata = {
  title: "Información del Festival",
  description: "Festival Glitter",
};

const searchParamsSchema = z.object({
  category: z.enum(userCategoryEnum.enumValues).optional(),
  terms: z.coerce.boolean().optional(),
});

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    terms: string;
    category: string;
  };
}) {
  const user = await currentUser();
  let profile = null;

  if (user) {
    profile = await fetchUserProfile(user.id);
  }

  const festival = await fetchBaseFestival(parseInt(params.id));
  if (!festival) {
    return (
      <div className="p-20">
        <p className="text-center text-2xl font-bold text-gray-500">
          No se encontraron datos
        </p>
      </div>
    );
  }

  const validatedSearchParams = searchParamsSchema.safeParse(searchParams);
  const canViewCategories: boolean = !profile
    ? false
    : profile.verified || profile.role === "admin";

  if (
    canViewCategories &&
    validatedSearchParams.success &&
    (validatedSearchParams.data.category === profile?.category ||
      profile?.role === "admin")
  ) {
    if (validatedSearchParams.data.terms) {
      return (
        <Terms
          profile={profile!}
          festival={festival}
          category={
            validatedSearchParams.data.category as Exclude<UserCategory, "none">
          }
        />
      );
    } else if (validatedSearchParams.data.category) {
      return (
        <Festival
          profile={profile!}
          festival={festival}
          category={
            validatedSearchParams.data.category as Exclude<UserCategory, "none">
          }
        />
      );
    }
  }

  const mascotSrcSm = imagesSrc[festival.mapsVersion]["mascot"]?.sm;
  const mascotSrcMd = imagesSrc[festival.mapsVersion]["mascot"]?.md;
  const generalMapSm = imagesSrc[festival.mapsVersion]["general"]?.sm;
  const generalMapMd = imagesSrc[festival.mapsVersion]["general"]?.md;

  return (
    <div className="container p-4 md:p-6">
      <section className="flex flex-col md:flex-row md:justify-between gap-6">
        <div>
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
              Hora: {formatDateToTimezone(festival.startDate).getHours()}hrs a{" "}
              {formatDateToTimezone(festival.endDate).getHours()}hrs
            </div>
            <div>
              <LocateIcon className="mr-2 inline-block h-4 w-4" />
              Ubicación: {festival.locationLabel} - {festival.address}
            </div>
          </div>
        </div>
        {mascotSrcSm && mascotSrcMd && (
          <>
            <Image
              className="mx-auto md:mx-0"
              alt="mascota del evento"
              height={240}
              src={mascotSrcSm}
              width={240}
            />
          </>
        )}
      </section>
      <section>
        <h2 className="font-semibold text-2xl my-4">Mapas del evento</h2>
        {generalMapSm && generalMapMd && (
          <>
            <h3 className="font-semibold text-xl my-2">
              Distribución general del evento
            </h3>
            <Image
              className="md:hidden mx-auto"
              alt="mapa el evento"
              height={545}
              src={generalMapSm}
              width={429}
            />
            <Image
              className="hidden md:block mx-auto"
              alt="mapa del evento"
              height={1091}
              src={generalMapMd}
              width={858}
            />
          </>
        )}
        <Suspense fallback={<FestivalSkeleton />}>
          <Festival
            isGeneralView
            profile={profile!}
            festival={festival}
            category="illustration"
          />
        </Suspense>
        <Suspense fallback={<FestivalSkeleton />}>
          <Festival
            isGeneralView
            profile={profile!}
            festival={festival}
            category="entrepreneurship"
          />
        </Suspense>
        <Suspense fallback={<FestivalSkeleton />}>
          <Festival
            isGeneralView
            profile={profile!}
            festival={festival}
            category="gastronomy"
          />
        </Suspense>
        {canViewCategories && festival.status === "active" && (
          <div className="flex w-full justify-center my-4">
            <RedirectButton
              className="mx-auto"
              href={`/festivals/${festival.id}?category=${profile?.category}&terms=true`}
            >
              Reserva tu espacio
            </RedirectButton>
          </div>
        )}
      </section>
      {/* {confirmedReservations.length > 0 && (
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
      )} */}
    </div>
  );
}
