import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import { BaseProfile } from "@/app/api/users/definitions";
import { formatDate } from "@/app/lib/formatters";
import { getUserName } from "@/app/lib/users/utils";
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
import { DateTime } from "luxon";

type ReservationPaymentExtensionTemplateProps = {
  profile: BaseProfile;
  reservation: {
    id: number;
    festivalId: number;
    stand: { label: string | null; standNumber: number };
    festival: { name: string };
  };
  newDueDate: Date;
};

export default function ReservationPaymentExtensionTemplate(
  props: ReservationPaymentExtensionTemplateProps,
) {
  const { profile, reservation, newDueDate } = props;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const userName = getUserName(profile);
  const dueDate = formatDate(newDueDate);
  const paymentsUrl = `${baseUrl}/profiles/${profile.id}/festivals/${reservation.festivalId}/reservations/${reservation.id}/payments`;

  return (
    <Html>
      <Head />
      <Preview>
        Tenés más tiempo para pagar tu reserva en {reservation.festival.name}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {userName}!</Text>
            <Text style={styles.text}>
              Extendimos la fecha límite de pago de tu reserva para el espacio{" "}
              <strong>
                {reservation.stand.label}
                {reservation.stand.standNumber}
              </strong>{" "}
              en el festival <strong>{reservation.festival.name}</strong>.
            </Text>
            <Text style={styles.text}>
              La nueva fecha límite es el{" "}
              <strong>{dueDate.toLocaleString(DateTime.DATE_MED)}</strong> a las{" "}
              <strong>{dueDate.toLocaleString(DateTime.TIME_SIMPLE)}</strong>.
            </Text>
            <Text style={styles.text}>
              Recordá subir el comprobante de pago antes de esa fecha para
              confirmar tu reserva.
            </Text>
            <Text style={styles.text}>
              Si tenés alguna duda, escribinos a{" "}
              <span style={styles.email}>soporte@productoraglitter.com</span>.
            </Text>
            <Button href={paymentsUrl} style={styles.button}>
              Completar el pago
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

ReservationPaymentExtensionTemplate.PreviewProps = {
  profile: {
    id: 1,
    displayName: "John Doe",
  },
  reservation: {
    id: 42,
    festivalId: 7,
    festival: {
      name: "Festival de prueba",
    },
    stand: {
      label: "A",
      standNumber: 2,
    },
  },
  newDueDate: new Date("2024-07-12T18:00:00"),
} as unknown as ReservationPaymentExtensionTemplateProps;
