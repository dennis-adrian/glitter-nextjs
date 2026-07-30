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

export type ProgramPurchaseLinkEmailProps = {
  buyerName: string;
  sessionTitle: string;
  secureLinkUrl: string;
};

/**
 * A replacement secure link, sent when the team resends one on request.
 *
 * The copy states plainly that the previous link stopped working. The token is
 * stored as a digest and cannot be recovered, so a resend always rotates —
 * leaving that unsaid would strand anyone still holding the old email.
 */
export default function ProgramPurchaseLinkEmailTemplate({
  buyerName,
  sessionTitle,
  secureLinkUrl,
}: ProgramPurchaseLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Tu nuevo enlace para ver tu inscripción.</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {buyerName}, aquí tienes un enlace nuevo para ver tu inscripción a{" "}
              <strong>{sessionTitle}</strong>.
            </Text>

            <Section style={{ textAlign: "center", margin: "16px 0" }}>
              <Button href={secureLinkUrl} style={primaryButton}>
                Ver mi inscripción
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

            <Text style={{ ...styles.text, fontSize: "12px" }}>
              <strong>El enlace anterior dejó de funcionar.</strong> Usa este y
              no lo compartas — cualquier persona que lo tenga puede ver tu
              inscripción.
            </Text>
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
