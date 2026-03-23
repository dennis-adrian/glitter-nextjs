import Image from "next/image";

import { BaseProfile } from "@/app/api/users/definitions";
import Heading from "@/app/components/atoms/heading";
import EnrollRedirectButton from "@/app/components/festivals/festival_activities/enroll-redirect-button";
import {
	FestivalActivityWithDetailsAndParticipants,
	FestivalBase,
} from "@/app/lib/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import VariantImagesDisplay from "@/app/components/pages/festival_activities/variant-images-display";

type CouponBookActivityPageProps = {
	currentProfile: BaseProfile;
	forProfile: BaseProfile;
	activity: FestivalActivityWithDetailsAndParticipants;
	festivalId: FestivalBase["id"];
};

export default function CouponBookActivityPage({
	activity,
	currentProfile,
	forProfile,
	festivalId,
}: CouponBookActivityPageProps) {
	const details = activity.details ?? [];
	const versionsCount = details.length;
	const slotsPerVersion = details.map((detail) => detail.participationLimit);
	const hasUnlimitedSlots = slotsPerVersion.some((slots) => slots === null);
	const nonNullSlots = slotsPerVersion.filter(
		(slots): slots is number => slots !== null,
	);
	const hasUniformSlotsPerVersion =
		slotsPerVersion.length > 0 &&
		((nonNullSlots.length === 0 &&
			slotsPerVersion.every((slots) => slots === null)) ||
			(nonNullSlots.length === slotsPerVersion.length &&
				nonNullSlots.every((slots) => slots === nonNullSlots[0])));
	const totalParticipants = hasUnlimitedSlots
		? null
		: nonNullSlots.reduce((sum, slots) => sum + slots, 0);

	const proofUploadLimitDate = activity.proofUploadLimitDate
		? formatDate(activity.proofUploadLimitDate)
		: null;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<Heading>{activity.name}</Heading>
				{activity.description && (
					<p className="text-sm md:text-base">{activity.description}</p>
				)}
			</div>

			{activity.promotionalArtUrl && (
				<div className="flex flex-col gap-2 w-full items-center">
					<div className="relative w-full aspect-3/4 max-w-52  md:max-w-80">
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

			<div className="flex flex-col gap-2">
				<Heading level={2}>¿En qué consiste la actividad?</Heading>
				<p className="text-sm md:text-base">
					La cuponera de descuentos es una actividad voluntaria creada para dar
					más visibilidad a las ofertas o promociones que tengan los expositores
					durante el festival.
				</p>
				<p className="text-sm md:text-base">
					La organización del festival imprimirá 1.000 cuponeras que se
					distribuirán al público asistente durante el ingreso al festival. Se
					entregarán de manera gratuita a las primeras 500 personas en llegar en
					cada día del evento.
				</p>
				<p className="text-sm md:text-base">
					{versionsCount === 1
						? "Habrá 1 versión"
						: `Habrán ${versionsCount} versiones`}{" "}
					de la cuponera y{" "}
					{hasUniformSlotsPerVersion
						? slotsPerVersion[0] === null
							? `${versionsCount === 1 ? "tendrá" : "cada una tendrá"} cupos ilimitados`
							: `${versionsCount === 1 ? "tendrá" : "cada una tendrá"} espacio para ${slotsPerVersion[0]} participantes`
						: "cada una tendrá un límite de participantes definido por versión"}
					. Se imprimirán equitativamente y se repartirán aleatoriamente al
					público. En total son 500 cuponeras de cada versión.
				</p>
				<p className="text-sm md:text-base">
					Aunque tenemos{" "}
					{versionsCount === 1 ? "1 versión" : `${versionsCount} versiones`} de
					la cuponera, la elección de la versión se hará de manera ordenada
					según el orden de inscripción, llenado primero una antes de pasar a la
					otra.
				</p>
				<div>
					<VariantImagesDisplay details={activity.details} />
					<p className="text-xs text-muted-foreground italic">
						* Las imágenes son solo ilustrativas y la versión final puede
						variar.
					</p>
				</div>
				<p className="text-sm md:text-base">
					El objetivo de la actividad no es forzar a los participantes a crear
					ofertas o promociones para el festival, si no dar más alcance a
					quienes ya lo vienen haciendo desde pasadas ediciones o están
					considerando empezar a hacerlo.
				</p>
				<p className="text-sm md:text-base">
					¡Si tenés una promoción que los visitantes tienen que conocer sí o sí,
					no podés perderte esta oportunidad!
				</p>
			</div>

			<section>
				<Heading level={4}>Recomendación</Heading>
				<p className="text-sm md:text-base">
					Para evitar abusos con tu promoción, te recomendamos recortar y
					quedarte con el cupón canjeado o marcarlo de alguna manera para que
					sea claro que ese cupón ya fue utilizado y ya no tiene validez.
				</p>
			</section>

			{proofUploadLimitDate && (
				<div className="flex flex-col gap-3">
					<Heading level={2}>
						Condiciones para participar de la actividad
					</Heading>
					<ol className="ml-2 list-decimal list-inside space-y-2 text-sm md:text-base">
						<li>Tener una reserva confirmada en el festival.</li>
						<li>
							Inscribirte usando el botón que se encuentra al final de la
							página.{" "}
							{totalParticipants === null
								? "No hay límite total de inscripciones"
								: `El límite de inscripciones es de ${totalParticipants} participantes`}
							{hasUniformSlotsPerVersion &&
								(slotsPerVersion[0] === null
									? " con cupos ilimitados por versión de cuponera"
									: slotsPerVersion[0] > 0
										? ` con ${slotsPerVersion[0]} cupos por versión de cuponera`
										: "")}
							.
						</li>
						<li>
							Cargar los detalles de tu promoción al sitio web hasta el{" "}
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
							. En caso de no cumplir con el plazo, serás removido o removida de
							la actividad y se dará lugar al primer participante en la lista de
							espera.
						</li>
						<li>
							Cumplir con la promoción con todo el público asistente que tenga
							un cupón válido y según las condiciones establecidas por el mismo
							participante.
						</li>
						<li>
							Cumplir todas las normas del evento según los términos y
							condiciones aceptados al inscribirse al festival.
						</li>
					</ol>
				</div>
			)}

			<EnrollRedirectButton
				currentProfile={currentProfile}
				forProfile={forProfile}
				festivalId={festivalId}
				activity={activity}
			/>
		</div>
	);
}
