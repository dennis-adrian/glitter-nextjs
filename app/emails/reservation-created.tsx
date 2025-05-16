import { ReservationBase } from "@/app/api/reservations/definitions";
import { NewStandReservation } from "@/app/api/user_requests/actions";
import * as styles from "@/app/emails/styles";
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

type ReservationCreatedEmailTemplateProps = {
  festivalName: string;
  reservation: ReservationBase;
  creatorName: string;
  standName: string;
  standCategory: string;
};

export default function ReservationCreatedEmailTemplate(
  props: ReservationCreatedEmailTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  return (
    <Html>
      <Head />
      <Preview>
        {props.creatorName} creó una nueva reserva para el festival{" "}
        {props.festivalName}
      </Preview>
      <Body style={styles.main}></Body>
      <Container style={styles.container}>
        <Text style={styles.title}>
          <strong>{props.creatorName} creó una nueva reserva</strong>
        </Text>
        <Section style={styles.section}>
          <Text style={styles.text}></Text>
          <Text style={styles.text}>
            Reserva creada para el espacio <strong>{props.standName}</strong> en
            el sector de {props.standCategory}.
          </Text>
          <Text style={styles.text}>
            Puedes ver más detalles y/o aprobar la reserva haciendo clic en el
            botón
          </Text>
          <Button
            href={`${baseUrl}/dashboard/reservations/${props.reservation.id}/edit`}
            style={styles.button}
          >
            Ir a la reserva
          </Button>
        </Section>
      </Container>
    </Html>
  );
}

ReservationCreatedEmailTemplate.PreviewProps = {
  creatorName: "John Doe",
  festivalName: "Festival de prueba",
  reservation: {
    festivalId: 1,
    profileId: 1,
    standId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    id: 1,
    status: "pending",
  },
  standCategory: "Ilustradores",
  standName: "A2",
} as ReservationCreatedEmailTemplateProps;
