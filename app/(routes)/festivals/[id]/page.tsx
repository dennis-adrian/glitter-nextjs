import { Metadata } from "next";
import { z } from "zod";

import GeneralInfo from "@/app/components/festivals/general-info";
import FestivalPageTabs from "@/app/components/festivals/main-page-tabs";
import PublicFestivalActivities from "@/app/components/festivals/public-festival-activities";
import FestivalSectors from "@/app/components/festivals/sectors/festival-sectors";
import { fetchFestival, fetchFestivals } from "@/app/data/festivals/actions";
import { notFound } from "next/navigation";
import { fetchPublicReservationsByFestivalId } from "@/app/lib/reservations/actions";

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

const SearchParamsSchema = z.object({
	tab: z.enum(["general", "sectors", "activities"]).default("general"),
});

const ParamsSchema = z.object({
	id: z.coerce.number(),
});

export default async function Page(props: {
	params: Promise<z.infer<typeof ParamsSchema>>;
	searchParams: Promise<z.infer<typeof SearchParamsSchema>>;
}) {
	const searchParams = await props.searchParams;
	const params = await props.params;

	const validatedParams = ParamsSchema.safeParse(params);
	if (!validatedParams.success) notFound();

	const validatedSearchParams = SearchParamsSchema.safeParse(searchParams);
	if (!validatedSearchParams.success) notFound();

	const festival = await fetchFestival({ id: validatedParams.data.id });
	if (!festival) notFound();

	const fetchFestivalReservationsPromise = fetchPublicReservationsByFestivalId(
		festival.id,
	);

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
				{validatedSearchParams.data.tab === "general" && (
					<GeneralInfo festival={festival} />
				)}
				{validatedSearchParams.data.tab === "sectors" && (
					<FestivalSectors festival={festival} />
				)}
				{validatedSearchParams.data.tab === "activities" && (
					<PublicFestivalActivities
						festival={festival}
						fetchFestivalReservationsPromise={fetchFestivalReservationsPromise}
					/>
				)}
			</section>
		</div>
	);
}
