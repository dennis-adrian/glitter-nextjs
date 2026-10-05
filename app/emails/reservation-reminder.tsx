import EmailFooter from "@/app/emails/email-footer";
import { reservationStandLabel } from "@/app/lib/reservations/member-stands";
import * as styles from "@/app/emails/styles";
import { previewDate } from "@/app/emails/preview-dates";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";
import { ScheduledTaskWithProfileAndReservation } from "@/app/lib/profile_tasks/definitions";
import EmailHeader from "@/app/emails/email-header";
import { getUserName } from "@/app/lib/users/utils";
import { formatDisplayDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";

type ReservationReminderTemplateProps = {
  task: ScheduledTaskWithProfileAndReservation;
};

export default function ReservationReminderTemplate(
  props: ReservationReminderTemplateProps,
) {
  const { task } = props;
  const userName = getUserName(task.profile);
  // A full table is two stands, so the reminder has to name both.
  const standLabel = reservationStandLabel(task.reservation);
  const standCount = (task.reservation.members ?? []).filter(
    (member) => member.releasedAt == null,
  ).length;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const paymentsUrl = `${baseUrl}/profiles/${task.profile.id}/festivals/${task.reservation.festivalId}/reservations/${task.reservation.id}/payments`;

  return (
    <Html>
      <Head />
      <Preview>
        Recordá hacer el pago de tu reserva para{" "}
        {task.reservation.festival.name}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {userName}!</Text>
            <Text style={styles.text}>
              Te recordamos que tu reserva para{" "}
              {standCount > 1 ? "los espacios" : "el espacio"}{" "}
              <strong>{standLabel}</strong> para nuestro próximo festival{" "}
              <strong>{task.reservation.festival.name}</strong> aún está
              pendiente de pago.
            </Text>
            <Text style={styles.text}>
              Tu fecha límite de pago es el{" "}
              <strong>
                {formatDisplayDate(task.dueDate, DateTime.DATE_MED)}
              </strong>{" "}
              a las{" "}
              <strong>
                {formatDisplayDate(task.dueDate, DateTime.TIME_SIMPLE)}
              </strong>
              .
            </Text>
            <Text style={styles.text}>
              Si ya hiciste tu pago, subiste el comprobante a la página web y
              estás esperando confirmación, podés ignorar este correo. Las
              reservas pueden tomar hasta 48 horas en confirmarse pero el
              registro del pago evitará que sea eliminada.
            </Text>
            <Text style={styles.text}>
              Si tenés alguna duda, escribinos a{" "}
              <span style={styles.email}>soporte@productoraglitter.com</span>.
            </Text>
            <Button href={paymentsUrl} style={styles.button}>
              Completar el pago
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

ReservationReminderTemplate.PreviewProps = {
  task: {
    profile: {
      id: 1,
      displayName: "John Doe",
    },
    dueDate: previewDate(1, 18),
    reservation: {
      id: 42,
      festivalId: 7,
      festival: {
        name: "Festival de prueba",
      },
      createdAt: new Date("2024-07-02"),
      stand: {
        label: "A",
        standNumber: 2,
      },
    },
  },
};
