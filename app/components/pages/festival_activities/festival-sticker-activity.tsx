import DateSpan from "@/app/components/atoms/date-span";
import Title from "@/app/components/atoms/title";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import Image from "next/image";

type FestivalStickerActivityPageProps = {
	activity: FestivalActivityWithDetailsAndParticipants;
};

export default function FestivalStickerActivityPage({
	activity,
}: FestivalStickerActivityPageProps) {
	return (
		<div className="container p-3 md:p-6">
			<Title>{activity.name}</Title>
			<p className="text-base md:text-lg">{activity.description}</p>
			{activity.promotionalArtUrl && (
				<figure className="my-2 md:my-3">
					<div className="relative w-full max-w-[400px] h-auto aspect-square mx-auto">
						<Image
							className="object-cover rounded-md"
							src={activity.promotionalArtUrl}
							alt="arte promocional de la actividad"
							fill
							placeholder="blur"
							blurDataURL="/img/placeholders/placeholder-300x300.png"
						/>
					</div>
					<figcaption className="text-center text-sm text-muted-foreground">
						Arte promocional
					</figcaption>
				</figure>
			)}
			<div className="flex flex-col gap-2 md:gap-3">
				<section>
					<h2 className="text-lg font-bold">¿En qué consiste la actividad?</h2>
					<p>
						Esta actividad contiene dos dinámicas distintas, una para los
						visitantes y otra para los ilustradores.
					</p>
				</section>
				<section className="flex flex-col gap-2 md:gap-3">
					<div>
						<h3 className="font-semibold mb-1">Para los ilustradores</h3>
						<p>
							Diseña un sticker exclusivo con temática navideña que contenga los
							personajes del festival: Daisy y Nino. A través de una votación
							entre los participantes del festival, se seleccionará el mejor
							diseño.
						</p>
					</div>
					<div>
						<h3 className="font-semibold mb-1">Para los visitantes</h3>
						<p className="mb-2">
							En el stand de Glitter tendremos disponible un sticker
							coleccionable exclusivo de este festival que los visitantes podrán
							reclamar de forma gratuita hasta agotar stock luego de adquirir al
							menos 5 stickers de los ilustradores del festival.
						</p>
						{activity.activityPrizeUrl && (
							<figure className="my-2 md:my-3">
								<Image
									className="object-contain rounded-md mx-auto"
									src={activity.activityPrizeUrl}
									alt="pin de edición especial de la actividad"
									width={320}
									height={280}
								/>
								<figcaption className="text-center text-sm text-muted-foreground">
									Sticker coleccionable
								</figcaption>
							</figure>
						)}
					</div>
				</section>
				<section>
					<h2 className="text-lg font-bold">¿Cómo se puede participar?</h2>
					<p>
						La inscripción a la actividad está abierta para cualquier
						participante del festival con la{" "}
						<strong>categoría de Ilustración</strong>. No hay un límite de
						inscripciones pero todo participante inscrito deberá subir el diseño
						de su sticker al sitio web{" "}
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
						para participar de la votación.
					</p>
					<p>El botón de inscripción se encuentra al final de la página.</p>
				</section>
				<section>
					<h2 className="text-lg font-bold">
						¿Cómo funciona la votación y cuál es el premio?
					</h2>
					<p>
						La votación se llevará a cabo a través de un sistema de votos
						online. Todos los participantes del festival podrán votar por su
						diseño favorito{" "}
						{activity.votingStartDate && (
							<span>
								desde el{" "}
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
								</strong>
							</span>
						)}{" "}
						{activity.votingEndDate && (
							<span>
								hasta el{" "}
								<strong>
									<DateSpan
										date={activity.votingEndDate!}
										format={{ month: "long", day: "numeric" }}
									/>
								</strong>{" "}
								a las{" "}
								<strong>
									<DateSpan
										date={activity.votingEndDate!}
										format={{ hour: "numeric", minute: "numeric" }}
									/>
								</strong>
							</span>
						)}
						. Antes de finalizar el evento, se anunciará el ganador de la
						votación en el escenario y en la comunidad de WhatsApp de la
						Productora Glitter.
					</p>
					<p>
						Al ganador de la votación se le otorgará un{" "}
						<strong>descuento del 30%</strong> en la reserva de su espacio,
						válido únicamente para la próxima edición del festival Glitter.
					</p>
				</section>
				<section>
					<h2 className="text-lg font-bold">Resumen</h2>
					<ol className="ml-2 list-decimal list-inside space-y-2">
						<li>
							Tener una reserva confirmada para el festival y ser parte de la
							categoría de Ilustración
						</li>
						<li>
							Inscribirse a la actividad con el botón de inscripción que se
							encuentra al final de la página.
						</li>
						<li>
							Ilustrar un sticker propio que contenga a los personajes del
							festival: Daisy y Nino. El diseño debe ser apto para todo público,
							es decir, no puede contener contenido sexual, violento, o que
							pueda ser ofensivo. Subir el diseño de su sticker al sitio web{" "}
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
							)}
						</li>
						<li>
							Tener el sticker a la venta en su propio stand durante el
							festival. En caso de miembros del staff confirmen que el sticker
							no se encuentra a la venta por el ilustrador participante o que no
							cumple con las condiciones de la actividad, el diseño podrá ser
							retirado de la actividad. La cantidad mínima de stickers a la
							venta queda a disposición del ilustrador participante.
						</li>
						<li>
							Votar por su diseño favorito durante el periodo de votación. No se
							permitirá votar por uno mismo.
						</li>
					</ol>
				</section>
			</div>
		</div>
	);
}
