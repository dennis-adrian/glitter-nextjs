import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import dynamic from "next/dynamic";

const CopyLinkButtonComponent = dynamic(
  () => import("@/components/pages/profiles/festivals/copy-link-button"),
  { ssr: false },
);

type ReservationNotAllowedProps = {
  festival: FestivalBase;
};

export default function ReservationNotAllowed(
  props: ReservationNotAllowedProps,
) {
  const today = formatDate(DateTime.now().toISO());
  const formattedStartDate = formatDate(
    props.festival.reservationsStartDate.toISOString(),
  );

  return (
    <div className="container flex flex-col items-center justify-center p-4 md:p-6">
      <Card className="max-w-[600px]">
        <CardHeader>
          <CardTitle className="text-center text-xl">
            {props.festival.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center text-center gap-4">
            <div className="flex flex-col">
              <span className="text-muted-foreground text-sm">
                Habilitación de reservas
              </span>
              <span className="font-semibold text-3xl">
                {formatDate(
                  props.festival.reservationsStartDate,
                ).toLocaleString(DateTime.DATE_SHORT)}
              </span>
            </div>
            {formattedStartDate.startOf("day").toMillis() !==
            today.startOf("day").toMillis() ? (
              <div className="flex flex-col items-center justify-center text-center gap-2 text-sm">
                <span>
                  Copia y guarda el enlace de esta página para volver el día en
                  que se habilitan de las reservas.
                </span>
                <CopyLinkButtonComponent />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center gap-2 text-sm">
                <span className="mb-2">
                  Las reservas se habilitarán en cualquier momento. Puedes
                  copiar el enlace de esta página para regresar luego.
                </span>
                <CopyLinkButtonComponent />
                <div className="text-xs text-muted-foreground italic mt-1">
                  Si te quedaste en la página, te aconsejamos recargarla para
                  ver si las reservas ya están habilitadas
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
