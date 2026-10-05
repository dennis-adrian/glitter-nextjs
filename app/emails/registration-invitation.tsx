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
import {
  formatDate,
  formatFullDate,
  formatDisplayDate,
} from "@/app/lib/formatters";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { getFestivalLogo } from "@/app/lib/utils";
import { FestivalWithDates } from "../lib/festivals/definitions";
import EmailFooter from "@/app/emails/email-footer";

interface RegistrationInvitationEmailTemplateProps {
  festival: FestivalWithDates;
  /** The visitor's first name, when we have one, for the greeting. */
  visitorName?: string | null;
  /** Where this visitor stops receiving these invitations. */
  unsubscribeUrl?: string;
}

export default function RegistrationInvitationEmailTemplate(
  props: RegistrationInvitationEmailTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const dates = props.festival.festivalDates;
  const firstDate = dates[0];
  const visitorName = props.visitorName?.trim();
  const festivalLabel =
    props.festival.festivalType.charAt(0).toUpperCase() +
    props.festival.festivalType.slice(1);
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
            {visitorName ? (
              <Text style={styles.text}>¡Hola, {visitorName}!</Text>
            ) : null}
            <Text style={styles.text}>
              {firstDate ? (
                <>
                  Este{" "}
                  {dates.length > 1 ? (
                    <strong>{getFestivalDateLabel(props.festival)}</strong>
                  ) : (
                    <strong>{formatFullDate(firstDate.startDate)}</strong>
                  )}{" "}
                  te
                </>
              ) : (
                "Te"
              )}{" "}
              invitamos a ser parte del festival{" "}
              <strong>{props.festival.name}</strong>.
            </Text>
            {firstDate ? (
              <Text style={styles.text}>
                El ingreso al público es desde las{" "}
                <strong>
                  {formatDisplayDate(firstDate.startDate, {
                    hour: "numeric",
                    minute: "numeric",
                  })}
                </strong>{" "}
                y tendremos sorpresas para las primeras 200 personas por día en
                ingresar al evento.
              </Text>
            ) : null}
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
        <EmailFooter unsubscribeUrl={props.unsubscribeUrl} />
      </Body>
    </Html>
  );
}

RegistrationInvitationEmailTemplate.PreviewProps = {
  visitorName: "Camila",
  unsubscribeUrl: "http://localhost:3000/email/unsubscribe?token=preview",
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
