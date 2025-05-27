import { Metadata } from "next";
import { z } from "zod";
import { userCategoryEnum } from "@/db/schema";
import { notFound } from "next/navigation";
import FestivalPageTabs from "@/app/components/festivals/main-page-tabs";
import GeneralInfo from "@/app/components/festivals/general-info";
import FestivalSectors from "@/app/components/festivals/sectors/festival-sectors";
import { fetchFestivals, fetchFestivalWithDates } from "@/app/lib/festivals/actions";

export const metadata: Metadata = {
  title: "Información del Festival",
  description: "Productora Glitter",
};

export const dynamicParams = true;
export async function generateStaticParams() {
  const festivals = await fetchFestivals();

  return festivals.map((festival) => ({
    id: festival.id.toString(),
  }));
}

const searchParamsSchema = z.object({
  category: z.enum(userCategoryEnum.enumValues).optional(),
  terms: z.coerce.boolean().optional(),
  tab: z.enum(["general", "sectors"]).default("general"),
});

export default async function Page(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{
      terms: string;
      category: string;
      tab: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const festival = await fetchFestivalWithDates(parseInt(params.id));
  if (!festival) notFound();

  const validatedSearchParams = searchParamsSchema.safeParse(searchParams);
  if (!validatedSearchParams.success) notFound();

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
          </>
        )}
      </section>
    </div>
  );
}
