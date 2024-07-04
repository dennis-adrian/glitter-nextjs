import * as styles from "@/app/emails/styles";
import { Button, Link, Text } from "@react-email/components";

type ActiveFestivalBodyProps = {
  baseUrl: string;
  profileId: number;
  festivalId: number;
};

export default function ActiveFestivalBody(props: ActiveFestivalBodyProps) {
  return (
    <>
      <Text style={styles.text}>
        Un nuevo festival se acerca y te invitamos a que reserves tu espacio con
        anticipación.
      </Text>
      <Text style={styles.text}>
        El primer paso para reservar tu espacio es leer los términos y
        condiciones en el botón de abajo.
      </Text>
      <Text style={styles.text}>
        Luego de leer y aceptar, puedes darle al botón &quot;
        <strong>¡Quiero reservar!&quot;</strong> y comenzar tu proceso de
        reserva.
      </Text>
      <Text style={styles.text}>
        Si tienes dudas o problemas con la reserva, comunícate con al correo{" "}
        <Link
          href="mailto:soporte@productoraglitter.com"
          style={{
            color: "#15c",
            textDecoration: "underline",
          }}
        >
          soporte@productoraglitter.com
        </Link>{" "}
        nosotros para que podamos ayudarte.
      </Text>
      <Button
        href={`${props.baseUrl}/profiles/${props.profileId}/festivals/${props.festivalId}/terms`}
        style={styles.button}
      >
        Leer términos y condiciones
      </Button>
    </>
  );
}
