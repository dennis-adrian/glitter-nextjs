import * as styles from "@/app/emails/styles";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { formatDate, formatFullDate } from "@/app/lib/formatters";
import { Interval } from "luxon";

interface RegistrationInvitationEmailTemplateProps {
  festival: FestivalWithDates;
}

export default function RegistrationInvitationEmailTemplate(
  props: RegistrationInvitationEmailTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const daysInterval = Interval.fromDateTimes(
    formatDate(new Date()).startOf("day"),
    formatDate(props.festival.festivalDates[0].startDate).startOf("day"),
  )
    .toDuration()
    .toFormat("d");

  const dates = props.festival.festivalDates;
  const festivalLabel =
    props.festival.festivalType === "glitter" ? "Glitter" : "Twinkler";

  return (
    <Html>
      <Head />
      <Preview>
        Quedan {daysInterval} días para el festival {festivalLabel}
      </Preview>
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
              ¡Evita colas para ingresar al evento!
            </Text>
            <Text style={styles.text}>
              Este{" "}
              {dates.length > 1 ? (
                <strong>
                  {formatFullDate(dates[0].startDate)} a{" "}
                  {formatFullDate(dates[dates.length - 1].startDate)}
                </strong>
              ) : (
                <strong>{formatFullDate(dates[0].startDate)}</strong>
              )}{" "}
              tendremos una nueva versión del festival{" "}
              <strong>{festivalLabel}</strong>.
            </Text>
            <Text style={styles.text}>
              El ingreso al público es desde las{" "}
              <strong>
                {formatDate(dates[0].startDate).toLocaleString({
                  hour: "numeric",
                  minute: "numeric",
                })}
              </strong>{" "}
              y tendremos sorpresas para las primeras 200 personas en entrar al
              evento.
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
  festival: {
    id: 1,
    festivalDates: [
      {
        startDate: formatDate(new Date()).plus({ days: 7 }).toJSDate(),
      },
      {
        startDate: formatDate(new Date()).plus({ days: 8 }).toJSDate(),
      },
    ],
  },
} as RegistrationInvitationEmailTemplateProps;
