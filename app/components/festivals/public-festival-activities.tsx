import { ArrowRightIcon } from "lucide-react";
import { FullFestival } from "@/app/lib/festivals/definitions";
import Title from "@/app/components/atoms/title";
import Image from "next/image";
import { RedirectButton } from "@/app/components/redirect-button";

type PublicFestivalActivitiesProps = {
	festival: FullFestival;
};

export default function PublicFestivalActivities({
	festival,
}: PublicFestivalActivitiesProps) {
	const activities = festival.festivalActivities.filter(
		(activity) => activity.accessLevel === "public",
	);

	return (
		<div className="my-4">
			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
				{activities.map((activity) => {
					return (
						<div
							key={activity.id}
							className="p-3 border border-border rounded-md flex gap-2 md:gap-4 items-start"
						>
							{activity.promotionalArtUrl && (
								<div className="relative w-full max-w-[120px] h-auto aspect-square">
									<Image
										src={activity.promotionalArtUrl}
										alt={activity.name}
										fill
										className="object-cover rounded-md"
										placeholder="blur"
										blurDataURL="/img/placeholders/placeholder-300x300.png"
									/>
								</div>
							)}
							<div className="flex flex-col w-full">
								<Title level="h4">{activity.name}</Title>
								<p className="text-sm text-muted-foreground">
									{activity.visitorsDescription}
								</p>
								<RedirectButton
									// TODO: Route should be in plural
									href={`/festivals/${festival.id}/activity/${activity.id}`}
									variant="link"
									size="sm"
									className="text-sm self-end w-fit mt-2"
								>
									Ver más
									<ArrowRightIcon className="w-4 h-4 ml-1" />
								</RedirectButton>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
