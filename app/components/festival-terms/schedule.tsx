import { UserCategory } from "@/app/api/users/definitions";
import { Highlight } from "@/app/components/ui/highlight";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { DateTime } from "luxon";

type FestivalTermsScheduleProps = {
  festival: Pick<FestivalWithDates, "festivalType" | "festivalDates">;
  category: Exclude<UserCategory, "none">;
};

export default function FestivalTermsSchedule({
  festival,
  category,
}: FestivalTermsScheduleProps) {
  const mapCategory =
    category === "new_artist" ? "illustration" : category;
  const festivalDates = festival.festivalDates;
  const dayOne = festivalDates[0];
  const dayTwo = festivalDates[1];
  const dayOneStartDate = dayOne ? formatDate(dayOne.startDate) : null;
  const dayOneEndDate = dayOne ? formatDate(dayOne.endDate) : null;
  const dayTwoStartDate = dayTwo ? formatDate(dayTwo.startDate) : null;
  const dayTwoEndDate = dayTwo ? formatDate(dayTwo.endDate) : null;

  return (
    <div className="flex flex-col gap-2">
      <section>
        <h3 className="text-base md:text-lg font-semibold text-foreground font-space-grotesk tracking-wide">
          <Highlight>4.1. Horario de ingreso</Highlight>
        </h3>
        {dayOneStartDate ? (
          <section className="text-sm">
            <h4 className="font-semibold my-2">
              <span className="capitalize">
                {dayOneStartDate.weekdayLong}
              </span>{" "}
              <span>
                {dayOneStartDate.toLocaleString({
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </h4>
            <div className="ml-2 flex flex-col gap-2">
              {mapCategory === "entrepreneurship" && (
                <>
                  <p>
                    Dependiendo del sector en el que hagás tu reserva,
                    tomá en cuenta el siguiente horario:
                  </p>
                  <section className="flex flex-col gap-2">
                    <p>
                      <Highlight>Galería:</Highlight>
                    </p>
                    <p>
                      Los expositores de este sector ingresarán al
                      recinto únicamente{" "}
                      <Highlight>
                        de{" "}
                        {dayOneStartDate
                          .minus({ hour: 1, minutes: 30 })
                          .toLocaleString(
                            DateTime.TIME_24_SIMPLE,
                          )}{" "}
                        a{" "}
                        {dayOneStartDate
                          .minus({ hour: 1 })
                          .toLocaleString(DateTime.TIME_24_SIMPLE)}
                      </Highlight>
                    </p>
                    <p>
                      A las{" "}
                      <span className="font-semibold">
                        {dayOneStartDate
                          .minus({ hour: 1 })
                          .toLocaleString(DateTime.TIME_24_SIMPLE)}
                      </span>{" "}
                      se cerrarán las puertas de ingreso y cualquier
                      expositor que llegue después del horario
                      marcado, tendrá que{" "}
                      <Highlight>
                        hacer cola junto con el público
                      </Highlight>{" "}
                      para ingresar a partir de las{" "}
                      <span className="font-semibold">
                        {dayOneStartDate.toLocaleString(
                          DateTime.TIME_24_SIMPLE,
                        )}
                      </span>
                      . No se harán excepciones.
                    </p>
                    <p>
                      El ingreso será por la puerta del Teatro CBA en
                      la calle Sucre entre calle Cochabamba y calle
                      Potosí
                    </p>
                  </section>
                  <section className="flex flex-col gap-2">
                    <p>
                      <Highlight>Big Apple:</Highlight>
                    </p>
                    <p>
                      Los expositores de este sector ingresarán al
                      recinto únicamente{" "}
                      <Highlight>
                        de{" "}
                        {dayOneStartDate
                          .minus({ hour: 1, minutes: 10 })
                          .toLocaleString(
                            DateTime.TIME_24_SIMPLE,
                          )}{" "}
                        a{" "}
                        {dayOneStartDate
                          .minus({ minutes: 30 })
                          .toLocaleString(DateTime.TIME_24_SIMPLE)}
                      </Highlight>
                    </p>
                    <p>
                      A las{" "}
                      <span className="font-semibold">
                        {dayOneStartDate
                          .minus({ minutes: 30 })
                          .toLocaleString(DateTime.TIME_24_SIMPLE)}
                      </span>{" "}
                      se cerrarán las puertas de ingreso y cualquier
                      expositor que llegue después del horario
                      marcado, tendrá que esperar a que se abran las
                      puertas nuevamente para ingresar a partir de las{" "}
                      <span className="font-semibold">
                        {dayOneStartDate.toLocaleString(
                          DateTime.TIME_24_SIMPLE,
                        )}
                      </span>
                      . No se harán excepciones.
                    </p>
                    <p>
                      El ingreso será por la puerta de la calle
                      Ballivián entre calle Cochabamba y calle Potosí
                    </p>
                  </section>
                </>
              )}
              {mapCategory === "illustration" && (
                <section className="flex flex-col gap-2">
                  <p>
                    Los expositores de la categoría{" "}
                    <Highlight>
                      {getCategoryLabel(mapCategory).toLowerCase()}
                    </Highlight>{" "}
                    ingresarán al recinto únicamente{" "}
                    <Highlight>
                      de{" "}
                      {dayOneStartDate
                        .minus({ hour: 2 })
                        .toLocaleString(DateTime.TIME_24_SIMPLE)}{" "}
                      a{" "}
                      {dayOneStartDate
                        .minus({ hour: 1 })
                        .toLocaleString(DateTime.TIME_24_SIMPLE)}
                    </Highlight>
                  </p>
                  <p>
                    A las{" "}
                    <span className="font-semibold">
                      {dayOneStartDate
                        .minus({ hour: 1 })
                        .toLocaleString(DateTime.TIME_24_SIMPLE)}
                    </span>{" "}
                    se cerrarán las puertas de ingreso y cualquier
                    expositor que llegue después del horario marcado,
                    tendrá que{" "}
                    <Highlight>
                      hacer cola junto con el público
                    </Highlight>{" "}
                    para ingresar a partir de las{" "}
                    <span className="font-semibold">
                      {dayOneStartDate.toLocaleString(
                        DateTime.TIME_24_SIMPLE,
                      )}
                    </span>
                    . No se harán excepciones.
                  </p>
                  <p>
                    El ingreso será por la puerta del Teatro CBA en la
                    calle Sucre entre calle Cochabamba y calle Potosí
                  </p>
                </section>
              )}
              {mapCategory === "gastronomy" && (
                <section className="flex flex-col gap-2">
                  <p>
                    Los expositores de la categoría{" "}
                    <Highlight>
                      {getCategoryLabel(mapCategory).toLowerCase()}
                    </Highlight>{" "}
                    ingresarán al recinto únicamente{" "}
                    <Highlight>
                      de{" "}
                      {dayOneStartDate
                        .minus({ hour: 1, minutes: 10 })
                        .toLocaleString(DateTime.TIME_24_SIMPLE)}{" "}
                      a{" "}
                      {dayOneStartDate
                        .minus({ minutes: 30 })
                        .toLocaleString(DateTime.TIME_24_SIMPLE)}
                    </Highlight>
                  </p>
                  <p>
                    A las{" "}
                    <span className="font-semibold">
                      {dayOneStartDate
                        .minus({ minutes: 30 })
                        .toLocaleString(DateTime.TIME_24_SIMPLE)}
                    </span>{" "}
                    se cerrarán las puertas de ingreso y cualquier
                    expositor que llegue después del horario marcado,
                    tendrá que esperar a que se abran las puertas
                    nuevamente para ingresar a las{" "}
                    <span className="font-semibold">
                      {dayOneStartDate.toLocaleString(
                        DateTime.TIME_24_SIMPLE,
                      )}
                    </span>
                    . No se harán excepciones.
                  </p>
                  <p>
                    El ingreso será por la puerta de la calle
                    Ballivián entre calle Cochabamba y calle Potosí
                  </p>
                </section>
              )}
            </div>
          </section>
        ) : null}
        {dayTwoStartDate ? (
          <section>
            <h4 className="font-semibold text-sm my-2">
              <span className="capitalize">
                {dayTwoStartDate.weekdayLong}
              </span>{" "}
              <span>
                {dayTwoStartDate.toLocaleString({
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </h4>
            <div className="ml-2 flex flex-col gap-2">
              {mapCategory === "entrepreneurship" && (
                <section className="flex flex-col gap-2">
                  <p>
                    El ingreso de los expositores será desde las{" "}
                    <Highlight>
                      {dayTwoStartDate
                        .minus({ hour: 1 })
                        .toLocaleString(DateTime.TIME_24_SIMPLE)}{" "}
                      hasta las{" "}
                      {dayTwoStartDate.toLocaleString(
                        DateTime.TIME_24_SIMPLE,
                      )}
                    </Highlight>
                    . Cualquier expositor que llegue después del
                    horario marcado, tendrá que{" "}
                    <Highlight>
                      hacer cola junto con el público
                    </Highlight>{" "}
                    para ingresar. No se harán excepciones.
                  </p>
                  <p>
                    <Highlight>Galería:</Highlight>
                  </p>
                  <p>
                    El ingreso será por la puerta del Teatro CBA en la
                    calle Sucre entre calle Cochabamba y calle Potosí
                  </p>
                  <p>
                    <Highlight>Big Apple:</Highlight>
                  </p>
                  <p>
                    El ingreso será por la puerta de la calle
                    Ballivián entre calle Cochabamba y calle Potosí
                  </p>
                </section>
              )}
              {(mapCategory === "illustration" ||
                mapCategory === "gastronomy") && (
                <section className="flex flex-col gap-2">
                  <p>
                    El ingreso de los expositores será desde las{" "}
                    <Highlight>
                      {dayTwoStartDate
                        .minus({ hour: 1 })
                        .toLocaleString(DateTime.TIME_24_SIMPLE)}{" "}
                      hasta las{" "}
                      {dayTwoStartDate.toLocaleString(
                        DateTime.TIME_24_SIMPLE,
                      )}
                    </Highlight>
                    .{" "}
                    {mapCategory === "illustration" && (
                      <span>
                        Cualquier expositor que llegue después del
                        horario marcado, tendrá que{" "}
                        <Highlight>
                          hacer cola junto con el público
                        </Highlight>{" "}
                        para ingresar. No se harán excepciones.
                      </span>
                    )}
                  </p>
                  {mapCategory === "illustration" ? (
                    <p>
                      El ingreso será por la puerta del Teatro CBA en
                      la calle Sucre entre calle Cochabamba y calle
                      Potosí
                    </p>
                  ) : (
                    <p>
                      El ingreso será por la puerta de la calle
                      Ballivián entre calle Cochabamba y calle Potosí
                    </p>
                  )}
                </section>
              )}
            </div>
          </section>
        ) : null}
      </section>
      <section>
        <h3 className="text-base md:text-lg font-semibold text-foreground font-space-grotesk tracking-wide">
          <Highlight>4.2. Horario de montaje</Highlight>
        </h3>
        {dayOneStartDate ? (
          <section className="text-sm">
            <h4 className="font-semibold my-2">
              <span className="capitalize">
                {dayOneStartDate.weekdayLong}
              </span>{" "}
              <span>
                {dayOneStartDate.toLocaleString({
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </h4>
            <div className="ml-2 flex flex-col gap-2">
              <p>
                El montaje de stands deberá hacerse desde que el
                expositor ingrese al recinto. Y deberá completarse{" "}
                <Highlight>
                  antes de las{" "}
                  {dayOneStartDate.toLocaleString(
                    DateTime.TIME_24_SIMPLE,
                  )}
                </Highlight>
                . Sin excepción.
              </p>
            </div>
          </section>
        ) : null}
        {dayTwoStartDate ? (
          <section className="text-sm">
            <h4 className="font-semibold my-2">
              <span className="capitalize">
                {dayTwoStartDate.weekdayLong}
              </span>{" "}
              <span>
                {dayTwoStartDate.toLocaleString({
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </h4>
            <div className="ml-2 flex flex-col gap-2">
              <p>
                El expositor deberá asegurarse de que su stand esté en
                condiciones para recibir al público{" "}
                <Highlight>
                  antes de las{" "}
                  {dayTwoStartDate.toLocaleString(
                    DateTime.TIME_24_SIMPLE,
                  )}
                </Highlight>
                . Sin excepción.
              </p>
            </div>
          </section>
        ) : null}
      </section>
      <section>
        <h3 className="text-base md:text-lg font-semibold text-foreground font-space-grotesk tracking-wide">
          4.3. Horario de apertura y cierre de puertas al público
        </h3>
        {dayOneStartDate && dayOneEndDate ? (
          <p className="mt-1">
            Ambos días del evento tienen el mismo horario. Las puertas
            al público se abrirán a las{" "}
            <span className="font-semibold">
              {dayOneStartDate.toLocaleString(
                DateTime.TIME_24_SIMPLE,
              )}
            </span>{" "}
            y se cerrarán a las{" "}
            <span className="font-semibold">
              {dayOneEndDate.toLocaleString(DateTime.TIME_24_SIMPLE)}
            </span>
          </p>
        ) : null}
      </section>
      <section>
        <h3 className="text-base md:text-lg font-semibold text-foreground font-space-grotesk tracking-wide">
          4.4. Horario de desmontaje
        </h3>
        {dayOneStartDate && dayOneEndDate ? (
          <section>
            <h4 className="font-semibold my-2">
              <span className="capitalize">
                {dayOneStartDate.weekdayLong}
              </span>{" "}
              <span>
                {dayOneStartDate.toLocaleString({
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </h4>
            <div className="ml-2 flex flex-col gap-2">
              <p>
                Los expositores tienen permitido dejar sus estructuras
                armadas para facilitar acomodarse el segundo día del
                festival.
              </p>
              <p>
                El horario en que los expositores tienen permitido
                retirarse este día es desde las{" "}
                {dayOneEndDate.toLocaleString(
                  DateTime.TIME_24_SIMPLE,
                )}{" "}
                hasta las{" "}
                {dayOneEndDate
                  .plus({ minutes: 30 })
                  .toLocaleString(DateTime.TIME_24_SIMPLE)}
                . Cualquier excepción a este horario debe ser
                previamente autorizado por la organización.
              </p>
              <p>
                El recinto se cerrará a las{" "}
                <span className="font-semibold">
                  {dayOneEndDate
                    .plus({ minutes: 45 })
                    .toLocaleString(DateTime.TIME_24_SIMPLE)}
                </span>
                .
              </p>
            </div>
          </section>
        ) : null}
        {dayTwoStartDate && dayTwoEndDate ? (
          <section>
            <h4 className="font-semibold my-2">
              <span className="capitalize">
                {dayTwoStartDate.weekdayLong}
              </span>{" "}
              <span>
                {dayTwoStartDate.toLocaleString({
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </h4>
            <div className="ml-2 flex flex-col gap-2">
              <p>
                Los expositores tienen permitido desmontar sus stands
                este día desde las{" "}
                {dayTwoEndDate
                  .minus({ minutes: 15 })
                  .toLocaleString(DateTime.TIME_24_SIMPLE)}{" "}
                hasta las{" "}
                {dayTwoEndDate
                  .plus({ minutes: 30 })
                  .toLocaleString(DateTime.TIME_24_SIMPLE)}
                . Sin excepción.
              </p>
              <p>
                El recinto se cerrará a las{" "}
                <span className="font-semibold">
                  {dayTwoEndDate
                    .plus({ minutes: 45 })
                    .toLocaleString(DateTime.TIME_24_SIMPLE)}
                </span>
                .
              </p>
            </div>
          </section>
        ) : null}
      </section>
      <div className="flex flex-col gap-2 text-sm">
        <p>
          Cualquier infracción a estos horarios será registrada en el
          historial del participante
        </p>
      </div>
    </div>
  );
}
