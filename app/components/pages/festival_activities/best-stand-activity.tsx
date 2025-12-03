import { BaseProfile, UserCategory } from "@/app/api/users/definitions";
import DateSpan from "@/app/components/atoms/date-span";
import Title from "@/app/components/atoms/title";
import EnrollRedirectButton from "@/app/components/festivals/festival_activities/enroll-redirect-button";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import Image from "next/image";

type BestStandActivityPageProps = {
	activity: FestivalActivityWithDetailsAndParticipants;
	currentProfile: BaseProfile;
	forProfile: BaseProfile;
};

export default function BestStandActivityPage({
	activity,
	currentProfile,
	forProfile,
}: BestStandActivityPageProps) {
	/**
	 * The variant images are hardcoded for this page but in the future we should
	 * find a way to tell them apart dynamically.
	 */
	const variantPrizeImages: {
		category: UserCategory;
		imageUrl?: string | null;
	}[] = [
		{
			category: "illustration",
			imageUrl: activity.details[0]?.imageUrl,
		},
		{
			category: "entrepreneurship",
			imageUrl: activity.details[1]?.imageUrl,
		},
		{
			category: "gastronomy",
			imageUrl: activity.details[2]?.imageUrl,
		},
	];

	const variantForProfile = variantPrizeImages.find(
		(variant) => variant.category === forProfile.category,
	);

	return (
		<div className="container p-3 md:p-6 flex flex-col gap-4 md:gap-5">
			<section>
				<Title level="h1">{activity.name}</Title>
				<p>{activity.description}</p>
			</section>
			{activity.promotionalArtUrl && (
				<section>
					<figure className="relative mx-auto mb-2 md:mb-3">
						<div className="relative w-full max-w-[400px] h-auto aspect-square">
							<Image
								className="object-cover mx-auto"
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
				<Title level="h3">¿En qué consiste la actividad?</Title>
				<div className="flex flex-col gap-1 md:gap-2">
					<p>
						<em>Iconic Stand</em> es un reconocimiento especial para celebrar a
						los expositores que llenan de creatividad, encanto y personalidad
						sus espacios dentro del festival.
					</p>
					<p>
						En esta edición del festival, los propios participantes votarán en
						nuestro sitio web para elegir al stand que más destaque por su
						propuesta visual y originalidad.
					</p>
					<p>
						El participante que reciba más votos en cada categoría obtendrá un
						espacio sin costo en el primer Glitter 2026, como una forma de
						celebrar su dedicación y el aporte que hace a la magia del festival.
					</p>
				</div>
			</section>
			<section>
				<Title level="h3">¿Cómo participar?</Title>
				<div className="flex flex-col gap-1 md:gap-2">
					<p>
						Si tenés una reserva confirmada para este festival, podrás
						inscribirte en la actividad el{" "}
						{activity.registrationStartDate && activity.registrationEndDate && (
							<span>
								<strong>
									<DateSpan
										date={activity.registrationStartDate}
										format={{ month: "long", day: "numeric" }}
									/>
								</strong>{" "}
								desde las{" "}
								<strong>
									<DateSpan
										date={activity.registrationStartDate}
										format={{ hour: "numeric", minute: "numeric" }}
									/>
								</strong>
							</span>
						)}{" "}
						hasta las{" "}
						<strong>
							<DateSpan
								date={activity.registrationEndDate}
								format={{ hour: "numeric", minute: "numeric" }}
							/>
						</strong>
						. Al inscribirte, deberás subir una imagen de tu stand para que los
						demás participantes puedan verlo y votar por ti. La imagen tiene que
						ser tomada el mismo día del festival. No puede ser una imagen
						antigua ya que el propósito de la actividad es reconocer al stand
						destacado de la edición actual.
					</p>
					<p>
						No hay un límite de inscripciones. Todos los participantes pueden
						inscribirse a la actividad. Habrá una votación por cada categoría
						para elegir al <em>Iconic Stand</em> de cada una. Pero tomá en
						cuenta que <strong>la participación es por stand</strong>. Si sos
						ilustrador y compartís stand con otro ilustrador, solo uno de los
						dos deberá inscribirse para participar de la actividad.
					</p>
					<p>El botón de inscripción se encuentra al final de la página.</p>
				</div>
			</section>
			<section>
				<Title level="h3">¿Cómo funciona la votación?</Title>
				<div className="flex flex-col gap-1 md:gap-2">
					<p>
						La votación se llevará a cabo a través de un sistema de votos
						online. Existirán 3 categorías distintas por las cuales votar:{" "}
						<strong>Ilustración</strong>, <strong>Gastronomía</strong> y{" "}
						<strong>Emprendimiento creativo</strong>. Todos los participantes
						deberán elegir su stand favorito en cada categoría. La votación
						estará disponible solo para quienes tienen una reserva confirmada
						para este festival{" "}
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
						reconocerá con un espacio sin costo en el primer festival Glitter
						del 2026, además de un pin especial de reconocimiento del{" "}
						<em>Iconic Stand</em>. En caso de ser ilustrador y compartir stand
						con otro ilustrador, ambos deberán hacer su reserva en conjunto
						nuevamente para recibir el espacio.
					</p>
					<p>
						Los stands con más votos serán anunciados en el escenario y en la
						comunidad de WhatsApp de la Productora Glitter antes de finalizar el
						festival.
					</p>
				</div>
				{variantForProfile && variantForProfile.imageUrl && (
					<figure className="relative mx-auto my-2 md:my-3">
						<div className="relative w-full max-w-[320px] h-auto aspect-square mx-auto">
							<Image
								className="object-cover rounded-md"
								src={
									variantPrizeImages.find(
										(variant) => variant.category === forProfile.category,
									)?.imageUrl ?? ""
								}
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
				<Title level="h3">Resumen de condiciones para participar</Title>
				<ol className="ml-2 list-decimal list-inside space-y-2">
					<li>Tener una reserva confirmada para este festival.</li>
					<li>
						Inscribirse a la actividad con el botón de inscripción que se
						encuentra al final de la página.
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
						para que los demás participantes puedan verlo y votar por ti.
					</li>
					<li>
						Votar por tu stand favorito en cada categoría durante el periodo de
						votación. No se permitirá votar por uno mismo.
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
						* En caso de recibir el reconocimiento del <em>Iconic Stand</em>,
						dependiendo de la gravedad de la norma infringida, el reconocimiento
						podría ser retirado.
					</span>
				</p>
			</section>
			<EnrollRedirectButton
				currentProfile={currentProfile}
				forProfile={forProfile}
				festivalId={activity.festivalId}
				activity={activity}
			/>
		</div>
	);
}
