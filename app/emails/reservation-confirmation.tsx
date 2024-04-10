import * as styles from "@/app/emails/styles";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface FestivalActivationTemplateProps {
  name: string;
  festivalId: number;
  standLabel: string;
}

export default function ReservationConfirmationEmailTemplate(
  props: FestivalActivationTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  return (
    <Html>
      <Head />
      <Preview>
        Tu reserva para el espacio {props.standLabel} ha sido confirmada
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.text}>¡Hola {props.name}!</Text>
            <Text style={styles.text}>
              ¡Tu reserva para el espacio <strong>{props.standLabel}</strong> ha
              sido confirmada!
            </Text>
            <Text style={styles.text}>
              Muchas gracias por seguir todos los pasos y confirmar tu
              participación en el siguiente evento organizado por{" "}
              <strong>Glitter</strong>
            </Text>
            <Text style={styles.text}>
              Te esparamos el 11 de mayo en el Teatro CBA a las 9:00 AM para el
              armado de tu espacio
            </Text>
            <Text style={styles.text}>
              También recuerda que puedes ver la página del evento en cualquier
              momento y ver a los demás participantes que estarán presentes.
            </Text>
            <Button
              href={`${baseUrl}/festivals/${props.festivalId}`}
              style={styles.button}
            >
              Ir a la página del evento
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

ReservationConfirmationEmailTemplate.PreviewProps = {
  name: "John Doe",
  festivalId: 9,
  standLabel: "A52",
} as FestivalActivationTemplateProps;
