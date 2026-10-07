import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";

import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";

export type TicketHistoryLinkEmailProps = {
  firstName: string | null;
  ticketsUrl: string;
};

/**
 * The link a visitor asked for to see every ticket they have had. Proving they
 * read this inbox is what lets them see the history, so the copy asks them not
 * to forward it.
 */
export default function TicketHistoryLinkEmailTemplate({
  firstName,
  ticketsUrl,
}: TicketHistoryLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Tu enlace para ver tus entradas.</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {firstName?.trim() ? `Hola ${firstName.trim()}, aquí` : "Aquí"}{" "}
              tienes el enlace para ver todas tus entradas a nuestros
              festivales.
            </Text>

            <Section style={{ textAlign: "center", margin: "16px 0" }}>
              <Button href={ticketsUrl} style={styles.primaryButton}>
                Ver mis entradas
              </Button>
            </Section>

            <Text style={{ ...styles.text, fontSize: "12px" }}>
              ¿No funciona el botón? Copia y pega este enlace:
            </Text>
            <Text
              style={{
                ...styles.text,
                fontSize: "12px",
                wordBreak: "break-all",
              }}
            >
              <Link href={ticketsUrl}>{ticketsUrl}</Link>
            </Text>

            <Text style={{ ...styles.text, fontSize: "12px" }}>
              El enlace funciona durante 30 días. No lo compartas: cualquier
              persona que lo tenga puede ver tus entradas. Si no lo pediste,
              puedes ignorar este correo.
            </Text>
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}

TicketHistoryLinkEmailTemplate.PreviewProps = {
  firstName: "Camila",
  ticketsUrl: "http://localhost:3000/visitors/tickets/access?token=preview",
} as TicketHistoryLinkEmailProps;
