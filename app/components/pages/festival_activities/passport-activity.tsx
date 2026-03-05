import Image from "next/image";

import { DateTime } from "luxon";

import { BaseProfile } from "@/app/api/users/definitions";
import Heading from "@/app/components/atoms/heading";
import EnrollRedirectButton from "@/app/components/festivals/festival_activities/enroll-redirect-button";
import {
	FestivalActivityWithDetailsAndParticipants,
	FestivalBase,
} from "@/app/lib/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";

type PassportActivityPageProps = {
	currentProfile: BaseProfile;
	forProfile: BaseProfile;
	activity: FestivalActivityWithDetailsAndParticipants;
	festivalId: FestivalBase["id"];
};

export default function PassportActivityPage({
	activity,
	currentProfile,
	forProfile,
	festivalId,
}: PassportActivityPageProps) {
	const proofUploadLimitDate = activity.proofUploadLimitDate
		? formatDate(activity.proofUploadLimitDate)
		: null;

	return (
		<div className="flex flex-col gap-4">
			<Heading>{activity.name}</Heading>
			<p className="text-sm md:text-base">
				La Carrera de Sellos es una actividad en la cual incentivamos al público
				asistente del evento a visitar distintos stands y coleccionar sellos.
			</p>

			{activity.promotionalArtUrl && (
				<div className="flex flex-col gap-2 w-full items-center">
					{/* <h3 className="font-semibold text-muted-foreground text-center">
						Pasaporte
					</h3> */}
					<div className="relative w-full aspect-3/4 max-w-[500px]">
						<Image
							className="object-cover"
							src={activity.promotionalArtUrl}
							alt="arte promocional de la actividad"
							fill
							placeholder="blur"
							blurDataURL="/img/placeholders/placeholder-300x300.png"
						/>
					</div>
				</div>
			)}
			<div className="flex flex-col gap-3">
				<Heading level={2}>¿En qué consiste la actividad?</Heading>
				<p className="text-sm md:text-base">
					Los visitantes podrán comprar en el stand de Glitter un pasaporte con
					diseño único de esta edición del festival para coleccionar sellos.
					Ellos buscarán en el sitio web a los expositores que cuenten con
					sellos para pasar por sus stands. Los visitantes que consigan 50
					sellos podrán reclamar un pin edicion especial.
				</p>
				{activity.activityPrizeUrl && (
					<div className="flex flex-col gap-2 w-full items-center my-3">
						<Heading level={3}>Pin de edición especial</Heading>
						<div className="relative w-full max-w-[240px] md:max-w-[320px] aspect-square">
							<Image
								className="object-cover"
								src={activity.activityPrizeUrl}
								alt="pin de edición especial de la actividad"
								fill
								placeholder="blur"
								blurDataURL="/img/placeholders/placeholder-300x300.png"
							/>
						</div>
					</div>
				)}
				<p className="text-sm md:text-base">
					Esta actividad estará habilitada para cualquier participante en todos
					los sectores del festival siempre y cuando cumplan con las condiciones
					mencionadas a continuación:
				</p>
			</div>
			<div className="flex flex-col gap-3">
				<Heading level={2}>Condiciones para participar de la actividad</Heading>
				<ol className="ml-2 list-decimal list-inside space-y-2 text-sm md:text-base">
					<li>Tener una reserva confirmada para el festival</li>
					<li>
						Inscribirse a la actividad con el botón de inscripción que se
						encuentra al final de la página. El límite de inscripciones es de 50
						participantes.
					</li>
					<li>
						Tener un sello con un diseño original de máximo 5cm de diámetro que
						deberán tener consigo sin excepción ambos días del festival. Un
						sello de una edición pasada también es válido.
					</li>
					{proofUploadLimitDate && (
						<li>
							Subir el diseño del sello al sitio web hasta el{" "}
							<strong>
								{proofUploadLimitDate.toLocaleString({
									month: "long",
									day: "numeric",
								})}
							</strong>{" "}
							a las{" "}
							<strong>
								{proofUploadLimitDate.toLocaleString({
									hour: "numeric",
									minute: "numeric",
								})}
							</strong>
							.
						</li>
					)}
					<li>
						Tratar con respeto a todos los expositores y público asistente
						participantes de la actividad. Ante cualquier incoveniente,
						reportarlo inmediatamente a la organización del festival.
					</li>
				</ol>
			</div>
			<div>
				<p className="text-xs md:text-sm text-muted-foreground">
					* Todos los expositores del festival podrán reservar su pasaporte a
					través de la pre-venta en el sitio web o adquirirlo en el stand de
					Glitter al ingresar al festival. Sólo habrá 100 unidades disponibles.
				</p>
			</div>
			<div className="bg-amber-50 border border-amber-100 rounded-md p-4 mt-4 text-amber-800">
				<p className="text-sm md:text-base">
					Una vez inscrito a la actividad, el participante se compromete a
					cumplir con todas estas condiciones. En caso de incumplimiento, podría
					perder el derecho a participar en futuros eventos y/o actividades.
				</p>
			</div>
			<EnrollRedirectButton
				currentProfile={currentProfile}
				forProfile={forProfile}
				festivalId={festivalId}
				activity={activity}
			/>
		</div>
	);
}
