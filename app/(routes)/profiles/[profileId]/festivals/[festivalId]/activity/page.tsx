import { fetchUserProfileById } from "@/app/api/users/actions";
import { BaseProfile } from "@/app/api/users/definitions";
import EnrollRedirectButton from "@/app/components/festivals/festival_activities/enroll-redirect-button";
import { RedirectButton } from "@/app/components/redirect-button";
import { getFestivalById } from "@/app/lib/festivals/helpers";
import { formatDate } from "@/app/lib/formatters";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { DateTime } from "luxon";
import Image from "next/image";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchems = z.object({
  profileId: z.coerce.number(),
  festivalId: z.coerce.number(),
});

type ParticipantsActivityPageProps = {
  params: Promise<z.infer<typeof ParamsSchems>>;
};

export default async function ParticipantsActivityPage({
  params,
}: ParticipantsActivityPageProps) {
  const { profileId, festivalId } = await params;
  const validatedParams = ParamsSchems.safeParse({
    profileId,
    festivalId,
  });

  if (!validatedParams.success) {
    return notFound();
  }

  const festival = await getFestivalById(festivalId);
  const currentProfile = await getCurrentUserProfile();
  await protectRoute(currentProfile || undefined, Number(profileId));

  let forProfile: BaseProfile | null | undefined;

  if (profileId === currentProfile?.id) {
    forProfile = currentProfile;
  } else {
    forProfile = await fetchUserProfileById(profileId);
  }

  if (!forProfile || !festival) {
    return notFound();
  }

  const activity = festival.festivalActivities.find(
    (activity) => activity.name === "Sticker-Print",
  );

  if (!activity) {
    return notFound();
  }

  return (
    <div className="container p-4 md:p-6">
      <h1 className="text-2xl font-bold my-3">Sticker-Print</h1>
      <div className="flex flex-col gap-3 mt-6">
        <h2 className="text-lg font-bold">¿Qué es el Sticker-Print?</h2>
        <p>
          El Sticker-Print es una actividad en la cual incentivaremos al público
          asistente del evento a coleccionar stickers.
        </p>
        <p>
          Como artistas/ilustradores, sabemos que el potencial de los stickers
          es enorme y como Productora Glitter, queremos que nuestro público
          también lo vea.
        </p>
      </div>
      <div className="flex flex-col gap-3 mt-6">
        <h2 className="text-lg font-bold">¿Cómo funciona?</h2>
        <p>
          Tendremos 4 diseños distintos de prints tamaño doble oficio que los
          asistentes del evento podrán adquirir en el stand de Glitter al
          ingresar al festival por un valor de 15Bs. En total se imprimirán 120
          Sticker-Prints, lo que equivale a 40 unidades de cada diseño.
        </p>
        <p>
          Cada diseño de print tendrá espacio para pegar 9 stickers
          coleccionables:
        </p>
        <ul className="ml-4 list-disc list-inside">
          <li>
            8 espacios estarán disponibles para los distintos ilustradores que
            se inscriban a la actividad. Cada ilustrador deberá diseñar un
            sticker exclusivo para el Sticker-Print.
          </li>
          <li>
            El 9no espacio estará reservado para la Productora Glitter que
            entregará un sticker coleccionable como premio a quienes completen
            la actividad.
          </li>
        </ul>
        <p>
          Al ser 4 diseños, en total podremos contar con la participación de 32
          ilustradores distintos.
        </p>
        <p>
          Los asistentes que compren el Sticker-Print deberán recorrer el
          festival para encontrar a los ilustradores que forman parte de su
          diseño de print y adquirir los stickers coleccionables para pegar en
          los espacios asignados.
        </p>
      </div>
      <div className="flex flex-col gap-3 mt-6">
        <h2 className="font-semibold">Diseños de Sticker-Print</h2>
        <p>Estos son los 4 diseños disponibles para participar:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mx-auto">
          {activity.details.map((detail) => (
            <div key={detail.id} className="">
              <Image
                className="mx-auto"
                // TODO: Add a blur image when loading and a skeleton
                src={detail.imageUrl ?? ""}
                alt="Sticker Print Example"
                width={320}
                height={480}
              />
              <p className="text-center text-muted-foreground text-sm">
                Medidas: 432 mm x 330 mm
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 mt-6">
        <h2 className="text-lg font-bold">¿Cómo se puede participar?</h2>
        <p>
          Luego de leer las condiciones de participación, debes darle clic al
          botón de &quot;Registrarme&quot; que te llevará a una pantalla donde
          podrás seleccionar el diseño del print en el que deseas participar.
        </p>
      </div>
      <div className="flex flex-col gap-3 mt-6">
        <h2 className="text-lg font-bold">Condiciones:</h2>
        <ul className="ml-4 list-disc list-inside">
          <li>
            El ilustrador solo puede ser parte de un diseño de Sticker-Print
          </li>
          <li>
            Luego de haber seleccionado el diseño y haberse inscrito en la
            actividad, no se podrá cambiar de diseño.
          </li>
          <li>
            El ilustrador debe diseñar un sticker exclusivo para la actividad el
            cual deberá medir 4cm x 4cm sin excepción.
          </li>
          <li>
            El sticker deberá tener una paleta de color acorde al diseño del
            print seleccionado.
          </li>
          <li>
            El diseño del sticker debe ser apto para todo público, es decir, no
            puede contener contenido sexual, violento, o que pueda ser ofensivo.
          </li>
          <li>
            El ilustrador deberá subir el diseño de su sticker al sitio web en
            formato PNG con un tamaño máximo de 2MB hasta el miércoles 9 de
            abril a las 18:00hs. (Esta opción no se encuentra disponible en este
            momento pero se comunicará los ilustradores cuando esté disponible).
          </li>
          <li>
            El ilustrador se hará cargo de la impresión y la venta o
            distribución de sus propios stickers.
          </li>
          <li>
            El ilustrador es libre de elegir la dinámica con la cual otorgará
            los stickers coleccionables. En caso de venderlos, el precio máximo
            por sticker será de 5Bs.
          </li>
          <li>
            La cantidad mínima de stickers coleccionables que el ilustrador
            deberá tener disponibles designados exclusivamente para la actividad
            será de 40 unidades.
          </li>
          <li>
            El número de espacio que el ilustrador ocupe en el diseño del
            Sticker-Print que elija será asignado por la organización del
            festival.
          </li>
          <li>
            La fecha límite para inscribirse a la actividad es el domingo 6 de
            abril a las 18:00hs.
          </li>
          <li>
            En caso de que un diseño de Sticker-Print no cumpla con la cantidad
            mínima de participantes, podrá ser retirado de la actividad lo cual
            se comunicará hasta el lunes 7 de abril.
          </li>
          <li>
            El ilustrador se compromete a tener sus stickers coleccionables
            listos para el primer día del evento: sábado 12 de abril.
          </li>
          <li>
            El ilustrador comprende que la venta de cada diseño de Sticker-Print
            depende de la demanda del público asistente y que no es
            responsabilidad de la organización del festival.
          </li>
        </ul>
      </div>
      <div className="bg-amber-50 border border-amber-100 rounded-md p-4 mt-4 text-amber-800">
        <p className="text-sm">
          Una vez inscrito a la actividad, el ilustrador se compromete a cumplir
          con todas estas condiciones. En caso de incumplimiento, el ilustrador
          podría perder el derecho a participar en futuros eventos.
        </p>
      </div>
      <EnrollRedirectButton
        forProfileId={forProfile.id}
        festivalId={festival.id}
        activity={activity}
      />
    </div>
  );
}
