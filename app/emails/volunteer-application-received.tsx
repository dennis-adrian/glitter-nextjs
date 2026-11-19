import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";

export type VolunteerApplicationReceivedEmailProps = {
  firstName: string;
  festivalName: string;
  /** Already formatted: "Vie 18 dic, 15:00–19:00 — Montaje". */
  shifts: string[];
  firstChoiceRole: string;
  secondChoiceRole: string;
};

/**
 * Sent once, to a new applicant. It confirms receipt only: nothing here may
 * read as being accepted or confirmed as a volunteer.
 */
export default function VolunteerApplicationReceivedEmailTemplate({
  firstName,
  festivalName,
  shifts,
  firstChoiceRole,
  secondChoiceRole,
}: VolunteerApplicationReceivedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Recibimos tu postulación, te contactaremos por WhatsApp.
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>Hola {firstName},</Text>
            <Text style={styles.text}>
              Gracias por querer ser parte del equipo de voluntarios de{" "}
              {festivalName}. Recibimos tu postulación, te contactaremos por
              WhatsApp.
            </Text>
            <Text style={styles.text}>
              Este es el resumen de lo que elegiste. Lo usaremos para revisar tu
              postulación y armar los equipos.
            </Text>

            <Section style={styles.detailBox}>
              <Text style={{ ...styles.detailLine, fontWeight: "bold" }}>
                Turnos en los que tienes disponibilidad
              </Text>
              {shifts.map((shift) => (
                <Text key={shift} style={styles.detailLine}>
                  • {shift}
                </Text>
              ))}
              <Text
                style={{
                  ...styles.detailLine,
                  fontWeight: "bold",
                  marginTop: "12px",
                }}
              >
                Roles preferidos
              </Text>
              <Text style={styles.detailLine}>
                1ª opción: {firstChoiceRole}
              </Text>
              <Text style={styles.detailLine}>
                2ª opción: {secondChoiceRole}
              </Text>
            </Section>

            <Text style={{ ...styles.text, fontSize: "12px" }}>
              Si no enviaste esta postulación, puedes ignorar este correo.
            </Text>
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}

VolunteerApplicationReceivedEmailTemplate.PreviewProps = {
  firstName: "Camila",
  festivalName: "Glitter 11va edición",
  shifts: [
    "Vie 18 dic, 15:00–19:00 — Montaje",
    "Sáb 19 dic, 13:30–17:30 — Festival (turno A)",
  ],
  firstChoiceRole: "Orientación al público",
  secondChoiceRole: "Redes y foto",
} as VolunteerApplicationReceivedEmailProps;
