import { fetchUserProfileById } from "@/app/api/users/actions";
import { BaseProfile } from "@/app/api/users/definitions";
import ActivityDetails from "@/app/components/festivals/festival_activities/activity-details";
import { fetchFullFestivalById } from "@/app/lib/festival_sectors/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { DateTime } from "luxon";
import Image from "next/image";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  profileId: z.coerce.number(),
  festivalId: z.coerce.number(),
});

type EnrollPageProps = {
  params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: EnrollPageProps) {
  const validatedParams = ParamsSchema.safeParse(await params);
  if (!validatedParams.success) {
    return notFound();
  }

  const { profileId, festivalId } = validatedParams.data;

  const currentProfile = await getCurrentUserProfile();
  const festival = await fetchFullFestivalById(festivalId);
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

  const activity = festival?.festivalActivities.find(
    (activity) => activity.name === "Sticker-Print",
  );

  if (!activity) {
    return notFound();
  }

  const now = DateTime.now();
  const startDate = DateTime.fromJSDate(activity.registrationStartDate);
  const endDate = DateTime.fromJSDate(activity.registrationEndDate);

  if ((now < startDate || now > endDate) && currentProfile?.role !== "admin") {
    return (
      <div className="container p-4 md:p-6">
        <h1 className="text-3xl font-bold mb-2">
          Inscripción al Sticker-Print
        </h1>
        <p className="text-muted-foreground">
          El registro para la actividad del Sticker-Print no está disponible en
          este momento.
        </p>
      </div>
    );
  }

  const enrolledDesign = activity.details.find((detail) =>
    detail.participants.some(
      (participant) => participant.userId === forProfile?.id,
    ),
  );

  if (enrolledDesign) {
    const proofs = enrolledDesign.participants.find(
      (participant) => participant.userId === forProfile?.id,
    )?.proofs;

    const hasUploadedProof = proofs && proofs.length > 0;

    return (
      <div className="container p-4 md:p-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-1">Sticker-Print</h1>
        <p className="text-sm md:text-base mb-2 md:mb-4">
          Muchas gracias por inscribirte a la actividad del Sticker-Print. Toma
          nota de los siguientes detalles:
        </p>
        <ul className="list-disc list-inside text-sm md:text-base">
          <li>
            La posición en la que irá tu sticker en el sticker-print es la
            número{" "}
            <strong>
              {enrolledDesign.participants.findIndex(
                (participant) => participant.userId === forProfile?.id,
              ) + 1}
              .
            </strong>
          </li>
          <li>
            El diseño que elegiste es el siguiente:
            {enrolledDesign.imageUrl && (
              <div className="flex flex-col gap-1 justify-center items-center">
                <Image
                  className="mx-auto mt-2 md:mt-4"
                  src={enrolledDesign.imageUrl}
                  alt={`Sticker Print ${enrolledDesign.id}`}
                  width={300}
                  height={480}
                />
                <p className="text-muted-foreground text-sm">
                  {enrolledDesign.participants
                    .map((participant) => {
                      const name = participant.user.displayName;
                      const position =
                        enrolledDesign.participants.findIndex(
                          (p) => p.userId === participant.userId,
                        ) + 1;

                      return `${position}. ${name}`;
                    })
                    .join(", ")}
                </p>
              </div>
            )}
          </li>
        </ul>

        {hasUploadedProof && (
          <div className="flex flex-col gap-3 mt-6 w-full">
            <h2 className="text-lg font-bold">
              {proofs.length > 1 ? "Diseños subidos" : "Diseño subido"}
            </h2>
            <div className="flex flex-wrap gap-4 justify-center items-center">
              {proofs.map((proof) => (
                <div key={proof.id} className="relative w-44 h-44">
                  <Image
                    className="object-cover rounded-md"
                    src={proof.imageUrl}
                    alt={`Proof ${proof.id}`}
                    fill
                    sizes="100vw"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 mt-6">
          <h2 className="text-lg font-bold">Condiciones</h2>
          <ul className="ml-4 list-disc list-inside">
            <li>
              Luego de haber seleccionado el diseño y haberse inscrito en la
              actividad, no se podrá cambiar de diseño.
            </li>
            <li>
              El ilustrador debe diseñar un sticker exclusivo para la actividad
              el cual deberá medir 4cm x 4cm sin excepción.
            </li>
            <li>
              El sticker deberá tener una paleta de color acorde al diseño del
              print seleccionado.
            </li>
            <li>
              El diseño del sticker debe ser apto para todo público, es decir,
              no puede contener contenido sexual, violento, o que pueda ser
              ofensivo.
            </li>
            <li>
              El ilustrador deberá subir el diseño de su sticker al sitio web en
              formato PNG con un tamaño máximo de 2MB hasta el miércoles 9 de
              abril a las 18:00hs. (Esta opción no se encuentra disponible en
              este momento pero se comunicará los ilustradores cuando esté
              disponible).
            </li>
            <li>
              El ilustrador se hará cargo de la impresión y la venta o
              distribución de sus propios stickers.
            </li>
            <li>
              El ilustrador es libre de elegir la dinámica con la cual otorgará
              los stickers coleccionables. En caso de venderlos, el precio
              máximo por sticker será de 5Bs.
            </li>
            <li>
              La cantidad mínima de stickers coleccionables que el ilustrador
              deberá tener disponibles designados exclusivamente para la
              actividad será de 40 unidades.
            </li>
            <li>
              El ilustrador se compromete a tener sus stickers coleccionables
              listos para el primer día del evento: sábado 12 de abril.
            </li>
            <li>
              El ilustrador comprende que la venta de cada diseño de
              Sticker-Print depende de la demanda del público asistente y que no
              es responsabilidad de la organización del festival.
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return (
		<div className="container p-4 md:p-6">
			<h1 className="text-xl md:text-2xl font-bold mb-1">
				Inscripción al Sticker-Print
			</h1>
			<p className="text-muted-foreground text-sm md:text-base mb-2 md:mb-4">
				Selecciona una imagen para elegir el diseño para participar en la
				actividad del Sticker-Print.
			</p>
			<ActivityDetails
				activity={activity}
				user={forProfile}
				festival={festival}
			/>
		</div>
	);
}
