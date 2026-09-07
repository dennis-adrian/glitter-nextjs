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

import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import { previewDate, previewScheduleLabel } from "@/app/emails/preview-dates";
import * as styles from "@/app/emails/styles";

export type ProgramSignupForAdminsEmailProps = {
  attendeeName: string;
  sessions: {
    title: string;
    typeLabel: string;
    scheduleLabel: string;
  }[];
  totalLabel: string;
  promoLabel?: string | null;
  reviewUrl: string;
};

export default function ProgramSignupForAdminsEmailTemplate({
  attendeeName,
  sessions,
  totalLabel,
  promoLabel,
  reviewUrl,
}: ProgramSignupForAdminsEmailProps) {
  const isCart = sessions.length > 1;

  return (
    <Html>
      <Head />
      <Preview>Nueva inscripción pendiente de revisión de pago</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>Hola equipo,</Text>
            <Text style={styles.text}>
              <strong>{attendeeName}</strong> se inscribió a{" "}
              {isCart ? (
                <strong>{sessions.length} sesiones</strong>
              ) : (
                <strong>{sessions[0]?.title}</strong>
              )}{" "}
              y subió su comprobante de pago.
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
                </Section>
              ))}
              <Text style={{ ...styles.detailLine, ...totalRow }}>
                Total: {totalLabel}
              </Text>
              {promoLabel ? (
                <Text style={styles.detailLine}>{promoLabel}</Text>
              ) : null}
            </Section>

            <Text style={styles.text}>El pago está pendiente de revisión.</Text>
            <Button href={reviewUrl} style={styles.primaryButton}>
              Revisar inscripción
            </Button>
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

ProgramSignupForAdminsEmailTemplate.PreviewProps = {
  attendeeName: "María Pérez",
  sessions: [
    {
      title: "Taller de ilustración",
      typeLabel: "Taller",
      scheduleLabel: previewScheduleLabel(
        previewDate(5, 15),
        previewDate(5, 17),
      ),
    },
  ],
  totalLabel: "Bs 120",
  reviewUrl: "http://localhost:3000/dashboard/programs/purchases",
} as ProgramSignupForAdminsEmailProps;
