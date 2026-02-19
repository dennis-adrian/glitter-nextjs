"use client";

import {
	BaseProfile,
	ProfileType,
	UserCategory,
} from "@/app/api/users/definitions";
import Title from "@/app/components/atoms/title";
import StandSpecificationsCards from "@/app/components/festivals/stand-specifications-cards";
import TermsForm from "@/app/components/festivals/terms-form";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { RedirectButton } from "@/app/components/redirect-button";
import { Label } from "@/app/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/components/ui/select";
import {
	FestivalSectorBase,
	FestivalSectorWithStands,
} from "@/app/lib/festival_sectors/definitions";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { DateTime } from "luxon";
import { useState } from "react";

type TermsAndConditionsProps = {
	festival: FestivalWithDates;
	forProfile: ProfileType;
	currentUser: BaseProfile;
	category: Exclude<UserCategory, "none">;
	festivalSectors: FestivalSectorBase[];
	festivalSectorsWithAllowedCategoriesPromise: Promise<
		(FestivalSectorWithStands & {
			allowedCategories: UserCategory[];
		})[]
	>;
};

export default function TermsAndConditions(props: TermsAndConditionsProps) {
	const [selectedCategory, setSelectedCategory] = useState<
		Exclude<UserCategory, "none">
	>(props.category);

	const mapCategory =
		selectedCategory === "new_artist" ? "illustration" : selectedCategory;

	const dayOneStartDate = formatDate(props.festival.festivalDates[0].startDate);

	const SHOW_HIGHLIGHTS = true;
	const hNew = SHOW_HIGHLIGHTS
		? "rounded bg-green-100 ring-1 ring-green-300 px-0.5"
		: "";
	const hMod = SHOW_HIGHLIGHTS
		? "rounded bg-amber-100 ring-1 ring-amber-300 px-0.5"
		: "";

	return (
		<div className="container mx-auto py-8 px-4 md:px-6">
			<div className="max-w-5xl mx-auto">
				{props.currentUser.role === "admin" && (
					<div className="flex flex-col gap-2 mb-4 max-w-fit">
						<Label>Categoría de los términos y condiciones</Label>
						<Select
							value={selectedCategory}
							onValueChange={(value) =>
								setSelectedCategory(value as Exclude<UserCategory, "none">)
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Selecciona una categoría" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="illustration">Ilustración</SelectItem>
								<SelectItem value="entrepreneurship">Emprendimiento</SelectItem>
								<SelectItem value="gastronomy">Gastronomía</SelectItem>
							</SelectContent>
						</Select>
					</div>
				)}
				{SHOW_HIGHLIGHTS && (
					<div className="flex flex-wrap gap-3 items-center text-sm mb-6 p-3 bg-muted rounded-lg border">
						<span className="font-medium">Guía de revisión:</span>
						<span className="rounded bg-green-100 ring-1 ring-green-300 px-2 py-0.5">Contenido nuevo</span>
						<span className="rounded bg-amber-100 ring-1 ring-amber-300 px-2 py-0.5">Contenido modificado</span>
					</div>
				)}
				<div className="space-y-4 text-left md:text-center mb-4">
					<Title level="h1">Términos y Condiciones para Expositores</Title>
					<p className="text-sm text-muted-foreground">
						Última actualización: 18 de febrero de 2026
					</p>
					<p className="text-muted-foreground">
						Por favor, leé estos términos y condiciones cuidadosamente para
						habilitar tu participación en el festival.
					</p>
				</div>

				<div className="flex flex-col">
					<Title level="h2">Mapa del Evento y Precios de Espacios</Title>
					<div>
						<Title level="h3" className="mb-3">
							Sectores habilitados para{" "}
							{getCategoryOccupationLabel(mapCategory).toLowerCase()}
						</Title>
						<StandSpecificationsCards
							profileCategory={mapCategory}
							festivalSectorsWithAllowedCategoriesPromise={
								props.festivalSectorsWithAllowedCategoriesPromise
							}
						/>
					</div>

					{mapCategory === "illustration" && (
						<p className="text-sm text-muted-foreground text-left md:text-center">
							* En el caso de ilustradores que comparten espacio, si en el
							transcurso de tiempo entre confirmada la reserva y el día del
							evento una de las partes no puede participar, el otro ilustrador
							deberá hacerse cargo de ocupar el espacio, sin posibilidades de
							reemplazar al ilustrador que se dio de baja por otro.
						</p>
					)}
				</div>

				<div className="space-y-4 md:space-y-6 border rounded-lg p-6 my-4 md:my-6">
					<section>
						<h2 className="text-lg md:text-xl font-semibold mb-4">
							1. Aceptación de Términos
						</h2>
						<p className={`text-muted-foreground ${hMod}`}>
							Al hacer clic en &quot;Acepto los términos y condiciones&quot;
							estás suscribiendo un acuerdo vinculante con la organización. Al
							registrarte y participar en el festival como expositor, aceptas
							estar sujeto a estos Términos y Condiciones. El incumplimiento de
							cualquiera de estas condiciones puede derivar en consecuencias
							según la gravedad de la infracción: desde una advertencia formal,
							hasta la restricción temporal o permanente de participar en
							futuros festivales de la productora.
						</p>
					</section>

					<Separator />

					<section>
						<h2 className="text-lg md:text-xl font-semibold mb-4 flex items-center flex-wrap gap-2">
							2. Participación en el Festival
							{SHOW_HIGHLIGHTS && (
								<span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-normal">
									Modificado
								</span>
							)}
						</h2>
						<p className="text-muted-foreground mb-4">
							La participación en el festival está sujeta a las siguientes
							condiciones:
						</p>
						<ul className="list-disc pl-6 space-y-2 text-muted-foreground">
							<li><span className={hMod}>								Los expositores deben tener al menos 16 años de edad. Los
								expositores menores de 18 años deben estar presentes con un
								padre, madre o tutor legal durante la totalidad del evento.
							</span></li>
							<li><span className={hMod}>								Todos los participantes deben tener un perfil aprobado en
								nuestro sitio web — es decir, una cuenta que haya pasado por
								revisión y esté habilitada por la organización — y una reserva
								confirmada y pagada para su espacio.
							</span></li>
							<li>
								Los organizadores del festival se reservan el derecho de
								rechazar la participación de cualquier expositor sin
								proporcionar una razón.
							</li>
							<li>
								Todos los participantes deben cuidar la estética de su stand
								para que sea atractiva para el público.
							</li>
							{props.festival.festivalType === "festicker" && (
								<li>
									Los participantes en la categoría de ilustración deben tener
									al menos el 80% de su stand ocupado con stickers. Otros
									productos pueden ser comercializados pero deben estar
									organizados en muestrarios o exhibidores de manera que no
									signifiquen más del 20% del espacio. El incumplimiento de este
									requisito puede resultar en penalizaciones para
									participaciones futuras.
								</li>
							)}
							<li>
								Solo se permite tener a dos personas trabajando en el stand.
								Cada persona con su credencial correspondiente. Tener a más de
								dos personas y/o personas sin credencial en el stand sin
								autorización puede resultar en penalizaciones para
								participaciones futuras.
							</li>
							<li>
								Los expositores deben cumplir con todas las reglas del festival,
								regulaciones e instrucciones del personal del festival.
							</li>
							<li>
								El staff del festival hará un recorrido por el recinto para
								verificar que los expositores cumplen con las reglas del
								festival.
							</li>
							<li><span className={hNew}>								La organización no se responsabiliza por robos, daños o pérdidas
								de mercadería o equipamiento ocurridos en el stand durante el
								evento.
							</span></li>
						</ul>
					</section>

					<Separator />

					<Accordion type="multiple" className="w-full">
						<AccordionItem value="item-1">
							<AccordionTrigger className="text-lg md:text-xl font-semibold">
								3. Reservas, Pagos y Cancelaciones
								{SHOW_HIGHLIGHTS && (
									<span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-normal ml-2">
										Modificado
									</span>
								)}
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<ul className="list-disc pl-6 space-y-2">
									{mapCategory === "illustration" && (
										<li>
											Los ilustradores que quieran compartir espacio deben
											agregar a su compañero al momento de hacer la reserva.
											Todo ilustrador debe tener un perfil aprobado y debe haber
											aceptado los términos y condiciones para poder ser
											agregado como compañero. No se aceptarán cambios una vez
											hecha la reserva.
										</li>
									)}
									{mapCategory === "entrepreneurship" &&
										props.festival.festivalType === "festicker" && (
											<li>
												Para participar del Festicker los expositores deberán
												repartir stickers con su logo y/o información de
												contacto en lugar de tarjetas de presentación comunes.
											</li>
										)}
									<li><span className={hMod}>										La reserva se confirma al realizar el pago correspondiente.
										El estado de la reserva puede tomar hasta 48 horas en
										actualizarse en el sitio web, contadas a partir de que el
										participante haya subido el comprobante de pago en el sitio
										web.
									</span></li>
									<li>
										Toda reserva debe ser pagada en su totalidad hasta 5 días o
										120 horas después de creada la reserva. En caso de no
										hacerlo, la reserva será cancelada automáticamente, el
										espacio será liberado y el participante no podrá participar
										en el festival.
									</li>
									<li>
										Las reservas confirmadas que sean canceladas a más de 30
										días antes del evento recibirán un reembolso del 75%.
									</li>
									<li>
										Las reservas confirmadas que sean canceladas entre 20 y 30
										días antes del evento recibirán un reembolso del 50%.
									</li>
									<li>
										No se proporcionarán reembolsos para cancelaciones
										realizadas con menos de 20 días de anticipación al evento.
									</li>
									<li>
										En caso de cancelación de todo el festival debido a
										circunstancias fuera del control de los organizadores
										(incluyendo pero no limitado a desastres naturales,
										emergencias públicas, estallidos sociales u órdenes
										gubernamentales), los reembolsos pueden proporcionarse a
										discreción de los organizadores.
									</li>
									<li>
										Las reservas de stands no son transferibles a menos que sea
										explícitamente permitido por los organizadores del festival.
									</li>
									<li><span className={hNew}>										En caso de no presentarse al evento sin haber cancelado la
										reserva previamente, se registrará una infracción formal en
										el sistema, lo que puede derivar en restricciones para la
										reserva de espacios en futuros festivales. Se considera
										aviso previo cualquier comunicación enviada a la
										organización con al menos 48 horas de anticipación al inicio
										del evento.
									</span></li>
								</ul>
								<p className="mt-4">
									Cancelar una reserva puede resultar en penalizaciones para
									participaciones en futuros festivales de la productora.
								</p>
								<p className="mt-4">
									<b>Evaluación de materiales:</b> Los expositores que no hayan
									participado previamente en otros festivales de la productora,
									estarán obligados a subir imágenes de los productos que
									comercializarán en su espacio. Estas imágenes se subirán a la
									plataforma designada por la organización y hasta la fecha
									comunicada luego de hecha la reserva, para su evaluación
									interna. En caso de incumplimiento o en caso de que el
									material subido vaya en contra de alguno de los términos y
									condiciones, la reserva será cancelada automáticamente, el
									espacio será liberado y el participante no podrá participar en
									el festival.
								</p>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="item-2">
							<AccordionTrigger className="text-lg md:text-xl font-semibold">
								4. Horarios, Montaje y Desmontaje de Stands
								{SHOW_HIGHLIGHTS && (
									<span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-normal ml-2">
										Modificado
									</span>
								)}
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<ul className="list-disc pl-6 space-y-2">
									<li>
										El montaje debe completarse antes de las{" "}
										{dayOneStartDate.toLocaleString(DateTime.TIME_24_SIMPLE)}{" "}
										ambos días del evento.
									</li>
									<li>
										Los expositores tendrán acceso al recinto para el montaje
										desde las{" "}
										{dayOneStartDate
											.minus({ hour: 1 })
											.toLocaleString(DateTime.TIME_24_SIMPLE)}{" "}
										ambos días del evento.
									</li>
									<li>
										El ingreso del público será a partir de las{" "}
										{dayOneStartDate.toLocaleString(DateTime.TIME_24_SIMPLE)}.{" "}
										No se permitirá el ingreso a expositores después de que el
										público haya ingresado al recinto.
									</li>
									<li>
										No se permite el desmontaje anticipado sin previa
										autorización y puede resultar en penalizaciones para
										participaciones futuras.
									</li>
									<li>
										El desmontaje debe completarse antes de las 21:30 el primer
										día y hasta las 21:45 el segundo día. Los expositores pueden
										dejar sus stands montados el primer día para ahorrar tiempo
										de montaje en el segundo día.
									</li>
								</ul>
								<p className="mt-4">
									No llegar a tiempo o no tener montado el stand hasta la hora
									indicada puede resultar en penalizaciones para participaciones
									futuras.
								</p>
								<p className={`mt-4 ${hNew}`}>
									<b>Uso de electricidad:</b> El acceso a puntos eléctricos en
									el recinto depende de la disponibilidad del establecimiento.
									Los expositores que requieran electricidad para su stand deben
									comunicarlo a la organización con al menos 20 días de
									anticipación al evento. La organización hará lo posible por
									gestionar la solicitud, pero no garantiza su disponibilidad.
								</p>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="item-3">
							<AccordionTrigger className="text-lg md:text-xl font-semibold">
								5. Código de Conducta
								{SHOW_HIGHLIGHTS && (
									<span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-normal ml-2">
										Modificado
									</span>
								)}
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<p className="mb-4">Se espera que todos los expositores:</p>
								<ul className="list-disc pl-6 space-y-2">
									<li>
										Traten a otros expositores, asistentes, y personal con
										respeto y cortesía.
									</li>
									<li>
										Respeten el espacio asignado y no lo extiendan más allá de
										los límites del stand.
									</li>
									<li><span className={hMod}>										Mantengan todo contenido para adultos (explícito, erótico o
										con violencia gráfica) debidamente cubierto y disponible
										únicamente bajo solicitud directa del cliente.
									</span></li>
									<li>
										Se abstengan de cualquier comportamiento que pueda causar
										incomodidad, miedo o daño a otros.
									</li>
									<li><span className={hMod}>										No participen en ninguna forma de acoso, discriminación o
										comportamiento amenazante, ya sea en persona, en redes
										sociales o en cualquier plataforma digital, hacia otros
										expositores, asistentes, staff o la organización.
									</span></li>
									<li>
										No posean ni usen sustancias ilegales. Ni se encuentren en
										el evento bajo la influencia del alcohol o de sustancias
										ilegales.
									</li>
									<li>
										Mantengan un área de stand limpia y segura durante todo el
										festival.
									</li>
									<li><span className={hNew}>										No publiquen, compartan ni reproduzcan el trabajo, los
										productos o la imagen de otros expositores en redes sociales
										sin su consentimiento explícito.
									</span></li>
									<li><span className={hNew}>										Cuiden la imagen del festival en sus publicaciones: eviten
										compartir contenido que pueda afectar negativamente su
										reputación o la de la organización.
									</span></li>
								</ul>
								{mapCategory === "illustration" && (
									<div className="mt-3 mb-2">
										<b>Responsabilidad compartida en stands compartidos:</b>
										<p>
											En caso de que un ilustrador comparta stand con otro,
											ambos serán responsables por el cumplimiento de las
											normas. Cualquier infracción cometida por uno de los
											ilustradores, sus acompañantes o el equipo presente en el
											stand podrá generar sanciones que afecten a ambos
											participantes.
										</p>
									</div>
								)}
								<p className="mt-4">
									La violación de este código de conducta puede resultar en la
									expulsión inmediata del festival sin reembolso y/o la
									prohibición de participar en futuros festivales de la
									productora.
								</p>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="item-4">
							<AccordionTrigger className="text-lg md:text-xl font-semibold">
								6. Fotografía y Grabación
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<p className="mb-4">
									Al participar en el festival, das tu consentimiento para:
								</p>
								<ul className="list-disc pl-6 space-y-2">
									<li>
										Que tu stand o espacio sea fotografiado, filmado o grabado
										por los organizadores del festival o sus representantes
										designados (los expositores y/o acompañantes pueden optar no
										ser parte de la fotografía o video).
									</li>
									<li>
										El uso de tu stand, productos, logotipo, imágenes del
										personal y semejanza en fotografías, videos y grabaciones
										con fines promocionales, comerciales y de archivo sin
										compensación.
									</li>
									<li>
										Que los organizadores del festival posean todos los derechos
										de cualquier fotografía, video y grabación oficial tomada
										durante el festival.
									</li>
								</ul>
								<p className="mt-4">
									Los expositores pueden tomar fotografías y grabaciones de su
									propio stand con fines promocionales.
								</p>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="item-5">
							<AccordionTrigger className="text-lg md:text-xl font-semibold">
								7. Artículos y Actividades Prohibidas
								{SHOW_HIGHLIGHTS && (
									<span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-normal ml-2">
										Modificado
									</span>
								)}
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<p className="mb-4">
									Los siguientes artículos y actividades están prohibidos:
								</p>
								<ul className="list-disc pl-6 space-y-2">
									<li>
										Armas de cualquier tipo, incluyendo pero no limitado a armas
										de fuego, cuchillos y gas pimienta
									</li>
									<li>Sustancias ilegales</li>
									<li>
										Materiales inflamables sin las medidas de seguridad
										adecuadas y aprobaciones
									</li>
									<li>
										Sistemas de audio fuertes que interfieran con los espacios
										vecinos
									</li>
									<li><span className={hNew}>										El uso de luces parpadeantes o estroboscópicas de cualquier
										tipo en el stand.
									</span></li>
									<li>
										Distribución de materiales de marketing fuera del área de
										stand asignada
									</li>
									<li>
										Distribución o comercialización de productos
										discriminatorios y/o que inciten al odio
									</li>
									<li>
										Compartir stand en sectores o categorías no especificadas.
										Solo pueden compartir stand quienes sean parte de la
										categoría de ilustración
									</li>
									<li>
										Comercializar productos elaborados con inteligencia
										artificial o que utilicen tecnologías de IA
									</li>
									<li>
										Vender productos que no sean de autoría propia o tengan como
										base contenido de terceros sin el consentimiento del
										creador. (Consideramos los fan-arts aceptables más no el
										calco de imágenes)
									</li>
									<li>
										Ofrecer servicios, vender o regalar productos de terceros
										que no estén inscritos en el festival o que no sean parte de
										la reserva del stand.
									</li>
									<li>
										Cualquier actividad que viole las leyes o regulaciones
										locales
									</li>
									<li><span className={hNew}>										La presencia de animales o mascotas de cualquier tipo en el
										stand o en el recinto del festival sin autorización previa
										de la organización.
									</span></li>
								</ul>
								<p className="mt-4">
									<b>
										Prohibición de venta de material de expositores
										inhabilitados:
									</b>{" "}
									<span>
										No está permitido vender productos elaborados por
										expositores cuyo perfil esté deshabilitado en el sitio web
										oficial del evento. Tampoco se permitirá la venta de
										material colaborativo si uno de los involucrados tiene el
										perfil deshabilitado. Esta medida busca garantizar que solo
										participen y comercialicen productos los expositores
										debidamente registrados y habilitados.
									</span>
								</p>
								<p className="mt-4">
									<b>
										Prohibición de acreditación como acompañante a perfiles
										deshabilitados:
									</b>{" "}
									<span>
										No está permitido que una persona con perfil deshabilitado
										participe en el evento de ninguna manera, ni utilizando el
										credencial de acompañante asignada a otro expositor. Esta
										medida aplica especialmente a los casos en los que un
										participante habilitado intente acreditar como acompañante o
										miembro de su equipo de trabajo a una persona previamente
										deshabilitada. En caso de detectarse esta situación, se
										podrán aplicar sanciones al titular del espacio.
									</span>
								</p>
								{mapCategory === "gastronomy" && (
									<>
										<h3 className="text-lg font-semibold mt-4">
											Sector de gastronomía
										</h3>
										<ul className="list-disc pl-6 space-y-2">
											<li>
												Por motivos de patrocinio, exclusividad y alineación con
												la temática del evento, no se permite la venta de los
												siguientes productos.
												<ol className="ps-5 mt-2 space-y-1 list-disc list-inside">
													<li>Bebidas alcohólicas o que contengan alcohol</li>
													<li>
														Productos que generen olores fuertes o desagradables
													</li>
													<li>Gaseosas</li>
													<li>Panchitos o &quot;hot dogs&quot; en general</li>
													<li>Sopas de ramen</li>
													<li>Pipocas</li>
												</ol>
											</li>
											<li>
												Los productos que el expositor ofrezca a la venta deben
												estar previamente preparados. Recalcar que no se permite
												el uso de garrafas o cualquier artefacto que provoque
												fuego.
											</li>
											<li>
												No está permitido ofrecer productos afuera del espacio
												asignado a su stand
											</li>
											<li><span className={hNew}>												La manipulación de alimentos debe realizarse con guantes
												en todo momento. Su uso es obligatorio durante la
												preparación, manipulación y entrega de productos al
												cliente.
											</span></li>
										</ul>
										<p className={`mt-4 ${hNew}`}>
											<b>Presentación y estética del stand:</b> Todos los stands
											deberán cumplir con un estándar mínimo de presentación
											visual y estética acorde a la identidad del evento. No se
											permitirán montajes improvisados, envases de uso
											doméstico, carteles manuscritos o materiales que no formen
											parte de una propuesta visual cuidada y coherente. La
											organización se reserva el derecho de solicitar ajustes o
											rechazar stands que no cumplan con estos lineamientos.
										</p>
										<p className="mt-4">
											La violación de estas prohibiciones puede resultar en la
											expulsión inmediata del festival sin reembolso.
										</p>
									</>
								)}
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="item-6">
							<AccordionTrigger className="text-lg md:text-xl font-semibold">
								8. Resolución de Conflictos
								{SHOW_HIGHLIGHTS && (
									<span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-normal ml-2">
										Nuevo
									</span>
								)}
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<ul className="list-disc pl-6 space-y-2">
									<li>
										Los conflictos entre expositores durante el evento serán
										mediados por el staff del festival, cuya resolución es
										definitiva en el contexto del evento.
									</li>
									<li>
										Las disputas con la organización deben comunicarse por
										escrito al correo expositores@productoraglitter.com dentro
										de los 15 días posteriores a la fecha del evento. La
										organización responderá dentro de los 10 días hábiles
										siguientes.
									</li>
									<li>
										En caso de no alcanzar una resolución satisfactoria, estos
										Términos y Condiciones y cualquier disputa derivada de los
										mismos se rigen por las leyes de la República de Bolivia.
									</li>
								</ul>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="item-7">
							<AccordionTrigger className="text-lg md:text-xl font-semibold">
								9. Modificaciones a los Términos
								{SHOW_HIGHLIGHTS && (
									<span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-normal ml-2">
										Nuevo
									</span>
								)}
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<p className="mb-4">
									La organización se reserva el derecho de actualizar o
									modificar estos Términos y Condiciones en cualquier momento.
									Los cambios serán comunicados con al menos 15 días de
									anticipación a través de la plataforma y/o por correo
									electrónico. La participación continuada en festivales de la
									productora tras la entrada en vigencia de los nuevos términos
									implica la aceptación de los mismos.
								</p>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="item-8">
							<AccordionTrigger className="text-lg md:text-xl font-semibold">
								10. Información de Contacto
							</AccordionTrigger>
							<AccordionContent className="text-muted-foreground">
								<p>
									Para preguntas o inquietudes sobre estos Términos y
									Condiciones, por favor contacte a los organizadores del
									festival en:
								</p>
								<address className="mt-2 not-italic">
									Email: expositores@productoraglitter.com
									<br />
								</address>
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</div>

				<div className={`rounded-lg border bg-muted/40 p-6 my-4 md:my-6 ${SHOW_HIGHLIGHTS ? "ring-2 ring-green-300 ring-offset-2" : ""}`}>
					<h2 className="text-lg font-semibold mb-2">
						¡Forma parte de nuestra comunidad!
					</h2>
					<p className="text-muted-foreground text-sm">
						Formas parte de nuestra comunidad y puedes ayudarnos a llegar a más
						personas — lo que también significa más público en el festival y más
						ojos en tu stand. La forma más efectiva de lograrlo es interactuando
						con nuestro contenido: dale like a nuestras publicaciones e
						historias en{" "}
						<a
							href="https://www.instagram.com/glitter.bo"
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium underline underline-offset-4 hover:text-foreground transition-colors"
						>
							Instagram
						</a>
						, comenta lo que se te ocurra en nuestros videos de{" "}
						<a
							href="https://www.tiktok.com/@glitter.bo"
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium underline underline-offset-4 hover:text-foreground transition-colors"
						>
							TikTok
						</a>
						, y comparte lo que te guste. Eso es lo que realmente hace crecer a
						una comunidad.
					</p>
				</div>

				{isProfileInFestival(props.festival.id, props.forProfile) ? (
					<>
						<div className="rounded-md border p-4">
							Gracias por aceptar los términos y condiciones. Para hacer tu
							reserva haz clic en el botón de abajo.
						</div>
						<div className="flex justify-end mt-4">
							<RedirectButton
								href={`/profiles/${props.forProfile.id}/festivals/${props.festival.id}/reservations/new`}
							>
								Completar mi reserva
							</RedirectButton>
						</div>
					</>
				) : (
					<TermsForm festival={props.festival} profile={props.forProfile} />
				)}
			</div>
		</div>
	);
}
