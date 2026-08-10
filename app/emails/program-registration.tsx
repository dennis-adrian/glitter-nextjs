import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";

export type ProgramRegistrationEmailProps = {
  attendeeName: string;
  programName: string;
  sessionTitle: string;
  sessionTypeLabel: string;
  /** Preformatted — the template does no date maths. */
  scheduleLabel: string;
  venueLabel: string | null;
  ticketCode: string;
  /**
   * Absent when the sender has no raw token to build one with — an admin
   * approving a payment only ever sees the stored hash. The QR is attached
   * either way, so the email still stands on its own.
   */
  secureLinkUrl?: string | null;
  /** Switches the opening line to "we approved your payment". */
  paymentApproved?: boolean;
};

/**
 * Confirmation for a free registration, carrying the QR that gets scanned at
 * the door plus the secure link for recovering it later.
 *
 * The QR defences are deliberate and load-bearing: Gmail on Android inverts
 * colours in dark mode, which once made a Glitter QR unscannable. Three things
 * prevent it — the colour-scheme meta tags, an explicit white wrapper behind
 * the image, and the quiet-zone margin baked into `generateQrBuffer`. Do not
 * remove any of them.
 */
export default function ProgramRegistrationEmailTemplate({
  attendeeName,
  programName,
  sessionTitle,
  sessionTypeLabel,
  scheduleLabel,
  venueLabel,
  ticketCode,
  secureLinkUrl,
  paymentApproved = false,
}: ProgramRegistrationEmailProps) {
  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="only light" />
        <meta name="supported-color-schemes" content="only light" />
      </Head>
      <Preview>
        {paymentApproved
          ? "Aprobamos tu pago. Muestra el QR al entrar."
          : "Tu inscripción quedó confirmada. Muestra el QR al entrar."}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {paymentApproved ? (
                <>
                  {attendeeName}, aprobamos tu pago y tu lugar en{" "}
                  <strong>{sessionTitle}</strong> quedó confirmado.
                </>
              ) : (
                <>
                  {attendeeName}, tu inscripción a{" "}
                  <strong>{sessionTitle}</strong> quedó confirmada.
                </>
              )}
            </Text>

            <Section style={styles.detailBox}>
              <Text style={styles.detailLine}>
                <strong>{sessionTypeLabel}</strong> · {programName}
              </Text>
              <Text style={styles.detailLine}>{scheduleLabel}</Text>
              {venueLabel ? (
                <Text style={styles.detailLine}>{venueLabel}</Text>
              ) : null}
            </Section>

            <Section style={{ marginTop: "16px", textAlign: "center" }}>
              <div style={qrWrapper}>
                <Img
                  src="cid:program-ticket-qrcode"
                  alt="Código QR de tu entrada"
                  width="200"
                  height="200"
                  style={qrImage}
                />
              </div>
              <Text
                style={{ ...styles.text, fontWeight: 600, margin: "8px 0" }}
              >
                {ticketCode}
              </Text>
            </Section>

            <Text style={styles.text}>
              Muestra este código al llegar.
              {secureLinkUrl
                ? " Si no puedes verlo desde el correo, abre tu entrada aquí:"
                : ""}
            </Text>

            {secureLinkUrl ? (
              <>
                <Section style={{ textAlign: "center", margin: "16px 0" }}>
                  <Button href={secureLinkUrl} style={styles.primaryButton}>
                    Ver mi entrada
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
                  <Link href={secureLinkUrl}>{secureLinkUrl}</Link>
                </Text>

                <Hr style={{ margin: "16px 0" }} />
                <Text style={{ ...styles.text, fontSize: "12px" }}>
                  Guarda este enlace: es la única forma de recuperar tu entrada
                  si pierdes este correo. <strong>No lo compartas</strong> —
                  cualquier persona que lo tenga puede ver y usar tu entrada.
                </Text>
              </>
            ) : (
              <>
                <Hr style={{ margin: "16px 0" }} />
                <Text style={{ ...styles.text, fontSize: "12px" }}>
                  Guarda este correo: el QR de arriba es tu entrada. También
                  puedes abrirla desde el enlace que te enviamos cuando
                  reservaste tu cupo.
                </Text>
              </>
            )}
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}

/** White backdrop so a dark-mode client cannot invert the code. */
const qrWrapper = {
  backgroundColor: "#FFFFFF",
  padding: "12px",
  borderRadius: "8px",
  display: "inline-block",
};

const qrImage = {
  display: "block",
  backgroundColor: "#FFFFFF",
};

/**
 * The QR renders broken in the preview server, and that is expected: `cid:`
 * resolves against a message's own attachments, which only exist once the mail
 * is actually sent. Check the QR in a delivered email, never here.
 */
ProgramRegistrationEmailTemplate.PreviewProps = {
  attendeeName: "María Pérez",
  programName: "Glitter Academy",
  sessionTitle: "Cómo vivir del arte",
  sessionTypeLabel: "Charla",
  scheduleLabel: "10 ago 2026, 15:00 — 16:30",
  venueLabel: "Casa Glitter · Sala 2",
  ticketCode: "GLT-8F3K2A",
  secureLinkUrl: "http://localhost:3000/programs/purchases/12?token=preview",
} as ProgramRegistrationEmailProps;
