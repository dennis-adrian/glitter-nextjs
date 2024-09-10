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
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { getFestivalLogo } from "@/app/lib/utils";

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
  const festivalLogo = getFestivalLogo(props.festival.festivalType);

  return (
    <Html>
      <Head />
      <Preview>Te invitamos a visitar el festival {festivalLabel}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.banner}>
            <Img style={{ margin: "0 auto" }} width={170} src={festivalLogo} />
          </Section>
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.titleWithBanner}>
              ¡Evita colas para ingresar al evento!
            </Text>
            <Text style={styles.text}>
              Este{" "}
              {dates.length > 1 ? (
                <strong>{getFestivalDateLabel(props.festival)}</strong>
              ) : (
                <strong>{formatFullDate(dates[0].startDate)}</strong>
              )}{" "}
              te invitamos a ser parte del festival{" "}
              <strong>{props.festival.name}</strong>.
            </Text>
            <Text style={styles.text}>
              El ingreso al público es desde las{" "}
              <strong>
                {formatDate(dates[0].startDate).toLocaleString({
                  hour: "numeric",
                  minute: "numeric",
                })}
              </strong>{" "}
              y tendremos sorpresas para las primeras 200 personas por día en
              ingresar al evento.
            </Text>
            <Text style={styles.text}>
              ¡Evita colas y ahorra tiempo durante el registro en puerta! Haz
              clic en el botón para adquirir tu boleto virtual. El ingreso al
              evento no tiene costo.
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
    name: "Glitter 5ta Edición - Max el Caimán",
    festivalDates: [
      {
        startDate: formatDate(new Date()).plus({ days: 6 }).toJSDate(),
      },
      {
        startDate: formatDate(new Date()).plus({ days: 7 }).toJSDate(),
      },
    ],
    festivalType: "glitter",
  },
} as RegistrationInvitationEmailTemplateProps;
