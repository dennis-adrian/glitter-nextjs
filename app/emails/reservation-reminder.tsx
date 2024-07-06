import EmailFooter from "@/app/emails/email-footer";
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
import { formatDate, formatFullDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import { create } from "domain";

type ReservationReminderTemplateProps = {
  task: ScheduledTaskWithProfileAndReservation;
};

export default function ReservationReminderTemplate(
  props: ReservationReminderTemplateProps,
) {
  const { task } = props;
  const userName = getUserName(task.profile);

  return (
    <Html>
      <Head />
      <Preview>Completa tu perfil para participar de nuestros eventos</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {userName}!</Text>
            <Text style={styles.text}>
              Te recordamos que tu reserva para el espacio{" "}
              <strong>
                {task.reservation.stand.label}
                {task.reservation.stand.standNumber}
              </strong>{" "}
              para nuestro próximo festival{" "}
              <strong>{task.reservation.festival.name}</strong> aún está
              pendiente de pago.
            </Text>
            <Text style={styles.text}>
              Tu fecha límite de pago es el{" "}
              <strong>
                {formatDate(task.reservation.createdAt)
                  .plus({ days: 5 })
                  .toLocaleString(DateTime.DATE_MED)}
              </strong>
              .
            </Text>
            <Text style={styles.text}>
              Como se especifica en los términos y condiciones, toda reserva que
              no sea pagada a tiempo será eliminada automáticamente. Tu reserva
              se eliminará automáticamente el día{" "}
              <strong>
                {formatDate(task.reservation.createdAt)
                  .plus({ days: 6 })
                  .toLocaleString(DateTime.DATE_FULL)}
              </strong>
              .
            </Text>
            <Text style={styles.text}>
              Si ya hiciste tu pago, lo subiste a la página y estás esperando
              confirmación puedes ignorar este correo. Confirmaremos tu reserva
              en el transcurso del día.
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
