import * as styles from "@/app/emails/styles";
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
import { FestivalBase } from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { Interval } from "luxon";

interface RegistrationInvitationEmailTemplateProps {
  festival: FestivalBase;
  visitorName: string;
}

export default function RegistrationInvitationEmailTemplate(
  props: RegistrationInvitationEmailTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const daysInterval = Interval.fromDateTimes(
    formatDate(new Date()).startOf("day"),
    formatDate(props.festival.startDate).startOf("day"),
  )
    .toDuration()
    .toFormat("d");

  return (
    <Html>
      <Head />
      <Preview>Quedan {daysInterval} días para Glitter</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.banner}>
            <Img
              style={{ margin: "0 auto" }}
              width={170}
              src="https://utfs.io/f/e6820207-3eb1-43fd-b140-d00184fd8182-e81rey.png"
            />
          </Section>
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.titleWithBanner}>
              ¡{props.visitorName}, evita colas para ingresar al evento!
            </Text>
            <Text style={styles.text}>
              Este{" "}
              <strong>
                sábado {formatDate(props.festival.startDate).day} y domingo{" "}
                {formatDate(props.festival.endDate).day} de mayo
              </strong>{" "}
              tendremos una nueva versión del festival <strong>Glitter</strong>.
            </Text>
            <Text style={styles.text}>
              El ingreso al público es desde las{" "}
              <strong>10 de la mañana</strong> y tendremos sorpresas para las
              primeras 400 personas en entrar al evento.
            </Text>
            <Text style={styles.text}>
              ¡Evita colas y ahorra tiempo durante el registro en puerta! Haz
              clic en el botón para adquirir tu boleto virtual. El acceso al
              público es completamente gratuito.
            </Text>
            <Button
              href={`${baseUrl}/festivals/${props.festival.id}/registration`}
              style={styles.buttonWithBanner}
            >
              Adquirir mi boleto
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

RegistrationInvitationEmailTemplate.PreviewProps = {
  visitorName: "John",
  festival: {
    id: 1,
    startDate: formatDate(new Date()).plus({ days: 7 }).toJSDate(),
    endDate: formatDate(new Date()).plus({ days: 8 }).toJSDate(),
  },
} as RegistrationInvitationEmailTemplateProps;
