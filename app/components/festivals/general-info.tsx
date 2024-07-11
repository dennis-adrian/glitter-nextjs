import GeneralInfoDetails from "@/app/components/festivals/general-info-details";
import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import Image from "next/image";
import Link from "next/link";

type GeneralInfoProps = {
  festival: FestivalWithDates;
};

export default function GeneralInfo(props: GeneralInfoProps) {
  const isRegistrationOpen =
    props.festival.publicRegistration && !props.festival.eventDayRegistration;

  return (
    <div>
      <GeneralInfoDetails festival={props.festival} />
      {props.festival.status === "active" && (
        <div className="flex justify-center items-center">
          {isRegistrationOpen ? (
            <RedirectButton
              href={`/festivals/${props.festival.id}/registration`}
            >
              Reservar entrada
            </RedirectButton>
          ) : (
            <div className="flex flex-col gap-2">
              <Button disabled>Reservar entrada</Button>
              <div className="text-muted-foreground text-sm">
                {props.festival.eventDayRegistration ? (
                  <span>Registro habilitado en puerta</span>
                ) : (
                  <span>La reserva de entradas no está habilitada</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {props.festival.generalMapUrl && (
        <div className="py-4">
          <h2 className="font-semibold text-xl mt-4">Distribución General</h2>
          <span className="flex flex-wrap text-muted-foreground text-sm">
            <p className="mr-1">
              Para ven en detalle los participantes y los sectores del evento
              visita{" "}
              <Link
                className="text-primary-400 hover:underline"
                href={`/festivals/${props.festival.id}?tab=sectors`}
              >
                Sectores y participantes
              </Link>
            </p>
          </span>
          <Image
            className="mx-auto my-4"
            alt="mapa del evento"
            height={545}
            src={props.festival.generalMapUrl}
            width={300}
          />
        </div>
      )}
    </div>
  );
}
