import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import { previewDate, previewScheduleLabel } from "@/app/emails/preview-dates";
import * as styles from "@/app/emails/styles";

export type ProgramSessionReminderSession = {
  title: string;
  typeLabel: string;
  programName: string;
  /** Preformatted — the template does no date maths. */
  scheduleLabel: string;
  venueLabel: string | null;
  ticketCode: string;
};

export type ProgramSessionReminderEmailProps = {
  attendeeName: string;
  /** Today's sessions, already in chronological order. Never empty. */
  sessions: ProgramSessionReminderSession[];
  /**
   * Where to find the QR again. Null for a guest, whose ticket lives only in
   * the confirmation email — the copy points them there instead of showing a
   * button that would land them on a sign-in wall.
   */
  ticketsUrl: string | null;
};

/**
 * The morning-of nudge for someone with a seat today.
 *
 * Deliberately carries no QR. The ticket QR is per seat, and a person with two
 * sessions today would need two of them — which turns a glanceable reminder
 * into a wall of images, in the one message people read on a phone while
 * getting ready. The code is printed instead, and the original confirmation
 * email still holds the scannable version.
 */
export default function ProgramSessionReminderEmailTemplate({
  attendeeName,
  sessions,
  ticketsUrl,
}: ProgramSessionReminderEmailProps) {
  const isSingle = sessions.length === 1;
  const first = sessions[0];

  /**
   * One program is the normal case. Two only happens when someone holds seats
   * across programs on the same day — and there naming just one of them would
   * be wrong, so the clause is dropped rather than guessed.
   */
  const programNames = new Set(sessions.map((session) => session.programName));
  const programSuffix =
    programNames.size === 1 ? ` de ${first.programName}` : "";

  return (
    <Html>
      <Head />
      <Preview>
        {isSingle
          ? `Hoy te espera 1 sesión${programSuffix}`
          : `Hoy te esperan ${sessions.length} sesiones${programSuffix}`}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {isSingle ? (
                <>
                  {attendeeName}, hoy es el día: te esperamos en{" "}
                  <strong>{first.title}</strong>.
                </>
              ) : (
                <>
                  {attendeeName}, hoy tenés{" "}
                  <strong>{sessions.length} sesiones</strong> con nosotros. Este
                  es tu plan del día:
                </>
              )}
            </Text>

            {sessions.map((session) => (
              <Section key={session.ticketCode} style={styles.detailBox}>
                <Text style={{ ...styles.detailLine, fontWeight: 600 }}>
                  {session.title}
                </Text>
                <Text style={styles.detailLine}>
                  {session.typeLabel} · {session.programName}
                </Text>
                <Text style={styles.detailLine}>{session.scheduleLabel}</Text>
                {session.venueLabel ? (
                  <Text style={styles.detailLine}>{session.venueLabel}</Text>
                ) : null}
                <Text style={{ ...styles.detailLine, fontSize: "12px" }}>
                  Entrada: <strong>{session.ticketCode}</strong>
                </Text>
              </Section>
            ))}

            <Text style={styles.text}>
              Llegá unos minutos antes con tu QR a mano para el ingreso.
            </Text>

            <Text style={styles.text}>
              Ah, y no te olvidés de traer algo para tomar apuntes: cuaderno,
              libreta o tu app de notas favorita. Siempre salen ideas que vas a
              querer anotar.
            </Text>

            {ticketsUrl ? (
              <Section style={{ textAlign: "center", margin: "16px 0" }}>
                <Button href={ticketsUrl} style={styles.primaryButton}>
                  {isSingle ? "Ver mi entrada" : "Ver mis entradas"}
                </Button>
              </Section>
            ) : null}

            <Hr style={{ margin: "16px 0" }} />
            <Text style={{ ...styles.text, fontSize: "12px" }}>
              {ticketsUrl
                ? "¿Buscás el QR? Está en el correo de confirmación que te enviamos al inscribirte, y también en el botón de arriba."
                : "¿Buscás el QR? Está en el correo de confirmación que te enviamos al inscribirte."}
            </Text>
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  );
}

/**
 * Two sessions, because the plural branch is the one worth eyeballing: the
 * singular case is a subset of it, but the day-plan list, its repeated detail
 * boxes, and the "N sesiones" wording only render here.
 */
ProgramSessionReminderEmailTemplate.PreviewProps = {
  attendeeName: "María Pérez",
  sessions: [
    {
      title: "Cómo vivir del arte",
      typeLabel: "Charla",
      programName: "Glitter Academy",
      scheduleLabel: previewScheduleLabel(
        previewDate(0, 15),
        previewDate(0, 16, 30),
      ),
      venueLabel: "Casa Glitter · Sala 2",
      ticketCode: "GLT-8F3K2A",
    },
    {
      title: "Taller de ilustración",
      typeLabel: "Taller",
      programName: "Glitter Academy",
      scheduleLabel: previewScheduleLabel(
        previewDate(0, 18),
        previewDate(0, 20),
      ),
      venueLabel: "Casa Glitter",
      ticketCode: "GLT-9D1P7Q",
    },
  ],
  ticketsUrl: "http://localhost:3000/my_programs",
} as ProgramSessionReminderEmailProps;
