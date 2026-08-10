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

export type ProgramWaitlistInvitationEmailProps = {
  buyerName: string;
  sessionTitle: string;
  /** Preformatted — the template does no date maths. */
  scheduleLabel: string;
  deadlineLabel: string;
  invitationUrl: string;
};

/**
 * Offers a released seat to one waitlisted person.
 *
 * The deadline is stated twice — in the opening line and beside the button —
 * because it is the whole point: the seat goes back on sale when it passes,
 * and someone who skims will otherwise miss the only time-sensitive fact.
 */
export default function ProgramWaitlistInvitationEmailTemplate({
  buyerName,
  sessionTitle,
  scheduleLabel,
  deadlineLabel,
  invitationUrl,
}: ProgramWaitlistInvitationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Se liberó un cupo. Tienes hasta {deadlineLabel}.</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {buyerName}, se liberó un cupo en <strong>{sessionTitle}</strong>{" "}
              y te lo estamos ofreciendo a ti. Tienes hasta{" "}
              <strong>{deadlineLabel}</strong> para tomarlo.
            </Text>

            <Section style={styles.detailBox}>
              <Text style={styles.detailLine}>{scheduleLabel}</Text>
            </Section>

            <Section style={{ textAlign: "center", margin: "16px 0" }}>
              <Button href={invitationUrl} style={styles.primaryButton}>
                Tomar mi cupo
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
              <Link href={invitationUrl}>{invitationUrl}</Link>
            </Text>

            <Text style={{ ...styles.text, fontSize: "12px" }}>
              Pasado ese plazo el cupo vuelve a estar disponible para otras
              personas. <strong>No compartas este enlace</strong> — quien lo
              tenga puede tomar el cupo.
            </Text>
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}

ProgramWaitlistInvitationEmailTemplate.PreviewProps = {
  buyerName: "María Pérez",
  sessionTitle: "Cómo vivir del arte",
  scheduleLabel: "10 ago 2026, 15:00 — 16:30",
  deadlineLabel: "9 ago 2026, 18:00",
  invitationUrl: "http://localhost:3000/programs/waitlist/12?token=preview",
} as ProgramWaitlistInvitationEmailProps;
