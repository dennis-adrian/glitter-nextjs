import Image from "next/image";
import { Festival } from "@/app/data/festivals/definitions";
import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar-radix";
import { Separator } from "@/components/ui/separator";
import { Palette } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";

export default function InfoTabContent({
	festival,
	reservation,
	festivalStartDate,
	festivalEndDate,
}: {
	festival: Festival;
	reservation: ReservationWithParticipantsAndUsersAndStand | undefined;
	festivalStartDate: string;
	festivalEndDate: string;
}) {
	return (
		<div className="space-y-2 md:space-y-4">
			<div className="flex items-start gap-3">
				<div className="flex flex-col gap-1 text-center items-center">
					{festival.festivalBannerUrl ? (
						<div className="relative w-28 h-32">
							<Image
								className="object-cover"
								src={festival.festivalBannerUrl}
								alt={festival.name}
								placeholder="blur"
								blurDataURL="/img/placeholders/placeholder-300x300.png"
								fill
							/>
						</div>
					) : (
						<div className="bg-purple-100 p-3 rounded-full w-fit">
							<Palette className="h-6 w-6 text-purple-500" />
						</div>
					)}
					<Link
						href={`/festivals/${festival.id}?tab=sectors`}
						className="text-sm text-purple-500 underline"
					>
						Ver mapa
					</Link>
				</div>
				{reservation && (
					<div>
						<h3 className="font-semibold text-lg">
							Espacio #{reservation.stand.label}
							{reservation.stand.standNumber}
						</h3>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							{reservation.participants.map((participant) => (
								<div
									key={participant.id}
									className="text-sm flex items-center gap-1"
								>
									<Avatar className="relative h-10 w-10">
										<AvatarImage
											className="object-cover"
											alt="avatar image"
											src={participant.user.imageUrl || ""}
										/>
										<AvatarFallback>
											{participant.user.displayName
												?.split(" ")
												.map((n) => n[0])
												.join("") || "N"}
										</AvatarFallback>
									</Avatar>
									<span>{participant.user.displayName}</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			<Separator />

			<div>
				<h3 className="text-lg font-semibold mb-2">Horarios</h3>
				<ul className="space-y-2">
					<ul className="text-sm">
						<span className="font-semibold">Día 1 - {festivalStartDate}</span>
						<li className="flex justify-between items-center ml-2">
							<span className="text-sm">Ingreso de participantes - armado</span>
							<span className="text-sm font-medium">
								{DateTime.fromJSDate(festival.festivalDates[0].startDate)
									.minus({ hours: 1 })
									.toLocaleString(DateTime.TIME_SIMPLE)}
							</span>
						</li>
						<li className="flex justify-between items-center ml-2">
							<span className="text-sm">Ingreso del público</span>
							<span className="text-sm font-medium">
								{DateTime.fromJSDate(
									festival.festivalDates[0].startDate,
								).toLocaleString(DateTime.TIME_SIMPLE)}
							</span>
						</li>
						<li className="flex justify-between items-center ml-2">
							<span className="text-sm">Cierre de puertas al público</span>
							<span className="text-sm font-medium">
								{DateTime.fromJSDate(
									festival.festivalDates[0].endDate,
								).toLocaleString(DateTime.TIME_SIMPLE)}
							</span>
						</li>
						<li className="flex justify-between items-center ml-2">
							<span className="text-sm">Cierre del recinto</span>
							<span className="text-sm font-medium">
								{DateTime.fromJSDate(festival.festivalDates[0].endDate)
									.plus({ minutes: 30 })
									.toLocaleString(DateTime.TIME_SIMPLE)}
							</span>
						</li>
					</ul>
					<ul className="text-sm">
						<span className="font-semibold">Día 2 - {festivalEndDate}</span>
						<li className="flex justify-between items-center ml-2">
							<span className="text-sm">Ingreso de participantes - armado</span>
							<span className="text-sm font-medium">
								{DateTime.fromJSDate(festival.festivalDates[0].startDate)
									.minus({ hours: 1 })
									.toLocaleString(DateTime.TIME_SIMPLE)}
							</span>
						</li>
						<li className="flex justify-between items-center ml-2">
							<span className="text-sm">Ingreso del público</span>
							<span className="text-sm font-medium">
								{DateTime.fromJSDate(
									festival.festivalDates[0].startDate,
								).toLocaleString(DateTime.TIME_SIMPLE)}
							</span>
						</li>
						<li className="flex justify-between items-center ml-2">
							<span className="text-sm">Cierre de puertas al público</span>
							<span className="text-sm font-medium">
								{DateTime.fromJSDate(
									festival.festivalDates[0].endDate,
								).toLocaleString(DateTime.TIME_SIMPLE)}
							</span>
						</li>
						<li className="flex justify-between items-center ml-2">
							<span className="text-sm">Desarmado</span>
							<span className="text-sm font-medium">
								{DateTime.fromJSDate(
									festival.festivalDates[0].endDate,
								).toLocaleString(DateTime.TIME_SIMPLE)}{" "}
								-{" "}
								{DateTime.fromJSDate(festival.festivalDates[0].endDate)
									.plus({ minutes: 45 })
									.toLocaleString(DateTime.TIME_SIMPLE)}
							</span>
						</li>
						<li className="flex justify-between items-center ml-2">
							<span className="text-sm">Cierre del recinto</span>
							<span className="text-sm font-medium">
								{DateTime.fromJSDate(festival.festivalDates[0].endDate)
									.plus({ minutes: 45 })
									.toLocaleString(DateTime.TIME_SIMPLE)}{" "}
							</span>
						</li>
					</ul>
				</ul>
			</div>
			{/*
            <Separator />

            <div>
              <h3 className="font-semibold mb-2">Your Materials</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox id="badge" checked />
                  <Label htmlFor="badge" className="text-sm">
                    Participant Badge
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="catalog" checked />
                  <Label htmlFor="catalog" className="text-sm">
                    Festival Catalog
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="signage" checked />
                  <Label htmlFor="signage" className="text-sm">
                    Stand Signage
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="wifi" checked />
                  <Label htmlFor="wifi" className="text-sm">
                    WiFi Access
                  </Label>
                </div>
              </div>
            </div> */}
		</div>
	);
}
