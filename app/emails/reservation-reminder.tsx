import EmailFooter from "@/app/emails/email-footer";
import { reservationStandLabel } from "@/app/lib/reservations/member-stands";
import * as styles from "@/app/emails/styles";
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { ScheduledTaskWithProfileAndReservation } from "@/app/lib/profile_tasks/definitions";
import EmailHeader from "@/app/emails/email-header";
import { getUserName } from "@/app/lib/users/utils";
import { formatDate } from "@/app/lib/formatters";
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

  return (
    <Html>
      <Head />
      <Preview>
        Recuerda hacer el pago de tu reserva para{" "}
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
              <strong>{standLabel}</strong>{" "}
              para nuestro próximo festival{" "}
              <strong>{task.reservation.festival.name}</strong> aún está
              pendiente de pago.
            </Text>
            <Text style={styles.text}>
              Tu fecha límite de pago es el{" "}
              <strong>
                {formatDate(task.dueDate).toLocaleString(DateTime.DATE_MED)}
              </strong>{" "}
              a las{" "}
              <strong>
                {formatDate(task.dueDate).toLocaleString(DateTime.TIME_SIMPLE)}
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
              Si tenés alguna duda, no dudes en contactarnos a nuesto correo
              electrónico{" "}
              <span style={styles.email}>soporte@productoraglitter.com</span>
            </Text>
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
      displayName: "John Doe",
    },
    dueDate: new Date("2024-07-07T18:00:00"),
    reservation: {
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
