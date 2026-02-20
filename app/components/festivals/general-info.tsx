import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import Image from "next/image";
import Link from "next/link";

type GeneralInfoProps = {
	festival: FestivalWithDates;
};

export default function GeneralInfo({ festival }: GeneralInfoProps) {
	const isRegistrationOpen =
		festival.publicRegistration && !festival.eventDayRegistration;

	return (
		<div>
			{festival.posterUrl && (
				<div className="relative w-full max-w-lg aspect-4/5 h-auto mx-auto my-4">
					<Image
						src={festival.posterUrl}
						alt="Afiche del festival"
						fill
						className="object-contain rounded-lg"
						sizes="(max-width: 512px) 100vw, 512px"
					/>
				</div>
			)}
			{festival.status === "active" && (
				<div className="flex justify-center items-center">
					{isRegistrationOpen ? (
						<RedirectButton href={`/festivals/${festival.id}/registration`}>
							Reservar entrada
						</RedirectButton>
					) : (
						<div className="flex flex-col gap-2">
							<Button disabled>Reservar entrada</Button>
							<div className="text-muted-foreground text-sm">
								{festival.eventDayRegistration ? (
									<span>Registro habilitado en puerta</span>
								) : (
									<span>La reserva de entradas no está habilitada</span>
								)}
							</div>
						</div>
					)}
				</div>
			)}
			{festival.generalMapUrl && (
				<div className="py-4">
					<h2 className="font-semibold text-xl mt-4">Distribución General</h2>
					<span className="flex flex-wrap text-muted-foreground text-sm">
						<p className="mr-1">
							Para ver en detalle los participantes y los sectores del evento
							visita{" "}
							<Link
								className="text-primary-400 hover:underline"
								href={`/festivals/${festival.id}?tab=sectors`}
							>
								Sectores y participantes
							</Link>
						</p>
					</span>
					<div className="relative h-40 md:h-[500px] w-full mx-auto my-4">
						<Image
							className="object-contain"
							alt="mapa del evento"
							src={festival.generalMapUrl}
							fill
						/>
					</div>
				</div>
			)}
		</div>
	);
}
