"use client";

import { Calendar, MapPin } from "lucide-react";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Festival } from "@/app/data/festivals/definitions";
import { formatFullDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import { ProfileType } from "@/app/api/users/definitions";
import { ReservationWithParticipantsAndUsersAndStandAndCollaborators } from "@/app/api/reservations/definitions";
import InfoTabContent from "@/app/components/organisms/upcoming-festival/info-tab-content";
import TeamTabContent from "@/app/components/organisms/upcoming-festival/team-tab-content";
import ActivitiesContent from "@/app/components/organisms/upcoming-festival/activities-content";
import { FullFestival } from "@/app/lib/festivals/definitions";

type UpcomingFestivalCardProps = {
	festival: FullFestival;
	profile: ProfileType;
	reservation?: ReservationWithParticipantsAndUsersAndStandAndCollaborators;
};
export function UpcomingFestivalCard({
	festival,
	profile,
	reservation,
}: UpcomingFestivalCardProps) {
	const festivalStartDate = formatFullDate(
		festival?.festivalDates[0]?.startDate,
		DateTime.DATE_MED,
	);
	const festivalEndDate = formatFullDate(
		festival?.festivalDates[1]?.startDate,
		DateTime.DATE_MED,
	);

	return (
		<Card className="w-full max-w-4xl shadow-lg border-rose-100 mx-auto">
			<CardHeader className="bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-t-lg">
				<div className="flex justify-between items-start">
					<div>
						<CardTitle className="text-xl md:text-3xl font-bold">
							{festival.name}
						</CardTitle>
						<CardDescription className="text-rose-100 mt-2 text-sm md:text-base">
							{festival.description}
						</CardDescription>
					</div>
					<Badge className="hidden md:block bg-white text-rose-500 hover:bg-rose-100 px-3 py-1 text-sm">
						Participante Confirmado
					</Badge>
				</div>

				<div className="flex flex-col sm:flex-row gap-4 mt-4">
					<div className="flex items-center gap-2">
						<Calendar className="h-5 w-5 text-rose-200" />
						<span>
							{festivalStartDate} - {festivalEndDate}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<MapPin className="h-5 w-5 text-rose-200" />
						<span>{festival.locationLabel}</span>
					</div>
					{/* <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-rose-200" />
            <span>10 days remaining</span>
          </div> */}
				</div>
			</CardHeader>

			<Tabs defaultValue="info" className="w-full">
				<TabsList className="grid grid-cols-3 w-full">
					<TabsTrigger value="info">Información</TabsTrigger>
					<TabsTrigger value="activities">Actividades</TabsTrigger>
					<TabsTrigger value="team">Equipo</TabsTrigger>
				</TabsList>

				<TabsContent value="info" className="p-4">
					<InfoTabContent
						festival={festival}
						reservation={reservation}
						festivalStartDate={festivalStartDate}
						festivalEndDate={festivalEndDate}
					/>
				</TabsContent>

				<TabsContent value="activities" className="p-4">
					<ActivitiesContent forProfile={profile} festival={festival} />
				</TabsContent>

				<TabsContent value="team" className="p-4">
					{reservation ? (
						<TeamTabContent reservation={reservation} />
					) : (
						<div className="flex flex-col items-center justify-center h-full">
							<p className="text-sm text-gray-500">
								No hay personas en tu equipo para esta reserva.
							</p>
						</div>
					)}
				</TabsContent>
			</Tabs>

			{/* <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 p-4 rounded-b-lg">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
          <span className="text-sm font-medium">
            Featured Illustrator Status
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Download Schedule
          </Button>
          <Button className="bg-rose-500 hover:bg-rose-600" size="sm">
            Contact Organizers
          </Button>
        </div>
      </CardFooter> */}
		</Card>
	);
}
