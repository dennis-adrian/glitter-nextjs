import { FestivalWithDates } from "@/app/data/festivals/definitions";
import * as styles from "@/app/emails/styles";
import { formatDate, formatFullDate } from "@/app/lib/formatters";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { DateTime } from "luxon";

interface FestivalActivationTemplateProps {
  name: string;
  festival: FestivalWithDates;
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
        Tu reserva para el espacio {props.standLabel} para {props.festival.name}{" "}
        ha sido confirmada
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
              participación en el <strong>{props.festival.name}</strong>
            </Text>
            <Text style={styles.text}>
              Te esparamos el{" "}
              {formatFullDate(props.festival.festivalDates[0].startDate)} en{" "}
              {props.festival.locationLabel} a las{" "}
              {formatDate(props.festival.festivalDates[0].startDate)
                .minus({ hour: 1 })
                .toLocaleString(DateTime.TIME_24_SIMPLE)}{" "}
              para el armado de tu espacio
            </Text>
            <Text style={styles.text}>
              También recuerda que puedes ver la página del evento en cualquier
              momento y ver a los demás participantes que estarán presentes.
            </Text>
            <Button
              href={`${baseUrl}/festivals/${props.festival.id}`}
              style={styles.button}
            >
              Ir a la página del evento
            </Button>
          </Section>
        </Container>
        <Container style={styles.footer}>
          <Img
            style={{ margin: "4px auto" }}
            src="https://utfs.io/f/a4e5ba5d-5403-4c59-99c0-7e170bb2d6f5-f0kpla.png"
            width={32}
          />
          <Text style={styles.footerText}>Enviado por el equipo Glitter</Text>
          <Text style={styles.footerText}>
            © 2024 | Productora Glitter, Santa Cruz, Bolivia{" "}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

ReservationConfirmationEmailTemplate.PreviewProps = {
  name: "John Doe",
  standLabel: "A52",
  festival: {
    id: 9,
    name: "Nombre del festival",
    locationLabel: "Galería del CBA",
    festivalDates: [
      {
        id: 1,
        startDate: new Date(),
        endDate: new Date(),
      },
      {
        id: 2,
        startDate: new Date(),
        endDate: new Date(),
      },
    ],
  },
} as FestivalActivationTemplateProps;
