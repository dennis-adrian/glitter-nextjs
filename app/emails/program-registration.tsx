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
  secureLinkUrl: string;
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
}: ProgramRegistrationEmailProps) {
  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="only light" />
        <meta name="supported-color-schemes" content="only light" />
      </Head>
      <Preview>
        Tu inscripción quedó confirmada. Muestra el QR al entrar.
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {attendeeName}, tu inscripción a <strong>{sessionTitle}</strong>{" "}
              quedó confirmada.
            </Text>

            <Section style={detailBox}>
              <Text style={detailLine}>
                <strong>{sessionTypeLabel}</strong> · {programName}
              </Text>
              <Text style={detailLine}>{scheduleLabel}</Text>
              {venueLabel ? <Text style={detailLine}>{venueLabel}</Text> : null}
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
              Muestra este código al llegar. Si no puedes verlo desde el correo,
              abre tu entrada aquí:
            </Text>

            <Section style={{ textAlign: "center", margin: "16px 0" }}>
              <Button href={secureLinkUrl} style={primaryButton}>
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
              Guarda este enlace: es la única forma de recuperar tu entrada si
              pierdes este correo. <strong>No lo compartas</strong> — cualquier
              persona que lo tenga puede ver y usar tu entrada.
            </Text>
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}

/**
 * Explicit colours rather than theme tokens: mail clients strip stylesheets,
 * and the `only light` colour-scheme meta means this never needs a dark
 * variant.
 */
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
