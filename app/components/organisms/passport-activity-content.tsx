import { BaseProfile } from "@/app/api/users/definitions";
import EnrollRedirectButton from "@/app/components/festivals/festival_activities/enroll-redirect-button";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/data/festivals/definitions";
import Image from "next/image";

type PassportActivityContentProps = {
	currentProfile: BaseProfile;
	forProfile: BaseProfile;
	activity: FestivalActivityWithDetailsAndParticipants;
};

export default function PassportActivityContent({
	activity,
	currentProfile,
	forProfile,
}: PassportActivityContentProps) {
	return (
		<div className="flex flex-col gap-4">
			<h1 className="text-2xl font-bold">{activity.name}</h1>
			<p>
				El Pasaporte Glitter es una actividad en la cual incentivaremos al
				público asistente del evento a visitar distintos stands y coleccionar
				sellos.
			</p>

			{activity.promotionalArtUrl && (
				<div className="flex flex-col gap-0 w-full items-center">
					<h3 className="font-semibold text-muted-foreground text-center">
						Arte promocional
					</h3>
					<Image
						src={activity.promotionalArtUrl}
						alt="arte promocional de la actividad"
						width={320}
						height={400}
						placeholder="blur"
						blurDataURL="/img/placeholders/placeholder-300x300.png"
					/>
				</div>
			)}
			<div className="flex flex-col gap-3">
				<h2 className="text-lg font-bold">¿En qué consiste la actividad?</h2>
				<p>
					Los visitantes podrán comprar en la entrada un pasaporte con diseño
					único de esta edición del festival para coleccionar sellos. Ellos
					buscarán en el sitio web a los expositores que cuenten con sellos para
					pasar por sus stands. Los visitantes que consigan 60 sellos podrán
					reclamar un pin edicion especial.
				</p>
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
						deberán tener consigo sin excepción ambos días del festival.
					</li>
					<li>
						Subir el diseño del sello al sitio web para ayudar con el control a
						quienes completen la actividad.
					</li>
				</ol>
			</div>
			<div className="bg-amber-50 border border-amber-100 rounded-md p-4 mt-4 text-amber-800">
				<p className="text-sm">
					Una vez inscrito a la actividad, el participantes se compromete a
					cumplir con todas estas condiciones. En caso de incumplimiento, el
					ilustrador podría perder el derecho a participar en futuros eventos
					y/o actividades.
				</p>
			</div>
			<EnrollRedirectButton
				currentProfile={currentProfile}
				forProfileId={forProfile.id}
				festivalId={activity.festivalId}
				activity={activity}
			/>
		</div>
	);
}
