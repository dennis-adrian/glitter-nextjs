import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import TermsForm from "@/app/components/festivals/terms-form";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { RedirectButton } from "@/app/components/redirect-button";
import { Separator } from "@/app/components/ui/separator";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { formatDate } from "@/app/lib/formatters";
import { imagesSrc } from "@/app/lib/maps/config";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import Image from "next/image";

export default function Terms({
  profile,
  festival,
  category,
}: {
  festival: FestivalBase;
  profile: ProfileType;
  category: Exclude<UserCategory, "none">;
}) {
  const standImageSrc = imagesSrc[festival.mapsVersion][category]["stand"];
  const mascotImageSrc = imagesSrc[festival.mapsVersion][category]["mascot"];

  return (
    <div className="container p-4 md:p-6 max-w-screen-lg">
      <h1 className="font-bold text-3xl my-4">
        Información para {getCategoryOccupationLabel(category)}
      </h1>
      {mascotImageSrc && (
        <Image
          className="mx-auto"
          alt="Mascota de la categoría"
          src={mascotImageSrc}
          width={320}
          height={200}
        />
      )}
      <h2 className="font-bold text-2xl my-4">Términos y condiciones</h2>
      <section>
        <p>
          A continuación te presentamos las bases para el próximo Festival
          Glitter. Para evitar malentendidos a futuro, debes de leer con
          atención <strong>antes</strong> de continuar.
        </p>
        <p>
          Al darle al botón &quot;<strong>¡Quiero reservar!</strong>&quot; estás
          aceptando los términos y condiciones aquí expresadas
        </p>
        <br />
        <h3 className="font-semibold text-lg my-2">Información General</h3>
        <div>
          <div>
            <strong>Fecha: </strong>
            {getFestivalDateLabel(festival, true).charAt(0).toUpperCase() +
              getFestivalDateLabel(festival, true).slice(1)}
          </div>
          <div>
            <strong>Hora del evento: </strong>
            {festival.startDate.getHours()}hrs a {festival.endDate.getHours()}
            hrs
          </div>
          <div>
            <strong>Lugar: </strong>
            {festival.locationLabel} - {festival.address}
          </div>
        </div>
        <br />
        <h3 className="font-semibold text-lg my-2">Espacios</h3>
        <ul className="leading-7 list-disc list-inside">
          {category === "gastronomy" ? (
            <li>El espacio del expositor mide 1 metro x 60cm.</li>
          ) : (
            <li>El espacio del expositor mide 120cm x 60cm (media mesa)</li>
          )}
          <li>Cada espacio de Ilustrador incluye 2 (dos) sillas.</li>
          <li>
            El espacio no incluye mantel, el expositor es responsable de llevar
            un mantel.
          </li>
        </ul>
        {standImageSrc && (
          <figure className="text-center text-muted-foreground mx-auto max-w-[320px]">
            <Image
              alt="Imagen del espacio en el evento"
              src={standImageSrc}
              width={320}
              height={320}
            />
            <figcaption>
              El costo del espacio corresponde a ambos días del evento
            </figcaption>
          </figure>
        )}
        <br />
        {category === "illustration" && (
          <p>
            Se permite compartir espacio con otro ilustrador siempre y cuando se
            cumplan con los siguientes puntos:
          </p>
        )}
        <ul className="leading-7 list-inside list-disc">
          {category === "illustration" ? (
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
                Ambos expositores deben de ser parte de la categoría
                “ilustrador”
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
              {formatDate(festival.startDate)
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
          <li>Sábado de 9:00 a 10:00</li>
          <li>Domingo de 9:45 a 10:15</li>
        </ul>
        <p>
          El ingreso del teatro queda sobre la calle Sucre, para poder ingresar
          deben hacer una fila ordenada.{" "}
          <strong>
            Nadie puede ingresar al recinto antes de las 9:00 el sábado y antes
            de las 9:45 el domingo
          </strong>
          .
        </p>
        <p>
          El día sábado todos los espacios deben estar listos para recibir al
          público a las 10:00
        </p>
        <p>
          El día domingo todos los espacios deben estar listos para recibir al
          público a las 10:15
        </p>
        <p>El desarme de espacios ambos días es a partir de las 18:00 horas.</p>
        <br />
        <Separator />
        <br />
        <h3 className="font-semibold text-lg my-2">Importante</h3>
        <ul className="leading-7 list-inside list-disc">
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
            evento y no podrá participar de siguientes ediciones de Glitter.
          </li>
          {category === "illustration" && (
            <li>
              Es un evento de ilustradores que impulsa a que muestren productos
              de autoría propia. Está prohibido vender material plagiado o
              imprimir stickers sacados de internet.
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
              href={`/festivals/${festival.id}?category=${category}`}
            >
              ¡Ir al mapa!
            </RedirectButton>
          </div>
        </>
      ) : (
        <TermsForm category={category} festival={festival} profile={profile} />
      )}
    </div>
  );
}
