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
import { BaseProfile } from "@/app/api/users/definitions";
import { getUserName } from "@/app/lib/users/utils";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import { StandBase } from "@/app/api/stands/definitions";
import { FestivalBase } from "../lib/festivals/definitions";

type ProfileRejectionEmailTemplateProps = {
  profile: BaseProfile;
  stand: StandBase;
  festival: FestivalBase;
  reason?: string;
};

export default function ReservationRejectionEmailTemplate(
  props: ProfileRejectionEmailTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const userName = getUserName(props.profile);

  return (
    <Html>
      <Head />
      <Preview>Lamentamos informarte que tu reserva ha sido eliminada</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {userName}!</Text>
            <Text style={styles.text}>
              Lamentamos informarte que tu reserva para el espacio{" "}
              <strong>
                {props.stand.label}
                {props.stand.standNumber}
              </strong>{" "}
              en el festival <strong>{props.festival.name}</strong> ha sido
              eliminada.
            </Text>
            {props.reason ? (
              <>
                <Text style={styles.text}>
                  La razón te la describimos acontinuación:
                </Text>
                <Text style={styles.standoutText}>{props.reason}</Text>
              </>
            ) : null}
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

ReservationRejectionEmailTemplate.PreviewProps = {
  festival: {
    name: "Glitter 10ma edición",
  },
  profile: {
    displayName: "Pandora",
  },
  stand: {
    label: "A",
    standNumber: 2,
  },
  reason: "El pago no ha sido efectuado a tiempo",
} as ProfileRejectionEmailTemplateProps;
