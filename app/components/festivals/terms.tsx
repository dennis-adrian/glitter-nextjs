import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import Image from "next/image";
import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import GeneralInfoDetails from "@/app/components/festivals/general-info-details";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { FestivalSectorBase } from "@/app/lib/festival_sectors/definitions";
import { RedirectButton } from "@/app/components/redirect-button";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import TermsForm from "@/app/components/festivals/terms-form";
import StandSpecificationsCards from "@/app/components/festivals/stand-specifications-cards";
import DetailedMap from "@/app/components/festivals/detailed-map";

type TermsAndConditionsProps = {
  festival: FestivalWithDates;
  profile: ProfileType;
  category: Exclude<UserCategory, "none">;
  festivalSectors: FestivalSectorBase[];
};

export default function TermsAndConditions(props: TermsAndConditionsProps) {
  const mapCategory =
    props.category === "new_artist" ? "illustration" : props.category;

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <div className="max-w-screen-lg mx-auto">
        <div className="space-y-4 text-left md:text-center mb-4">
          <h1 className="text-3xl font-bold tracking-tight">
            Términos y Condiciones para Expositores
          </h1>
          <p className="text-muted-foreground">
            Por favor, lee estos términos y condiciones cuidadosamente antes de
            participar en el festival.
          </p>
          <p className="text-sm text-muted-foreground">
            Última actualización: 2 de abril de 2025
          </p>
        </div>

        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-left md:text-center">
            Información para {getCategoryOccupationLabel(mapCategory)}
          </h2>

          <GeneralInfoDetails festival={props.festival} />
        </div>

        <div className="flex flex-col gap-4 md:gap-6">
          <h2 className="text-xl md:text-2xl font-semibold text-left md:text-center">
            Mapa del Evento y Precios de Espacios
          </h2>

          {props.festival.generalMapUrl && (
            <div className="lg:col-span-2 border rounded-lg p-2 md:p-4">
              <Image
                src="/img/festicker-map-with-details-1024x646.png"
                alt="Mapa del recinto"
                width={800}
                height={504}
                className="mx-auto"
              />
              <div />
              <DetailedMap festivalSectors={props.festivalSectors} />
            </div>
          )}

          <div>
            <h3 className="text-lg md:text-xl font-medium mb-3 md:mb-4 text-left md:text-center leading-tight">
              Sectores habilitados para{" "}
              {getCategoryOccupationLabel(mapCategory).toLowerCase()}
            </h3>
            <StandSpecificationsCards category={mapCategory} />
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
            <p className="text-muted-foreground">
              Al registrarte y participar en el festival como expositor, aceptas
              estar sujeto a estos Términos y Condiciones. Cualquier
              incumplimiento y según la gravedad podría resultar en la expulsión
              del evento sin reembolso y/o la prohibición temporal o permanente
              de participar en futuros festivales.
            </p>
          </section>

          <Separator />

          <section>
            <h2 className="text-lg md:text-xl font-semibold mb-4">
              2. Participación en el Festival
            </h2>
            <p className="text-muted-foreground mb-4">
              La participación en el festival está sujeta a las siguientes
              condiciones:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>
                Los expositores deben tener al menos 16 años de edad o estar
                presentes con un adulto responsable durante la totalidad del
                evento.
              </li>
              <li>
                Todos los participantes deben tener un perfil aprobado en
                nuestro sitio web y una reserva confirmada y pagada para su
                espacio.
              </li>
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
                dos personas y/o personas sin credencial en el estand sin
                autorización puede resultar en penalizaciones para
                participaciones futuras.
              </li>
              <li>
                Los expositores deben cumplir con todas las reglas del festival,
                regulaciones e instrucciones del personal del festival.
              </li>
            </ul>
          </section>

          <Separator />

          <Accordion type="multiple" className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-lg md:text-xl font-semibold">
                3. Reservas, Pagos y Cancelaciones
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
                  <li>
                    La reserva se confirma al realizar el pago correspondiente.
                    El estado de la reserva puede tomar hasta 48hrs en
                    actualizarse en el sitio web.
                  </li>
                  <li>
                    Toda reserva debe ser pagada en su totalidad hasta 5 días o
                    120 horas después de creada la reserva. En caso de no
                    hacerlo, la reserva será cancelada automáticamente, el
                    espacio será liberado y el participante no podrá participar
                    en el festival.
                  </li>
                  {/* <li>
                    Las reservas confirmadas que sean canceladas a más de 30
                    días antes del evento recibirán un reembolso del 75%.
                  </li> */}
                  <li>
                    Las reservas confirmadas que sean canceladas entre 20 y 30
                    días antes del evento recibirán un reembolso del 50%.
                  </li>
                  <li>
                    No se proporcionarán reembolsos para cancelaciones
                    realizadas con menos de 15 días de anticipación al evento.
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
                </ul>
                <p className="mt-4">
                  Cancelar una reserva puede resultar en penalizaciones para
                  participaciones en futuros festivales de la productora.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger className="text-lg md:text-xl font-semibold">
                4. Horarios, Montaje y Desmontaje de Stands
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    El montaje debe completarse antes de las 13:30 ambos días
                    del evento.
                  </li>
                  <li>
                    Los expositores tendrán acceso al recinto para el montaje
                    desde las 12:00 el primer día y las 13:00 el segundo día.
                  </li>
                  <li>
                    El ingreso del público será a partir de las 14:00. No se
                    permitirá el ingreso a expositores después de que el público
                    haya ingresado al recinto.
                  </li>
                  <li>
                    No se permite el desmontaje anticipado sin previa
                    autorización y puede resultar en penalizaciones para
                    participaciones futuras.
                  </li>
                  <li>
                    El desmontaje debe completarse antes de las 21:30 el primer
                    día y hasta las 21:45 el segundo día. Los expositores pueden
                    dejar sus stands montado el primer día para ahorrar tiempo
                    de montaje en el segundo día.
                  </li>
                </ul>
                <p className="mt-4">
                  No llegar a tiempo o tener montado el stand hasta la hora
                  indicada puede resultar en penalizaciones para participaciones
                  futuras.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger className="text-lg md:text-xl font-semibold">
                5. Código de Conducta
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
                  <li>
                    Tengan todo contenido +18 censurado y comercializado con
                    solicitud previa.
                  </li>
                  <li>
                    Se abstengan de cualquier comportamiento que pueda causar
                    incomodidad, miedo o daño a otros.
                  </li>
                  <li>
                    No participen en ninguna forma de acoso, discriminación o
                    comportamiento amenazante tanto dentro como fuera de los
                    festivales.
                  </li>
                  <li>
                    No posean ni usen sustancias ilegales. Ni se encuentren en
                    el evento bajo la influencia del alcohol o de sustancias
                    ilegales.
                  </li>
                  <li>
                    Mantengan un área de stand limpia y segura durante todo el
                    festival.
                  </li>
                </ul>
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
                    Cualquier actividad que viole las leyes o regulaciones
                    locales
                  </li>
                </ul>
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
                        Cada expositor se compromete a mantener la estética de
                        su stand.
                      </li>
                    </ul>
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
                8. Información de Contacto
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

        {isProfileInFestival(props.festival.id, props.profile) ? (
          <>
            <div className="rounded-md border p-4">
              Gracias por aceptar los términos y condiciones. Para hacer tu
              reserva haz clic en el botón de abajo.
            </div>
            <div className="flex justify-end mt-4">
              <RedirectButton
                href={`/profiles/${props.profile.id}/festivals/${props.festival.id}/reservations/new`}
              >
                Completar mi reserva
              </RedirectButton>
            </div>
          </>
        ) : (
          <TermsForm festival={props.festival} profile={props.profile} />
        )}
      </div>
    </div>
  );
}
