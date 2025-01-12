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
import { getUserName } from "@/app/lib/users/utils";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import { InvoiceWithPaymentsAndStandAndProfile } from "@/app/data/invoices/defiinitions";

type PaymentConfirmationForUserEmailTemplateProps = {
  invoice: InvoiceWithPaymentsAndStandAndProfile;
};

export default function PaymentConfirmationForUserEmailTemplate(
  props: PaymentConfirmationForUserEmailTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const userName = getUserName(props.invoice.user);

  return (
    <Html>
      <Head />
      <Preview>
        Tu pago para el festival {props.invoice.reservation.festival.name} fue
        registrado
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {userName}!</Text>
            <Text style={styles.text}>
              Hemos recibido el comprobante de pago que subiste para el espacio{" "}
              <strong>
                {props.invoice.reservation.stand.label}
                {props.invoice.reservation.stand.standNumber}
              </strong>{" "}
              en el festival{" "}
              <strong>{props.invoice.reservation.festival.name}</strong>
            </Text>
            <Text style={styles.text}>
              El equipo Glitter confirmará tu reserva en el transcurso del día.
              Recibirás un correo cuando tu reserva sea confirmada.
            </Text>
            <Text style={styles.text}>
              También recuerda que puedes ver tu perfil en cualquier momento
              haciendo clic en el botón
            </Text>
            <Button href={`${baseUrl}/my_profile`} style={styles.button}>
              Ir a mi perfil
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

PaymentConfirmationForUserEmailTemplate.PreviewProps = {
  invoice: {
    user: {
      displayName: "John Doe",
    },
    reservation: {
      festival: {
        name: "Festival de prueba",
      },
      stand: {
        label: "A",
        standNumber: 2,
      },
    },
  },
} as PaymentConfirmationForUserEmailTemplateProps;
