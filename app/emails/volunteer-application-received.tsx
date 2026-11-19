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
  /** "Vie 18 dic · 15:00–19:00" and "Montaje". */
  shifts: { when: string; label: string }[];
  firstChoiceRole: string;
  secondChoiceRole: string;
  /** "30 de noviembre". */
  closesOn: string;
  /** "19 y 20 de diciembre de 2026, Teatro CBA, Santa Cruz de la Sierra". */
  festivalDetails: string | null;
  /** "sábado 5 de diciembre", or "fecha por confirmar". */
  induction: string;
};

const heading = {
  ...styles.text,
  fontSize: "16px",
  fontWeight: "bold",
  margin: "0 0 4px 0",
};

/**
 * Sent once, to a new applicant. It confirms receipt only: nothing here may
 * read as being accepted or confirmed as a volunteer. Voseo, like every
 * participant and visitor email (voseo.test.ts).
 */
export default function VolunteerApplicationReceivedEmailTemplate({
  firstName,
  festivalName,
  shifts,
  firstChoiceRole,
  secondChoiceRole,
  closesOn,
  festivalDetails,
  induction,
}: VolunteerApplicationReceivedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Recibimos tu postulación. Te contactaremos por WhatsApp.
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text
              style={{ ...styles.text, fontSize: "20px", fontWeight: "bold" }}
            >
              Recibimos tu postulación
            </Text>
            <Text style={styles.text}>
              Hola, {firstName}. Gracias por postular al voluntariado de{" "}
              {festivalName}. Te contactaremos por WhatsApp.
            </Text>
            <Text style={styles.text}>
              Postular no asegura un lugar en el equipo. Revisamos todas las
              postulaciones cuando cierra la convocatoria, el {closesOn}.
            </Text>

            <Section style={styles.detailBox}>
              <Text style={heading}>Turnos que marcaste</Text>
              {shifts.map((shift) => (
                <Text
                  key={`${shift.when}-${shift.label}`}
                  style={styles.detailLine}
                >
                  • <strong>{shift.when}</strong> — {shift.label}
                </Text>
              ))}
              <Text style={{ ...heading, marginTop: "12px" }}>
                Roles que preferís
              </Text>
              <Text style={styles.detailLine}>
                <strong>1ª opción:</strong> {firstChoiceRole}
              </Text>
              <Text style={styles.detailLine}>
                <strong>2ª opción:</strong> {secondChoiceRole}
              </Text>
            </Section>

            <Text style={styles.text}>
              {festivalDetails ? (
                <>
                  <strong>Festival:</strong> {festivalDetails}.
                  <br />
                </>
              ) : null}
              <strong>Inducción:</strong> {induction}.
            </Text>
            <Text style={styles.text}>
              ¿Te equivocaste en algún dato? Respondé a este correo y lo
              corregimos.
            </Text>
            <Text style={{ ...styles.text, fontSize: "12px" }}>
              Recibís este correo porque postulaste al voluntariado de Glitter.
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
  festivalName: "Glitter v11",
  shifts: [
    { when: "Vie 18 dic · 15:00–19:00", label: "Montaje" },
    { when: "Sáb 19 dic · 13:30–17:30", label: "Festival (turno A)" },
  ],
  firstChoiceRole: "Fotografía y redes sociales",
  secondChoiceRole: "Orientación al público",
  closesOn: "30 de noviembre",
  festivalDetails:
    "19 y 20 de diciembre de 2026, Teatro CBA, Santa Cruz de la Sierra",
  induction: "sábado 5 de diciembre",
} as VolunteerApplicationReceivedEmailProps;
