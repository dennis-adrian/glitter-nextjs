import { Metadata } from "next";
import { z } from "zod";

import Festival from "@/app/components/festivals/festival";
import { fetchFestivalWithDatesAndSectors } from "@/app/data/festivals/actions";
import { userCategoryEnum } from "@/db/schema";
import { UserCategory } from "@/app/api/users/definitions";
import Terms from "@/app/components/festivals/terms";
import { RedirectButton } from "@/app/components/redirect-button";
import { Suspense } from "react";
import FestivalSkeleton from "@/app/components/festivals/festival-skeleton";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";
import FestivalPageTabs from "@/app/components/festivals/main-page-tabs";
import GeneralInfo from "@/app/components/festivals/general-info";
import FestivalSectors from "@/app/components/festivals/sectors/festival-sectors";

export const metadata: Metadata = {
  title: "Información del Festival",
  description: "Festival Glitter",
};

const searchParamsSchema = z.object({
  category: z.enum(userCategoryEnum.enumValues).optional(),
  terms: z.coerce.boolean().optional(),
  tab: z.enum(["general", "sectors"]).default("general"),
});

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    terms: string;
    category: string;
    tab: string;
  };
}) {
  const profile = await getCurrentUserProfile();
  const festival = await fetchFestivalWithDatesAndSectors(parseInt(params.id));
  if (!festival) notFound();

  const validatedSearchParams = searchParamsSchema.safeParse(searchParams);
  if (!validatedSearchParams.success) notFound();

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

  return (
    <div className="container p-4 md:p-6">
      <section className="flex flex-col md:flex-row md:justify-between gap-6">
        <div>
          <div>
            <div>
              <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                {festival.name}
              </h1>
              <p className="text-muted-foreground max-w-[600px] md:text-xl dark:text-gray-400">
                {festival.description}
              </p>
            </div>
          </div>
          <FestivalPageTabs selectedTab={validatedSearchParams.data.tab} />
        </div>
      </section>
      <section>
        {validatedSearchParams.data.tab !== "sectors" ? (
          <GeneralInfo festival={festival} />
        ) : (
          <>
            <FestivalSectors festival={festival} />
            {/* TODO; Redirigir a nueva url exclusiva para reservas */}
            {/* {canViewCategories && festival.status === "active" && (
              <div className="flex w-full justify-center my-4">
                <RedirectButton
                  className="mx-auto"
                  href={`/festivals/${festival.id}?category=${profile?.category}&terms=true`}
                >
                  Reserva tu espacio
                </RedirectButton>
              </div>
            )} */}
          </>
        )}
      </section>
    </div>
  );
}
