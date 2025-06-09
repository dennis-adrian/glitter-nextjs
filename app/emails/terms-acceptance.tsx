import { BaseProfile } from "@/app/api/users/definitions";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import { formatDate } from "@/app/lib/formatters";
import { getUserName } from "@/app/lib/users/utils";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { DateTime } from "luxon";
import { FestivalBase } from "../lib/festivals/definitions";

interface FestivalActivationTemplateProps {
  profile: BaseProfile;
  festival: FestivalBase;
}

export default function TermsAcceptanceEmailTemplate({
  profile,
  festival,
}: FestivalActivationTemplateProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const userName = getUserName(profile);
  const fullDate = formatDate(festival.reservationsStartDate).toLocaleString(
    DateTime.DATE_FULL,
  );
  const hour = formatDate(festival.reservationsStartDate).toLocaleString(
    DateTime.TIME_24_SIMPLE,
  );

  return (
    <Html>
      <Head />
      <Preview>{userName} ha aceptado los términos y condiciones</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              <strong>{userName}</strong> ha aceptado los términos y condiciones
              para participar en el festival {festival.name}
            </Text>
            <Text style={styles.text}>
              Este perfil podrá hacer su reserva el día {fullDate} a partir de
              las {hour}
            </Text>
            <Text style={styles.text}>
              Si te gustaría ver el perfil del participante haz clic en el botón
            </Text>
            <Button
              href={`${baseUrl}/dashboard/users/${profile.id}`}
              style={styles.button}
            >
              Ir a perfil
            </Button>
          </Section>
        </Container>
        <Container style={styles.footer}>
          <Img
            style={{ margin: "4px auto" }}
            src="https://utfs.io/f/a4e5ba5d-5403-4c59-99c0-7e170bb2d6f5-f0kpla.png"
            width={32}
          />
          <Text style={styles.footerText}>Enviado por el equipo Glitter</Text>
          <Text style={styles.footerText}>
            © 2024 | Productora Glitter, Santa Cruz, Bolivia{" "}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

TermsAcceptanceEmailTemplate.PreviewProps = {
  profile: {
    id: 90,
    displayName: "John Doe",
  },
  festival: {
    id: 11,
    name: "Glitter 10ma edición",
    reservationsStartDate: new Date("2024-08-10 22:00:00"),
  },
} as FestivalActivationTemplateProps;
