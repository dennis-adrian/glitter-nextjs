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
import { formatDate } from "@/app/lib/formatters";

type StickerHuntActivityPageProps = {
  currentProfile: BaseProfile;
  forProfile: BaseProfile;
  activity: FestivalActivityWithDetailsAndParticipants;
  festivalId: FestivalBase["id"];
};

export default function StickerHuntActivityPage({
  activity,
  currentProfile,
  forProfile,
  festivalId,
}: StickerHuntActivityPageProps) {
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
        La Cacería de Stickers es una actividad que invita al público del evento
        a recorrer los stands para coleccionar stickers diseñados por los
        ilustradores participantes.
      </p>

      <div className="flex flex-col gap-4">
        <div>
          <Heading level={2}>¿En qué consiste la actividad?</Heading>
          <div className="mt-3">
            {activity.promotionalArtUrl && (
              <figure className="w-full max-w-[240px] md:max-w-[300px] mx-auto md:mx-0 md:float-left md:mr-4 md:mb-2">
                <div className="relative w-full aspect-3/4 rounded-md overflow-hidden">
                  <Image
                    className="object-cover"
                    src={activity.promotionalArtUrl}
                    alt="arte promocional de la actividad"
                    fill
                    placeholder="blur"
                    blurDataURL="/img/placeholders/placeholder-300x300.png"
                  />
                </div>
                <figcaption className="text-center text-sm text-muted-foreground italic mt-1 mb-2">
                  Arte promocional
                </figcaption>
              </figure>
            )}
            <div className="space-y-2">
              <p className="text-sm md:text-base">
                Los visitantes podrán comprar en el stand de Glitter durante el
                evento o como pre-venta en el sitio web el libro de stickers del
                festival, que cuenta con papel especial donde pegar y despegar
                stickers con facilidad para coleccionarlos. Sólo habrá 100
                unidades disponibles.
              </p>
              <p className="text-sm md:text-base">
                Esta actividad es exclusiva para ilustradores y{" "}
                {participationLimit > 0 ? (
                  <>
                    habilitaremos <strong>{participationLimit} cupos</strong>
                  </>
                ) : (
                  "habilitaremos cupos limitados"
                )}
                . Los ilustradores que participen en la actividad tendrán un
                distintivo en el mapa del sitio web para que los visitantes
                puedan reconocerlos y pasar por sus stands en busca de sus
                stickers. Los visitantes que consigan{" "}
                <strong>10 stickers</strong> distintos podrán reclamar el premio
                de la actividad.
              </p>
              <p className="text-sm md:text-base">
                Cada ilustrador participante deberá subir el diseño de su
                sticker al sitio web para su revisión. El diseño debe ser apto
                para todo público, es decir, no puede contener contenido sexual,
                violento u ofensivo. Si no es aprobado, te avisaremos para que
                lo corrijas o si tenemos otros participantes en espera, podrías
                directamente ser removido de la actividad.{" "}
                <strong>
                  No es necesario crear un nuevo diseño de sticker
                </strong>{" "}
                para la actividad. Un diseño ya existente en tu catálogo es
                válido.
              </p>
            </div>
            <div className="clear-both" />
          </div>
        </div>

        {activity.activityPrizeUrl && (
          <div className="flex flex-col gap-2 w-full items-center my-3">
            <Heading level={3}>Premio de la actividad</Heading>
            <div className="relative w-full max-w-[240px] md:max-w-[320px] aspect-square">
              <Image
                className="object-cover"
                src={activity.activityPrizeUrl}
                alt="premio de la actividad"
                fill
                placeholder="blur"
                blurDataURL="/img/placeholders/placeholder-300x300.png"
              />
            </div>
          </div>
        )}
      </div>

      <Alert>
        <InfoIcon className="w-4 h-4" />
        <AlertTitle>Antes de inscribirte</AlertTitle>
        <AlertDescription>
          Los visitantes solo necesitan recolectar{" "}
          <strong>
            10 stickers
            {participationLimit > 0
              ? ` de los ${participationLimit} posibles`
              : ""}
          </strong>{" "}
          para reclamar el premio. Esto significa que{" "}
          <strong>no todos los visitantes</strong> pasarán por tu stand a buscar
          tu sticker. Tomá esto en cuenta al estimar cuántas unidades vas a
          vender.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3">
        <Heading level={2}>Fechas clave</Heading>
        <dl className="flex flex-col gap-2 text-sm md:text-base">
          <div>
            <dt className="font-semibold">Inscripción a la actividad</dt>
            <dd>
              Del {registrationStart.toLocaleString(dateTimeFormat)} al{" "}
              {registrationEnd.toLocaleString(dateTimeFormat)}
            </dd>
          </div>
          {proofUploadLimitDate && (
            <div>
              <dt className="font-semibold">Subida del diseño del sticker</dt>
              <dd>
                Hasta el {proofUploadLimitDate.toLocaleString(dateTimeFormat)}
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
            Participar con <strong>un solo diseño de sticker</strong>.
          </li>
          <li>
            Subir el diseño del sticker al sitio web hasta la fecha límite para
            que la organización lo revise. El diseño debe ser apto para todo
            público.
          </li>
          <li>
            Tener disponibles como mínimo <strong>30 unidades</strong> de tu
            sticker para ambos días del festival.
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
