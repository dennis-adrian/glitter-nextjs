import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import GeneralInfoDetails from "@/app/components/festivals/general-info-details";
import TermsForm from "@/app/components/festivals/terms-form";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { RedirectButton } from "@/app/components/redirect-button";
import { Separator } from "@/app/components/ui/separator";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { getStandUrlByCategory } from "@/app/lib/payments/helpers";
import { DateTime } from "luxon";
import Image from "next/image";
import Link from "next/link";

export default function Terms({
  profile,
  festival,
  category,
}: {
  festival: FestivalWithDates;
  profile: ProfileType;
  category: Exclude<UserCategory, "none">;
}) {
  const mapCategory = category === "new_artist" ? "illustration" : category;
  const standImageSrc = getStandUrlByCategory(festival, mapCategory);
  const userCategory = category === "new_artist" ? "illustration" : category;
  // const mascotImageSrc = imagesSrc[festival.mapsVersion][category]["mascot"];

  return (
    <div className="container p-4 md:p-6 max-w-screen-lg">
      <h1 className="font-bold text-3xl my-4">
        Información para {getCategoryOccupationLabel(mapCategory)}
      </h1>
      {/* {mascotImageSrc && (
        <Image
          className="mx-auto"
          alt="Mascota de la categoría"
          src={mascotImageSrc}
          width={320}
          height={200}
        />
      )} */}
      <h2 className="font-bold text-2xl my-4">Términos y condiciones</h2>
      <section>
        <p>
          A continuación te presentamos las bases para el{" "}
          <strong>
            Festival{" "}
            {festival.festivalType === "glitter" ? "Glitter" : "Twinkler"}
          </strong>
          . Para evitar malentendidos a futuro, debes de leer con atención{" "}
          <strong>antes</strong> de continuar.
        </p>
        <p>
          Al darle al botón &quot;<strong>¡Quiero reservar!</strong>&quot; estás
          aceptando los términos y condiciones aquí expresadas
        </p>
        <br />
        <h3 className="font-semibold text-lg my-2">Información General</h3>
        <div>
          <GeneralInfoDetails festival={festival} />
        </div>
        <br />
        <h3 className="font-semibold text-lg my-2">Espacios</h3>
        <ul className="leading-7 list-disc list-inside">
          {userCategory === "gastronomy" ? (
            <li>El espacio del expositor mide 1 metro x 60cm.</li>
          ) : (
            <li>El espacio del expositor mide 120cm x 60cm (media mesa)</li>
          )}
          <li>Cada espacio incluye 2 (dos) sillas.</li>
          <li>
            El espacio no incluye mantel, el expositor es responsable de llevar
            un mantel.
          </li>
        </ul>
        {standImageSrc && (
          <figure className="text-center text-muted-foreground text-sm mx-auto max-w-[320px]">
            <Image
              alt="Imagen del espacio en el evento"
              src={standImageSrc}
              width={320}
              height={320}
            />
            <figcaption>
              El costo del espacio corresponde a la duración total del evento
            </figcaption>
          </figure>
        )}
        <br />
        {userCategory === "illustration" && (
          <p>
            Se permite compartir espacio con otro ilustrador siempre y cuando se
            cumplan con los siguientes puntos:
          </p>
        )}
        <ul className="leading-7 list-inside list-disc">
          {userCategory === "illustration" ? (
            <>
              <li>
                El Ilustrador con el que se compartirá mesa debe de tener su
                cuenta en el sitio web y su perfil debe de haber sido
                verificado. Si ha participado del festival anterior, este paso
                lo tiene completado.
              </li>
              <li>
                La reserva del espacio la hace únicamente una persona, la cual
                debe agregar el nombre de su compañero de espacio al momento de
                hacer la reserva.
              </li>
              <li>
                Ambos expositores deben estar categorizados como
                &quot;ilustrador&quot;.
              </li>
              <li>
                Compartir espacio con otro ilustrador implica la responsabilidad
                de ambas partes de estar presentes el día del evento.
              </li>
              <li>
                Si en el transcurso que se abona el espacio hasta el evento, una
                de las partes no puede participar, el otro ilustrador deberá
                hacerse cargo de ocupar el espacio, sin posibilidades de
                reemplazar al ilustrador que se dio de baja por otro.
              </li>
              <li>
                No pueden incluirse personas adicionales para trabajar en el
                espacio. Máximo dos personas por espacio (incluyendo el
                artista/los artistas).
              </li>
            </>
          ) : (
            <li>El expositor puede llevar máximo un acompañante.</li>
          )}
          <li>No estaremos brindando sillas adicionales a espacio.</li>
          {/* TODO: Think of a better way to handle this point for future festivals */}
          <li>
            No está permitido colocar nada <strong>fuera</strong> de la mesa que
            obstruya el paso de la gente (por ejemplo: sillas, cubos,
            percheros). Si tu caso es particular, comunícate con{" "}
            <Link
              href="mailto:soporte@productoraglitter.com"
              style={{
                color: "#15c",
                textDecoration: "underline",
              }}
            >
              soporte@productoraglitter.com
            </Link>
          </li>
        </ul>
        <br />
        <Separator />
        <br />
        <h3 className="font-semibold text-lg my-2">Abono de los espacios</h3>
        <ul className="leading-7 list-inside list-disc">
          <li>
            Los espacios se abonan a partir del{" "}
            <strong>
              {formatDate(festival.reservationsStartDate).toLocaleString({
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </strong>
            .
          </li>
          <li>
            El pago se realiza mediante QR el cual lo pueden descargar al
            momento de hacer la reserva.
          </li>
          <li>
            Todos los espacios se abonan en su totalidad por adelantado, sin
            excepción.
          </li>
          <li>
            A partir del momento en el que se realice la reserva, el expositor
            tendrá 5 días hábiles para realizar el pago total del costo del
            espacio. Sin embargo, para cualquier reserva hecha después del{" "}
            <strong>
              {formatDate(festival.festivalDates[0].startDate)
                .minus({ days: 10 })
                .toLocaleString({
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
            </strong>
            , el pago deberá ser realizado en el momento de la reserva.
          </li>
          <li>
            Después de la fecha límite si el expositor no sube el comprobante de
            pago, la reserva se borra del mapa.
          </li>
          <li>
            Tener en cuenta que, si el expositor no asiste o no puede asistir el
            día del evento, el importe del espacio no se devuelve ni total ni
            parcialmente, así como tampoco queda a cuenta de futuros eventos.
          </li>
        </ul>
        <br />
        <Separator />
        <br />
        <h3 className="font-semibold text-lg my-2">
          Horario de armado y desarmado
        </h3>
        <p>El armado de espacio será: </p>
        <ul className="leading-7 list-inside list-disc">
          {festival.festivalDates.map((date, index) => (
            <li key={index}>
              <span className="capitalize">
                {formatDate(date.startDate).weekdayLong}
              </span>{" "}
              de{" "}
              {formatDate(date.startDate)
                .minus({ hour: 1 })
                .toLocaleString(DateTime.TIME_24_SIMPLE)}{" "}
              a{" "}
              {formatDate(date.startDate).toLocaleString(
                DateTime.TIME_24_SIMPLE,
              )}
            </li>
          ))}
        </ul>
        <p>
          El ingreso{" "}
          {festival.festivalType === "glitter" ? "del teatro" : "a la galería"}{" "}
          queda sobre la calle Sucre, para poder ingresar deben hacer una fila
          ordenada.{" "}
          <strong>
            Nadie puede ingresar al recinto antes de los horarios especificados
            anteriormente
          </strong>
          .
        </p>
        <p>
          Todos los espacios deben estar listos para recibir al público en el
          siguiente horario:
        </p>
        <ul className="leading-7 list-inside list-disc">
          {festival.festivalDates.map((date, index) => (
            <li key={index}>
              <span className="capitalize">
                {formatDate(date.startDate).weekdayLong}
              </span>{" "}
              a las{" "}
              {formatDate(date.startDate).toLocaleString(
                DateTime.TIME_24_SIMPLE,
              )}
            </li>
          ))}
        </ul>
        <p>El desarme de espacios se debe hacer en los siguientes horarios:</p>
        <ul className="leading-7 list-inside list-disc">
          {festival.festivalDates.map((date, index) => (
            <li key={index}>
              <span className="capitalize">
                {formatDate(date.endDate).weekdayLong}
              </span>{" "}
              de{" "}
              {formatDate(date.endDate).toLocaleString(DateTime.TIME_24_SIMPLE)}{" "}
              a{" "}
              {formatDate(date.endDate)
                .plus({ minutes: 45 })
                .toLocaleString(DateTime.TIME_24_SIMPLE)}
            </li>
          ))}
        </ul>
        <br />
        <Separator />
        <br />
        <h3 className="font-semibold text-lg my-2">Importante</h3>
        <ul className="leading-7 list-inside list-disc">
          {mapCategory === "gastronomy" && (
            <li>
              Los productos que el expositor ofrezca a la venta deben estar
              previamente preparados. No se permite el uso de garrafas o
              cualquier artefacto que provoque fuego.
            </li>
          )}
          <li>Todos los espacios son con reserva previa de ubicación.</li>
          <li>
            Ningún espacio puede exceder las medidas establecidas por la
            organización. De no cumplir con esta indicación se deberá abonar una
            penalidad equivalente al 100% costo del espacio o retirarse del
            evento.
          </li>
          <li>
            Los expositores que lleguen una vez comenzado el evento no podrán
            ingresar a participar del evento.
          </li>
          <li>
            Todos los participantes del evento incluyendo los que comparten
            espacio, deben de tener una cuenta y perfil creados y aprobados en
            el sitio web oficial.
          </li>
          <li>
            Todos los espacios están numerados y preasignados a los expositores
            al momento de la reserva.
          </li>
          <li>Todos los espacios deben ser abonados antes del evento.</li>
          <li>
            La organización del evento no cuenta con su propia red de Wi-Fi. El
            lugar donde hacemos el evento cuenta con una red propia cuyo
            funcionamiento no podemos garantizar ni hacernos cargo de su
            correcto funcionamiento.
          </li>
          <li>No está permitida la presencia de niños en los espacios.</li>
        </ul>
        <br />
        <Separator />
        <br />
        <h3 className="font-semibold text-lg my-2">Reglas de convivencia</h3>
        <ul className="leading-7 list-inside list-disc">
          <li>
            Queremos que el evento sea un espacio seguro por tanto pedimos
            guardar respeto entre todos.
          </li>
          <li>
            Cada participante es responsable de su espacio y de sus
            pertenencias, así como el mobiliario (mesa y silla/sillas) que le
            fueron entregados.
          </li>
          <li>Deben mantener la limpieza, no tiren basura al suelo.</li>
          <li>No está permitido pegar nada en las paredes.</li>
          <li>
            No se puede hacer cambios de lugar ya que cada espacio ha sido
            previamente elegido por el artista mediante la página web y estarán
            asignados al momento de ingresar a la feria.
          </li>
          <li>
            No está permitido fumar ni en la galería ni en el patio. Esto
            incluye también el uso de vapes. Si desean fumar deben salir del
            establecimiento y hacerlo en la calle.
          </li>
          <li>
            Queda terminantemente prohibido el consumo de bebidas alcohólicas
            y/o estupefacientes en el evento así como no está permitido llegar
            al evento en estado de ebriedad o que demuestre haber hecho uso de
            sustancias. Cualquier artista que viole esta regla será retirado del
            evento y no podrá participar de festival o evento realizado por la
            organización.
          </li>
          {userCategory === "illustration" && (
            <li>
              Es un evento de ilustradores que impulsa a que muestren productos
              de autoría propia.{" "}
              <strong>
                Está prohibido vender material plagiado o imprimir stickers
                sacados de internet.
              </strong>
            </li>
          )}
        </ul>
        <br />
        <Separator />
        <br />
      </section>
      {isProfileInFestival(festival.id, profile) ? (
        <>
          <div className="rounded-md border p-4">
            Gracias por aceptar los términos y condiciones. Ya puedes hacer tu
            reserva haciendo clic en el botón de abajo.
          </div>
          <div className="flex justify-end mt-4">
            <RedirectButton
              href={`/profiles/${profile.id}/festivals/${festival.id}/reservations/new`}
            >
              ¡Ir a reservar!
            </RedirectButton>
          </div>
        </>
      ) : (
        <TermsForm festival={festival} profile={profile} />
      )}
    </div>
  );
}
