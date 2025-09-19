import { BaseProfile } from "@/app/api/users/definitions";
import EnrollRedirectButton from "@/app/components/festivals/festival_activities/enroll-redirect-button";
import {
	FestivalActivityWithDetailsAndParticipants,
	FestivalBase,
} from "@/app/lib/festivals/definitions";
import Image from "next/image";

type PassportActivityContentProps = {
	currentProfile: BaseProfile;
	forProfile: BaseProfile;
	activity: FestivalActivityWithDetailsAndParticipants;
	festival: FestivalBase;
};

export default function PassportActivityContent({
	activity,
	currentProfile,
	forProfile,
	festival,
}: PassportActivityContentProps) {
	return (
		<div className="flex flex-col gap-4">
			<h1 className="text-2xl font-bold">{activity.name}</h1>
			<p>
				La Carrera de Sellos es una actividad en la cual incentivamos al público
				asistente del evento a visitar distintos stands y coleccionar sellos.
			</p>

			{activity.promotionalArtUrl && (
				<div className="flex flex-col gap-2 w-full items-center">
					<h3 className="font-semibold text-muted-foreground text-center">
						Pasaporte
					</h3>
					<div className="relative w-full max-w-[500px] h-[320px]">
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
				<h2 className="text-lg font-bold">¿En qué consiste la actividad?</h2>
				<p>
					Los visitantes podrán comprar en el stand de Glitter un pasaporte con
					diseño único de esta edición del festival para coleccionar sellos.
					Ellos buscarán en el sitio web a los expositores que cuenten con
					sellos para pasar por sus stands. Los visitantes que consigan 60
					sellos podrán reclamar un pin edicion especial.
				</p>
				{activity.activityPrizeUrl && (
					<div className="flex flex-col gap-2 w-full items-center my-3">
						<h3 className="font-semibold text-muted-foreground text-center">
							Pin de edición especial
						</h3>
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
				<p>
					Esta actividad estará habilitada para cualquier participante en todos
					los sectores del festival siempre y cuando cumplan con las condiciones
					mencionadas a continuación:
				</p>
			</div>
			<div className="flex flex-col gap-3">
				<h2 className="text-lg font-bold">
					Condiciones para participar de la actividad
				</h2>
				<ol className="ml-2 list-decimal list-inside">
					<li>Tener una reserva confirmada para el festival</li>
					<li>
						Inscribirse a la actividad con el botón de inscripción que se
						encuentra al final de la página. El límite de inscripciones es de 60
						participantes.
					</li>
					<li>
						Tener un sello con un diseño original de máximo 5cm de diámetro que
						deberán tener consigo sin excepción ambos días del festival. Un
						sello de una edición pasada también es válido.
					</li>
					<li>
						Subir el diseño del sello al sitio web hasta el 3 de junio, 2025
						para ayudar con el control a quienes completen la actividad.
					</li>
				</ol>
			</div>
			<div className="bg-amber-50 border border-amber-100 rounded-md p-4 mt-4 text-amber-800">
				<p className="text-sm">
					Una vez inscrito a la actividad, el participante se compromete a
					cumplir con todas estas condiciones. En caso de incumplimiento, podría
					perder el derecho a participar en futuros eventos y/o actividades.
				</p>
			</div>
			<EnrollRedirectButton
				currentProfile={currentProfile}
				forProfile={forProfile}
				festival={festival}
				activity={activity}
			/>
		</div>
	);
}
