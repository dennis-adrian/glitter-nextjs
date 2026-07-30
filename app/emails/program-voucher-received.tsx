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

export type ProgramVoucherReceivedEmailProps = {
  attendeeName: string;
  sessionTitle: string;
  sessionTypeLabel: string;
  /** Preformatted — the template does no date maths. */
  scheduleLabel: string;
  totalLabel: string;
  /** Absent when the sender has no way to build one for this buyer. */
  secureLinkUrl?: string | null;
  /** True for a replacement, so the copy does not read as a first receipt. */
  isReplacement: boolean;
};

/**
 * Acknowledges a payment proof and sets the expectation that a human reviews
 * it. No QR here — the ticket does not exist until an admin approves.
 */
export default function ProgramVoucherReceivedEmailTemplate({
  attendeeName,
  sessionTitle,
  sessionTypeLabel,
  scheduleLabel,
  totalLabel,
  secureLinkUrl,
  isReplacement,
}: ProgramVoucherReceivedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {isReplacement
          ? "Recibimos tu nuevo comprobante."
          : "Recibimos tu comprobante y estamos revisándolo."}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {attendeeName}, recibimos{" "}
              {isReplacement ? "tu nuevo comprobante" : "tu comprobante"} de
              pago para <strong>{sessionTitle}</strong>.
            </Text>

            <Section style={detailBox}>
              <Text style={detailLine}>
                <strong>{sessionTypeLabel}</strong>
              </Text>
              <Text style={detailLine}>{scheduleLabel}</Text>
              <Text style={detailLine}>Total: {totalLabel}</Text>
            </Section>

            <Text style={styles.text}>
              Tu cupo queda reservado mientras revisamos el pago. Te escribimos
              en cuanto lo confirmemos — ahí recibirás el QR de tu entrada.
            </Text>

            {secureLinkUrl ? (
              <>
                <Section style={{ textAlign: "center", margin: "16px 0" }}>
                  <Button href={secureLinkUrl} style={primaryButton}>
                    Ver el estado de mi inscripción
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
                <Text style={{ ...styles.text, fontSize: "12px" }}>
                  <strong>No compartas este enlace</strong> — cualquier persona
                  que lo tenga puede ver tu inscripción.
                </Text>
              </>
            ) : null}
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}

/** Explicit colours: mail clients strip stylesheets. */
const primaryButton = {
  backgroundColor: "#7c3aed",
  color: "#FFFFFF",
  padding: "12px 24px",
  borderRadius: "8px",
  fontWeight: 600,
  fontSize: "14px",
  textDecoration: "none",
  display: "inline-block",
};

const detailBox = {
  border: "1px solid #dedede",
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "16px 0",
};

const detailLine = {
  ...styles.text,
  margin: "4px 0",
};
