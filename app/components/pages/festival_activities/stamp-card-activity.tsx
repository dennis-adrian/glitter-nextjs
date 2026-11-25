import Image from "next/image";

import { InfoIcon } from "lucide-react";

import { BaseProfile } from "@/app/api/users/definitions";
import Heading from "@/app/components/atoms/heading";
import EnrollRedirectButton from "@/app/components/festivals/festival_activities/enroll-redirect-button";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import {
  FestivalActivityWithDetailsAndParticipants,
  FestivalBase,
} from "@/app/lib/festivals/definitions";
import { formatDate, formatDisplayDate } from "@/app/lib/formatters";

/** Price of one card at the Glitter stand, in Bs. */
const CARD_PRICE_BS = 15;
/** Cards printed for this edition. */
const CARD_UNITS = 80;
/**
 * Why participants stamp without asking for a purchase. The paragraph is not
 * rendered while this is null.
 * TODO: write the reason before the activity opens for registration.
 */
const NO_MINIMUM_PURCHASE_REASON: string | null = null;

type StampCardActivityPageProps = {
  currentProfile: BaseProfile;
  forProfile: BaseProfile;
  activity: FestivalActivityWithDetailsAndParticipants;
  festivalId: FestivalBase["id"];
};

export default function StampCardActivityPage({
  activity,
  currentProfile,
  forProfile,
  festivalId,
}: StampCardActivityPageProps) {
  const registrationStart = formatDate(activity.registrationStartDate);
  const registrationEnd = formatDate(activity.registrationEndDate);
  const proofUploadLimitDate = activity.proofUploadLimitDate
    ? formatDate(activity.proofUploadLimitDate)
    : null;

  const participationLimit = activity.details.reduce(
    (sum, d) => sum + (d.participationLimit ?? 0),
    0,
  );

  const dateTimeFormat = {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  } as const;

  return (
    <div className="flex flex-col gap-4">
      <Heading>{activity.name}</Heading>
      <p className="text-sm md:text-base">
        Esta es una actividad que invita al público a recorrer los stands de los
        participantes para completar con sus sellos una tarjeta coleccionable
        con un diseño exclusivo de esta edición del festival.
      </p>

      <div className="flex flex-col gap-4">
        <div>
          <Heading level={2}>¿En qué consiste la actividad?</Heading>
          <div className="mt-3">
            {activity.promotionalArtUrl && (
              <figure className="w-full max-w-[300px] md:max-w-[360px] mx-auto md:mx-0 md:float-left md:mr-4 md:mb-2">
                {/*
                  The art can come in any proportions, so it keeps its own
                  aspect ratio instead of filling a fixed box: width 0/height 0
                  plus w-full/h-auto sizes it to the column at its natural
                  ratio. Art taller than the max height is scaled down with
                  object-contain, never cropped. There is no blur placeholder:
                  with no known dimensions the image has no height until it
                  loads, so a blur would never show.
                */}
                <Image
                  className="h-auto w-full max-h-[480px] object-contain"
                  src={activity.promotionalArtUrl}
                  alt="arte promocional de la actividad"
                  width={0}
                  height={0}
                  sizes="(min-width: 768px) 360px, 300px"
                  // Above the fold and usually the page's largest element.
                  loading="eager"
                />
                <figcaption className="text-center text-sm text-muted-foreground italic mt-1 mb-2">
                  Arte promocional
                </figcaption>
              </figure>
            )}
            <div className="space-y-2">
              <p className="text-sm md:text-base">
                Los visitantes podrán comprar la tarjeta en el stand de Glitter
                por <strong>{CARD_PRICE_BS}Bs</strong>. Sólo habrá{" "}
                <strong>{CARD_UNITS} tarjetas</strong> disponibles.
              </p>
              <p className="text-sm md:text-base">
                Con la tarjeta en mano, los visitantes buscarán en el mapa del
                sitio web a los participantes de la actividad, que tendrán un
                distintivo en su stand, y pasarán por cada uno para conseguir su
                sello. Quienes completen todos los sellos de la tarjeta podrán
                reclamar el premio de la actividad.
              </p>
              <p className="text-sm md:text-base">
                {participationLimit > 0 ? (
                  <>
                    Habilitaremos <strong>{participationLimit} cupos</strong>,
                    uno por cada espacio de la tarjeta.
                  </>
                ) : (
                  "Habilitaremos cupos limitados, uno por cada espacio de la tarjeta."
                )}{" "}
                Cada participante deberá subir el diseño de su sello al sitio
                web para su revisión. El diseño debe ser apto para todo público,
                es decir, no puede contener contenido sexual, violento u
                ofensivo.
              </p>
            </div>
            <div className="clear-both" />
          </div>
        </div>

        {activity.activityPrizeUrl && (
          <div className="flex flex-col gap-2 w-full items-center my-3">
            <Heading level={3}>Premio de la actividad</Heading>
            <div className="w-full max-w-[240px] md:max-w-[320px]">
              {/* Same as the promotional art: natural aspect ratio, never cropped. */}
              <Image
                className="h-auto w-full max-h-[360px] md:max-h-[420px] object-contain"
                src={activity.activityPrizeUrl}
                alt="premio de la actividad"
                width={0}
                height={0}
                sizes="(min-width: 768px) 320px, 240px"
                // On desktop it can reach the first screen and outsize wide,
                // short art, making it the page's largest element.
                loading="eager"
              />
            </div>
          </div>
        )}
      </div>

      <Alert>
        <InfoIcon className="w-4 h-4" />
        <AlertTitle>Sin compra mínima</AlertTitle>
        <AlertDescription>
          <p>
            Para poner tu sello en la tarjeta de un visitante{" "}
            <strong>no podés exigir una compra mínima</strong>. Todo visitante
            que se acerque a tu stand con la tarjeta debe recibir tu sello.
          </p>
          {NO_MINIMUM_PURCHASE_REASON && (
            <p className="mt-2">{NO_MINIMUM_PURCHASE_REASON}</p>
          )}
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3">
        <Heading level={2}>Fechas clave</Heading>
        <dl className="flex flex-col gap-2 text-sm md:text-base">
          <div>
            <dt className="font-semibold">Inscripción a la actividad</dt>
            <dd>
              Del {formatDisplayDate(registrationStart, dateTimeFormat)} al{" "}
              {formatDisplayDate(registrationEnd, dateTimeFormat)}
            </dd>
          </div>
          {proofUploadLimitDate && (
            <div>
              <dt className="font-semibold">Subida del diseño del sello</dt>
              <dd>
                Hasta el{" "}
                {formatDisplayDate(proofUploadLimitDate, dateTimeFormat)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="flex flex-col gap-3">
        <Heading level={2}>Condiciones para participar de la actividad</Heading>
        <ol className="ml-2 list-decimal list-inside space-y-2 text-sm md:text-base">
          <li>Tener una reserva confirmada para el festival.</li>
          <li>
            Inscribirse a la actividad con el botón de inscripción que se
            encuentra al final de la página dentro del periodo de inscripción.{" "}
            {participationLimit > 0 ? (
              <>
                El cupo es de{" "}
                <strong>{participationLimit} participantes</strong>.
              </>
            ) : (
              "El cupo es limitado."
            )}
          </li>
          <li>
            Tener un sello con un diseño original, que deberás tener en tu stand
            todos los días del festival. Un sello de una edición pasada también
            es válido.
          </li>
          <li>
            Subir el diseño del sello al sitio web hasta la fecha límite para
            que la organización lo revise. El diseño debe ser apto para todo
            público.
          </li>
          <li>
            Sellar la tarjeta de todo visitante que la presente, sin exigir una
            compra mínima.
          </li>
          <li>
            Tratar con respeto a todos los expositores y público asistente
            participantes de la actividad. Ante cualquier inconveniente,
            reportarlo inmediatamente a la organización del festival.
          </li>
        </ol>
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
