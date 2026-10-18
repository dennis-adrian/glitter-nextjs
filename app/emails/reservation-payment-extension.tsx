import EmailFooter from "@/app/emails/email-footer";
import { reservationStandLabel } from "@/app/lib/reservations/member-stands";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import { BaseProfile } from "@/app/api/users/definitions";
import { previewDate } from "@/app/emails/preview-dates";
import { formatDate, formatDisplayDate } from "@/app/lib/formatters";
import { getUserName } from "@/app/lib/users/utils";
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
import { DateTime } from "luxon";

type ReservationPaymentExtensionTemplateProps = {
  /** Who is being written to. */
  recipient: BaseProfile;
  /** The cobro is in their name, so only they can upload the voucher. */
  owner: BaseProfile;
  isOwner: boolean;
  reservation: {
    id: number;
    festivalId: number;
    /** The originally selected half; `members` is what is occupied. */
    stand: { label: string | null; standNumber: number };
    members?: {
      position: number;
      releasedAt: Date | null;
      stand: { label: string | null; standNumber: number };
    }[];
    festival: { name: string };
  };
  newDueDate: Date;
};

export default function ReservationPaymentExtensionTemplate(
  props: ReservationPaymentExtensionTemplateProps,
) {
  const { recipient, owner, isOwner, reservation, newDueDate } = props;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const userName = getUserName(recipient);
  const ownerName = getUserName(owner);
  const standLabel = reservationStandLabel(reservation);
  const standCount = (reservation.members ?? []).filter(
    (member) => member.releasedAt == null,
  ).length;
  const spaceWord = standCount > 1 ? "los espacios" : "el espacio";
  const dueDate = formatDate(newDueDate);
  // Each recipient's own profile: the route turns away anyone else, and a
  // partner lands on the read-only view of the cobro.
  const paymentsUrl = `${baseUrl}/profiles/${recipient.id}/festivals/${reservation.festivalId}/reservations/${reservation.id}/payments`;

  return (
    <Html>
      <Head />
      <Preview>
        {isOwner
          ? `Tenés más tiempo para pagar tu reserva en ${reservation.festival.name}`
          : `Hay más tiempo para pagar la reserva que compartís en ${reservation.festival.name}`}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {userName}!</Text>
            {isOwner ? (
              <Text style={styles.text}>
                Extendimos la fecha límite de pago de tu reserva para{" "}
                {spaceWord} <strong>{standLabel}</strong> en el festival{" "}
                <strong>{reservation.festival.name}</strong>.
              </Text>
            ) : (
              <Text style={styles.text}>
                Extendimos la fecha límite de pago de la reserva que compartís
                con <strong>{ownerName}</strong> para {spaceWord}{" "}
                <strong>{standLabel}</strong> en el festival{" "}
                <strong>{reservation.festival.name}</strong>.
              </Text>
            )}
            <Text style={styles.text}>
              La nueva fecha límite es el{" "}
              <strong>{formatDisplayDate(dueDate, DateTime.DATE_MED)}</strong> a
              las{" "}
              <strong>
                {formatDisplayDate(dueDate, DateTime.TIME_SIMPLE)}
              </strong>
              .
            </Text>
            {isOwner ? (
              <Text style={styles.text}>
                Recordá subir el comprobante de pago antes de esa fecha para
                confirmar tu reserva.
              </Text>
            ) : (
              <Text style={styles.text}>
                El cobro está a nombre de <strong>{ownerName}</strong>, así que
                le corresponde subir el comprobante antes de esa fecha para
                confirmar la reserva.
              </Text>
            )}
            <Text style={styles.text}>
              Si tenés alguna duda, escribinos a{" "}
              <span style={styles.email}>soporte@productoraglitter.com</span>.
            </Text>
            <Button href={paymentsUrl} style={styles.button}>
              {isOwner ? "Completar el pago" : "Ver el estado del pago"}
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

ReservationPaymentExtensionTemplate.PreviewProps = {
  recipient: {
    id: 2,
    displayName: "Carla Dibuja",
  },
  owner: {
    id: 1,
    displayName: "Ana Ilustra",
  },
  isOwner: false,
  reservation: {
    id: 42,
    festivalId: 7,
    festival: {
      name: "Festival de prueba",
    },
    stand: {
      label: "A",
      standNumber: 2,
    },
  },
  newDueDate: previewDate(3, 18),
} as unknown as ReservationPaymentExtensionTemplateProps;
