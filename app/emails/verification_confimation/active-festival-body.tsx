import * as styles from "@/app/emails/styles";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { Button, Link, Text } from "@react-email/components";
import { DateTime } from "luxon";

type ActiveFestivalBodyProps = {
  baseUrl: string;
  festival: FestivalBase;
  profileId: number;
};

export default function ActiveFestivalBody(props: ActiveFestivalBodyProps) {
  const fullDate = formatDate(
    props.festival.reservationsStartDate,
  ).toLocaleString(DateTime.DATE_FULL);

  return (
    <>
      <Text style={styles.text}>
        Las reservas para el festival <strong>{props.festival.name}</strong> se
        habilitarán la noche del día {fullDate}.
      </Text>
      <Text style={styles.text}>
        Hasta mientras te pedimos que por favor leas con atención los términos y
        condiciones dándole al botón lila a continuación
      </Text>
      <Text style={styles.text}>
        Si tienes dudas o problemas con la reserva, comunícate con nosotros al
        correo{" "}
        <Link
          href="mailto:soporte@productoraglitter.com"
          style={{
            color: "#15c",
            textDecoration: "underline",
          }}
        >
          soporte@productoraglitter.com
        </Link>{" "}
        para que podamos ayudarte.
      </Text>
      <Button
        href={`${props.baseUrl}/profiles/${props.profileId}/festivals/${props.festival.id}/terms`}
        style={styles.button}
      >
        Leer términos y condiciones
      </Button>
    </>
  );
}
