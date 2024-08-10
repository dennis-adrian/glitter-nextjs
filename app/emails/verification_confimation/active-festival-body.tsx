import { FestivalBase } from "@/app/data/festivals/definitions";
import * as styles from "@/app/emails/styles";
import { formatDate } from "@/app/lib/formatters";
import { Button, Img, Link, Text } from "@react-email/components";
import { DateTime } from "luxon";

type ActiveFestivalBodyProps = {
  baseUrl: string;
  festival: FestivalBase;
  profileId: number;
};

export default function ActiveFestivalBody(props: ActiveFestivalBodyProps) {
  const reservationsStartDate = formatDate(
    props.festival.reservationsStartDate,
  );
  return (
    <>
      <Img
        style={{ margin: "1rem auto" }}
        src="http://s.mmgo.io/t/CzgA"
        alt="countdown"
      />
      <Text style={styles.text}>
        Las reservas para el festival <strong>{props.festival.name}</strong> se
        habilitarán el día{" "}
        {reservationsStartDate.toLocaleString(DateTime.DATE_FULL)} a las{" "}
        {reservationsStartDate.toLocaleString(DateTime.TIME_24_SIMPLE)} ¡Ya
        comenzó la cuenta regresiva!
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
