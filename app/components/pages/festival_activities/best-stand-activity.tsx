import { BaseProfile } from "@/app/api/users/definitions";
import DateSpan from "@/app/components/atoms/date-span";
import Heading from "@/app/components/atoms/heading";
import EnrollBestStandForm from "@/app/components/festivals/festival_activities/enroll-best-stand-form";
import { isActivityInVotingWindow } from "@/app/components/participant_dashboard/activity-card/utils";
import { Button } from "@/app/components/ui/button";
import { fetchFestivalParticipants } from "@/app/lib/festivals/actions";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { VoteIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import BestStandDisclaimer from "./best-stand-disclaimer";

type BestStandActivityPageProps = {
	activity: FestivalActivityWithDetailsAndParticipants;
	currentProfile: BaseProfile;
	forProfile: BaseProfile;
};

export default async function BestStandActivityPage({
	activity,
	currentProfile,
	forProfile,
}: BestStandActivityPageProps) {
	const confirmedParticipants = await fetchFestivalParticipants(
		activity.festivalId,
		true,
	);

	const activityVariantForProfile = activity.details.find(
		(detail) => detail.category === forProfile.category,
	);

	if (!activityVariantForProfile) return notFound();

	return (
		<div className="container p-2 md:p-4 space-y-4 md:space-y-5">
			<section>
				<Heading level={1}>{activity.name}</Heading>
				<p>{activity.description}</p>
			</section>
			{activity.promotionalArtUrl && (
				<section>
					<figure className="relative mx-auto mb-2 md:mb-3">
						<div className="relative w-full max-w-[425px] h-auto aspect-3/4 mx-auto">
							<Image
								className="object-cover rounded-md"
								src={activity.promotionalArtUrl}
								alt="arte promocional de la actividad"
								fill
								placeholder="blur"
								blurDataURL="/img/placeholders/placeholder-300x300.png"
							/>
						</div>
						<figcaption className="text-center text-sm text-muted-foreground italic mt-1">
							Arte promocional
						</figcaption>
					</figure>
				</section>
			)}
			<section>
				<Heading level={3}>¿En qué consiste la actividad?</Heading>
				<div className="flex flex-col gap-1 md:gap-2">
					<p>
						<em>Stand Icónico</em> es un reconocimiento especial para celebrar a
						los expositores que llenan de creatividad, encanto y personalidad
						sus espacios dentro del festival.
					</p>
					<p>
						Para reconocer esa creatividad, en esta edición del festival los
						participantes podrán votar en nuestro sitio web para elegir al stand
						que más destaque por su propuesta visual y originalidad. ¡Queremos
						invitarlos a todos a participar y votar por su stand favorito en
						cada categoría! Cuantos más se sumen, más especial será la votación.
					</p>
					<p>
						Luego de que cierre la votación, el participante que obtenga más
						votos, según su categoría, obtendrá un espacio sin costo en la
						próxima edición del festival Glitter, como una forma de celebrar su
						dedicación y el aporte que hace a la magia del festival.
					</p>
					<p>
						El reconocimiento es exclusivo para la próxima edición del{" "}
						<strong>festival Glitter</strong>, lo que lo hace aún más especial.
					</p>
					<BestStandDisclaimer />
				</div>
			</section>
			<section>
				<Heading level={3}>¿Cómo participar?</Heading>
				<div className="flex flex-col gap-1 md:gap-2">
					<p>
						Si tenés una reserva confirmada para este festival, podrás
						inscribirte a la actividad a partir del{" "}
						{activity.registrationStartDate && activity.registrationEndDate && (
							<span>
								<strong>
									<DateSpan
										date={activity.registrationStartDate}
										format={{ month: "long", day: "numeric" }}
									/>
								</strong>{" "}
								a las{" "}
								<strong>
									<DateSpan
										date={activity.registrationStartDate}
										format={{ hour: "numeric", minute: "numeric" }}
									/>
								</strong>
							</span>
						)}{" "}
						hasta el{" "}
						<strong>
							<DateSpan
								date={activity.registrationEndDate}
								format={{ month: "long", day: "numeric" }}
							/>
						</strong>{" "}
						a las{" "}
						<strong>
							<DateSpan
								date={activity.registrationEndDate}
								format={{ hour: "numeric", minute: "numeric" }}
							/>
						</strong>
						. Al inscribirte, deberás subir una imagen de tu stand para que los
						demás participantes puedan verlo y votar por ti. La imagen debe ser
						tomada el mismo día del festival, para que todos puedan ver tu stand
						en su mejor momento y apoyarte en esta edición.
					</p>

					<p>
						No hay un límite de inscripciones. Todos los participantes pueden
						inscribirse a la actividad. Habrá una votación por cada categoría
						para elegir al <em>Stand Icónico</em> de cada una. Pero tomá en
						cuenta que <strong>la participación es por stand</strong>. Si sos
						ilustrador y compartís stand con otro ilustrador, solo uno de los
						dos deberá inscribirse para participar de la actividad.
					</p>
					<p>¡El botón de inscripción te espera al final de la página!</p>
				</div>
			</section>
			<section>
				<Heading level={3}>¿Cómo funciona la votación?</Heading>
				<div className="flex flex-col gap-1 md:gap-2">
					<p>
						La votación se llevará a cabo a través de un sistema de votos
						online. Existirán 3 categorías distintas por las cuales votar:{" "}
						<strong>Ilustración</strong>, <strong>Gastronomía</strong> y{" "}
						<strong>Emprendimiento creativo</strong>. Todos los participantes
						podrán elegir su stand favorito en cada categoría. La votación
						estará disponible{" "}
						{activity.votingStartDate && activity.votingEndDate && (
							<span>
								a partir del{" "}
								<strong>
									<DateSpan
										date={activity.votingStartDate}
										format={{ month: "long", day: "numeric" }}
									/>
								</strong>{" "}
								a las{" "}
								<strong>
									<DateSpan
										date={activity.votingStartDate}
										format={{ hour: "numeric", minute: "numeric" }}
									/>
								</strong>{" "}
								hasta el{" "}
								<strong>
									<DateSpan
										date={activity.votingEndDate}
										format={{ month: "long", day: "numeric" }}
									/>
								</strong>{" "}
								a las{" "}
								<strong>
									<DateSpan
										date={activity.votingEndDate}
										format={{ hour: "numeric", minute: "numeric" }}
									/>
								</strong>
							</span>
						)}
						.{" "}
					</p>
					<p>
						A los participantes con más votos en cada categoría se los
						reconocerá con un espacio sin costo en el próximo festival Glitter,
						además de un pin especial de reconocimiento del{" "}
						<em>Stand Icónico</em>. En caso de ser ilustrador y compartir stand
						con otro ilustrador, el reconocimiento será compartido por ambos y
						pueden hacer su reserva juntos en el próximo festival para validar
						el premio.
					</p>
					<p>
						Los stands más votados serán anunciados en el escenario y en la
						comunidad de WhatsApp de la Productora Glitter antes de finalizar el
						festival.
					</p>
				</div>
				{activityVariantForProfile && activityVariantForProfile.imageUrl && (
					<figure className="relative mx-auto my-2 md:my-3">
						<div className="relative w-full max-w-[320px] h-auto aspect-square mx-auto">
							<Image
								className="object-cover rounded-md"
								src={activityVariantForProfile.imageUrl}
								alt="imagen de premio de la categoría"
								fill
								placeholder="blur"
								blurDataURL="/img/placeholders/placeholder-300x300.png"
							/>
						</div>
						<figcaption className="text-center text-sm text-muted-foreground italic mt-1">
							Pin especial de reconocimiento del Iconic Stand
						</figcaption>
					</figure>
				)}
			</section>
			<section>
				<Heading level={3}>Resumen de condiciones para participar</Heading>
				<ol className="ml-2 list-decimal list-inside space-y-2">
					<li>Tener una reserva confirmada para este festival.</li>
					<li>
						Inscribirse a la actividad con el botón de inscripción que se
						encuentra al final de la página durante el periodo de inscripción
						{activity.registrationStartDate && activity.registrationEndDate && (
							<span>
								: desde el{" "}
								<strong>
									<DateSpan
										date={activity.registrationStartDate}
										format={{ month: "long", day: "numeric" }}
									/>
								</strong>{" "}
								a las{" "}
								<strong>
									<DateSpan
										date={activity.registrationStartDate}
										format={{ hour: "numeric", minute: "numeric" }}
									/>
								</strong>
							</span>
						)}{" "}
						hasta el{" "}
						<strong>
							<DateSpan
								date={activity.registrationEndDate}
								format={{ month: "long", day: "numeric" }}
							/>
						</strong>{" "}
						a las{" "}
						<strong>
							<DateSpan
								date={activity.registrationEndDate}
								format={{ hour: "numeric", minute: "numeric" }}
							/>
						</strong>
						.
					</li>
					<li>
						Subir una imagen de tu stand{" "}
						{activity.proofUploadLimitDate && (
							<span>
								hasta el{" "}
								<strong>
									<DateSpan
										date={activity.proofUploadLimitDate}
										format={{ month: "long", day: "numeric" }}
									/>
								</strong>{" "}
								a las{" "}
								<strong>
									<DateSpan
										date={activity.proofUploadLimitDate}
										format={{ hour: "numeric", minute: "numeric" }}
									/>
								</strong>
							</span>
						)}{" "}
						para que los demás participantes puedan verlo y votar por vos.
					</li>
					<li>
						Votar por tu stand favorito en cada categoría durante el periodo de
						votación, recordando que no podés votar por tu propio stand. En caso
						de ganar pero no haber votado por algún participante en cada
						categoría, el premio pasará al siguiente en la votación.
					</li>
					<li>
						Cumplir todas las normas del evento según los términos y condiciones
						aceptados al inscribirse al festival.
					</li>
				</ol>
				<p className="text-sm text-muted-foreground italic flex flex-col gap-1 mt-2">
					<span>
						* Si un participante incumple las normas del evento, podrá ser
						eliminado de la actividad.
					</span>
					<span>
						* En caso de recibir el reconocimiento del <em>Stand Icónico</em>,
						dependiendo de la gravedad de la norma infringida, el reconocimiento
						podría ser retirado.
					</span>
				</p>
			</section>
			{isActivityInVotingWindow(activity) && activity.allowsVoting ? (
				<Button
					size="lg"
					className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold"
					asChild
				>
					<Link
						href={`/profiles/${forProfile.id}/festivals/${activity.festivalId}/activity/${activity.id}/voting`}
					>
						<VoteIcon className="w-5 h-5 mr-1" />
						Votar ahora
					</Link>
				</Button>
			) : (
				<EnrollBestStandForm
					forProfile={forProfile}
					activity={activity}
					festivalParticipants={confirmedParticipants}
					activityVariantForProfile={activityVariantForProfile}
				/>
			)}
		</div>
	);
}
