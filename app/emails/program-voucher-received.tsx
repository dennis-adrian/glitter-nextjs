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

export type VoucherReceivedSession = {
  title: string;
  typeLabel: string;
  /** Preformatted — the template does no date maths. */
  scheduleLabel: string;
  priceLabel: string;
};

export type ProgramVoucherReceivedEmailProps = {
  attendeeName: string;
  /** Every session in the purchase, in line order. Never empty. */
  sessions: VoucherReceivedSession[];
  totalLabel: string;
  /** Absent when the sender has no way to build one for this buyer. */
  secureLinkUrl?: string | null;
  /** True for a replacement, so the copy does not read as a first receipt. */
  isReplacement: boolean;
};

/**
 * Acknowledges a payment proof and sets the expectation that a human reviews
 * it. No QR here — the ticket does not exist until an admin approves.
 *
 * Lists every session in the purchase. One voucher covers the whole cart, so
 * naming a single session would leave the buyer unable to tell what they
 * actually paid for.
 */
export default function ProgramVoucherReceivedEmailTemplate({
  attendeeName,
  sessions,
  totalLabel,
  secureLinkUrl,
  isReplacement,
}: ProgramVoucherReceivedEmailProps) {
  const isCart = sessions.length > 1;
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
              pago para{" "}
              {isCart ? (
                <strong>{sessions.length} sesiones</strong>
              ) : (
                <strong>{sessions[0]?.title}</strong>
              )}
              .
            </Text>

            <Section style={styles.detailBox}>
              {sessions.map((session, index) => (
                <Section
                  key={`${session.title}-${session.scheduleLabel}`}
                  style={index === 0 ? undefined : sessionDivider}
                >
                  {isCart ? (
                    <Text style={{ ...styles.detailLine, fontWeight: 700 }}>
                      {session.title}
                    </Text>
                  ) : null}
                  <Text style={styles.detailLine}>
                    <strong>{session.typeLabel}</strong>
                  </Text>
                  <Text style={styles.detailLine}>{session.scheduleLabel}</Text>
                  {isCart ? (
                    <Text style={styles.detailLine}>{session.priceLabel}</Text>
                  ) : null}
                </Section>
              ))}
              <Text style={{ ...styles.detailLine, ...totalRow }}>
                Total: {totalLabel}
              </Text>
            </Section>

            <Text style={styles.text}>
              {isCart
                ? "Tus cupos quedan reservados"
                : "Tu cupo queda reservado"}{" "}
              mientras revisamos el pago. Te enviaremos otro correo cuando el pago sea confirmado y ahí recibirás el QR de tu entrada.
            </Text>

            {secureLinkUrl ? (
              <>
                <Section style={{ textAlign: "center", margin: "16px 0" }}>
                  <Button href={secureLinkUrl} style={styles.primaryButton}>
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
                  O también podés hacer clic en este enlace <Link href={secureLinkUrl}>{secureLinkUrl}</Link>
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

const sessionDivider = {
  borderTop: "1px solid #ededed",
  marginTop: "12px",
  paddingTop: "12px",
};

const totalRow = {
  borderTop: "1px solid #dedede",
  marginTop: "12px",
  paddingTop: "12px",
  fontWeight: 700,
};
