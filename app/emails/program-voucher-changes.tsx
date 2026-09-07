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
} from "@react-email/components";

import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";

export type ProgramVoucherChangesEmailProps = {
  attendeeName: string;
  sessionTitle: string;
  /** The admin's reason, shown verbatim — it is the whole point of the email. */
  reason: string;
  /** Absent when the sender has no way to build one for this buyer. */
  secureLinkUrl?: string | null;
};

/**
 * Asks the buyer for a different payment proof.
 *
 * The seat stays held while this is outstanding, so the copy must not read as
 * a rejection — a buyer who thinks they lost their place will not come back.
 */
export default function ProgramVoucherChangesEmailTemplate({
  attendeeName,
  sessionTitle,
  reason,
  secureLinkUrl,
}: ProgramVoucherChangesEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Necesitamos otro comprobante para confirmar tu cupo.</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {attendeeName}, revisamos el comprobante que enviaste para{" "}
              <strong>{sessionTitle}</strong> y necesitamos que nos mandes otro.
            </Text>

            <Section style={reasonBox}>
              <Text style={{ ...styles.text, margin: 0 }}>{reason}</Text>
            </Section>

            <Text style={styles.text}>
              <strong>Tu cupo sigue reservado.</strong> Sube un nuevo
              comprobante y lo revisamos de nuevo.
            </Text>

            {secureLinkUrl ? (
              <>
                <Section style={{ textAlign: "center", margin: "16px 0" }}>
                  <Button href={secureLinkUrl} style={styles.primaryButton}>
                    Subir otro comprobante
                  </Button>
                </Section>
                <Text
                  style={{
                    ...styles.text,
                    fontSize: "12px",
                    wordBreak: "break-all",
                  }}
                >
                  <Link href={secureLinkUrl}>{secureLinkUrl}</Link>
                </Text>
              </>
            ) : (
              <Text style={styles.text}>
                Abre el enlace que te enviamos cuando reservaste tu cupo para
                subir el nuevo comprobante.
              </Text>
            )}
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}

const reasonBox = {
  border: "1px solid #dedede",
  borderLeft: "4px solid #7c3aed",
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "16px 0",
};

ProgramVoucherChangesEmailTemplate.PreviewProps = {
  attendeeName: "María Pérez",
  sessionTitle: "Cómo vivir del arte",
  reason:
    "El comprobante que subiste no muestra el monto ni la fecha de la transferencia. Mándanos una captura completa donde se vean los dos.",
  secureLinkUrl: "http://localhost:3000/programs/purchases/12?token=preview",
} as ProgramVoucherChangesEmailProps;
