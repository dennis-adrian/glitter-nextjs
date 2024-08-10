import * as styles from "@/app/emails/styles";
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
import { getUserName } from "@/app/lib/users/utils";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import { InvoiceWithPaymentsAndStandAndProfile } from "@/app/data/invoices/defiinitions";

type PaymentConfirmationForAdminsEmailTemplateProps = {
  invoice: InvoiceWithPaymentsAndStandAndProfile;
};

export default function PaymentConfirmationForAdminsEmailTemplate(
  props: PaymentConfirmationForAdminsEmailTemplateProps,
) {
  const stand = props.invoice.reservation.stand;
  const payment = props.invoice.payments[props.invoice.payments.length - 1];
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const userName = getUserName(props.invoice.user);

  return (
    <Html>
      <Head />
      <Preview>
        Nueva reserva por confirmar para el espacio {stand.label || ""}
        {stand.standNumber.toString()}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              El participante {userName} hizo un pago de{" "}
              <strong>Bs{props.invoice.amount?.toFixed(2) || 0}</strong> de su
              reserva para el espacio{" "}
              <strong>
                {stand.label}
                {stand.standNumber}
              </strong>{" "}
              en el festival {props.invoice.reservation.festival.name}.
            </Text>
            <Img
              style={{ margin: "0.5rem auto" }}
              src={payment.voucherUrl}
              width={280}
            />
            <Text style={styles.text}>
              Para confirmar la reserva ve al panel de pagos haciendo clic en el
              botón y busca el ID #{props.invoice.id}
            </Text>
            <Button
              href={`${baseUrl}/dashboard/payments`}
              style={styles.button}
            >
              Ver reservas
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

PaymentConfirmationForAdminsEmailTemplate.PreviewProps = {
  invoice: {
    id: 33,
    amount: 100,
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
    payments: [
      {
        id: 1,
        date: new Date(),
        amount: 100,
        voucherUrl:
          "https://utfs.io/f/74762ffc-0ead-41f5-bab1-dd26e9a5b303-8yf7a8.00.41.jpeg",
      },
    ],
  },
} as PaymentConfirmationForAdminsEmailTemplateProps;
