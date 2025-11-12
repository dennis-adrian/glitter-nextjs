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
							</strong>{" "}
							a las{" "}
							<strong>
								{formatDate(task.reservation.createdAt)
									.plus({ days: 5 })
									.toLocaleString(DateTime.TIME_SIMPLE)}
							</strong>
							.
						</Text>
						<Text style={styles.text}>
							Como se especifica en los términos y condiciones, toda reserva que
							no sea confirmada dentro de las 120 horas desde su creación será
							eliminada automáticamente.
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
