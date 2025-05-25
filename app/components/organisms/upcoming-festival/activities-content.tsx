import { Card, CardContent } from "@/app/components/ui/card";

import { ScrollArea } from "@/app/components/ui/scroll-area";
import { FullFestival } from "@/app/lib/festivals/definitions";
import { RedirectButton } from "@/app/components/redirect-button";
import { BaseProfile } from "@/app/api/users/definitions";

type ActivitiesContentProps = {
	forProfile: BaseProfile;
	festival: FullFestival;
};

export default function ActivitiesContent({
	forProfile,
	festival,
}: ActivitiesContentProps) {
	const activities = festival.festivalActivities;

	if (activities.length === 0) {
		return (
			<div className="border border-gray-200 bg-gray-50 p-4 rounded-md text-sm text-muted-foreground">
				No se encontraron actividades para este festival
			</div>
		);
	}

	return (
		<ScrollArea className="h-[300px] pr-4">
			<div>
				<h3 className="font-semibold">Actividades Exclusivas</h3>
				<p className="text-sm text-gray-500">
					Inscríbete en actividades especiales para expositores.
				</p>

				<div className="flex flex-col gap-2 md:gap-4 mt-3">
					{activities.map((activity) => (
						<Card key={activity.id}>
							<CardContent className="p-4">
								<div className="flex justify-between items-start">
									<div>
										<h4 className="font-medium leading-tight">
											{activity.name}
										</h4>
										{/* horario
										<p className="text-sm text-gray-500">
											April 16, 8AM-10AM • Main Hall
										</p> */}
										<p className="text-sm mt-2 leading-tight">
											{activity.description}
										</p>
									</div>
									<RedirectButton
										href={`/profiles/${forProfile.id}/festivals/${festival.id}/activity`}
										size="sm"
										variant="outline"
										className="border-purple-500 text-purple-500 hover:bg-purple-50 hover:text-purple-500 focus:text-purple-500"
										loadingText=""
									>
										Ver más
									</RedirectButton>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		</ScrollArea>
	);
}
