import EmailFooter from "@/app/emails/email-footer";
import { previewDate } from "@/app/emails/preview-dates";
import * as styles from "@/app/emails/styles";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import type {
  FestivalDate,
  FestivalWithDates,
} from "@/app/lib/festivals/definitions";
import { formatDisplayDate } from "@/app/lib/formatters";
import { getFestivalLogo } from "@/app/lib/utils";
import { DateTime } from "luxon";
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
} from "react-email";

interface RegistrationInvitationEmailTemplateProps {
  festival: FestivalWithDates;
  /** The visitor's first name, when we have one, for the greeting. */
  visitorName?: string | null;
  /** Where this visitor stops receiving these invitations. */
  unsubscribeUrl?: string;
}

/** Kept beside the template so the send and the admin preview agree. */
export function registrationInvitationSubject(
  festival: Pick<FestivalWithDates, "name">,
) {
  return `Te invitamos a ${festival.name}`;
}

/** "Sábado, 15 de noviembre · 10:00 AM a 8:00 PM" */
function dayLine(date: Pick<FestivalDate, "startDate" | "endDate">) {
  const day = formatDisplayDate(date.startDate, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const opens = formatDisplayDate(date.startDate, DateTime.TIME_SIMPLE);
  const hours =
    date.endDate > date.startDate
      ? `${opens} a ${formatDisplayDate(date.endDate, DateTime.TIME_SIMPLE)}`
      : `desde las ${opens}`;
  return `${capitalize(day)} · ${hours}`;
}

function capitalize(text: string) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** Mail clients cannot resolve a path against our site. */
function absoluteUrl(url: string, baseUrl: string) {
  return url.startsWith("/") ? `${baseUrl}${url}` : url;
}

export default function RegistrationInvitationEmailTemplate(
  props: RegistrationInvitationEmailTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const { festival } = props;
  const dates = festival.festivalDates;
  const visitorName = props.visitorName?.trim();
  const dateLabel =
    dates.length > 0 ? capitalize(getFestivalDateLabel(festival)) : null;
  const location = [festival.locationLabel, festival.address]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ");
  const art =
    festival.posterUrl ?? festival.festivalBannerUrl ?? festival.thumbnailUrl;
  const poster = art ? absoluteUrl(art, baseUrl) : null;
  const registrationUrl = `${baseUrl}/festivals/${festival.id}/registration?${new URLSearchParams(
    {
      utm_source: "glitter_email",
      utm_medium: "email",
      utm_campaign: "registration_invitation",
      utm_content: `festival_${festival.id}`,
    },
  )}`;
  const gifts =
    dates.length > 1
      ? "Tenemos regalos para las primeras personas en llegar cada día."
      : "Tenemos regalos para las primeras personas en llegar.";

  return (
    <Html>
      <Head />
      <Preview>
        {dateLabel ? `${dateLabel} · ` : ""}Registrate gratis y conseguí tu
        entrada. {gifts}
      </Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          {/* The poster carries the festival's own look; without one, the
              logo needs the brand banner, since it is white. */}
          {poster ? null : (
            <Section style={logoBanner}>
              <Img
                style={{ margin: "0 auto" }}
                width={170}
                src={getFestivalLogo(festival.festivalType)}
                alt={festival.name}
              />
            </Section>
          )}

          <Section style={hero}>
            {visitorName ? (
              <Text style={greeting}>¡Hola, {visitorName}!</Text>
            ) : null}
            <Text style={intro}>Te invitamos a</Text>
            <Text style={headline}>{festival.name}</Text>
            {dateLabel ? <Text style={subheadline}>{dateLabel}</Text> : null}
            <Text style={pitch}>
              Registrate gratis y conseguí tu entrada. {gifts}
            </Text>
            <Button href={registrationUrl} style={cta}>
              Conseguir mi entrada
            </Button>
          </Section>

          {poster ? (
            <Section style={posterSection}>
              <Link href={registrationUrl}>
                <Img
                  src={poster}
                  alt={
                    dateLabel
                      ? `${festival.name} · ${dateLabel}`
                      : festival.name
                  }
                  // Outlook ignores CSS widths on images; it needs pixels.
                  width={480}
                  style={posterImage}
                />
              </Link>
            </Section>
          ) : null}

          <Section style={styles.detailBox}>
            {dates.length > 0 ? (
              <>
                <Text style={detailLabel}>Cuándo</Text>
                {dates.map((date) => (
                  <Text key={date.id} style={styles.detailLine}>
                    {dayLine(date)}
                  </Text>
                ))}
              </>
            ) : null}
            {location ? (
              <>
                <Text style={detailLabel}>Dónde</Text>
                <Text style={styles.detailLine}>
                  {location}
                  {festival.locationUrl ? (
                    <>
                      {" · "}
                      <Link href={festival.locationUrl} style={link}>
                        Ver en el mapa
                      </Link>
                    </>
                  ) : null}
                </Text>
              </>
            ) : null}
            <Text style={detailLabel}>Entrada</Text>
            <Text style={styles.detailLine}>
              Libre, con registro. Elegí el día que vas a venir y te enviamos tu
              entrada con un código QR para mostrar en el ingreso.
            </Text>
          </Section>

          <Section style={closing}>
            <Text style={sendOff}>¡Te esperamos!</Text>
            <Button href={registrationUrl} style={cta}>
              Conseguir mi entrada
            </Button>
          </Section>
        </Container>
        <EmailFooter unsubscribeUrl={props.unsubscribeUrl} />
      </Body>
    </Html>
  );
}

const logoBanner = {
  ...styles.banner,
  borderRadius: "8px",
  marginBottom: "8px",
};

const hero = {
  padding: "16px 24px 24px",
  textAlign: "center" as const,
};

const greeting = {
  margin: "0 0 12px",
  fontSize: "16px",
};

const intro = {
  margin: "0 0 4px",
  fontSize: "16px",
  color: "#6a737d",
};

const headline = {
  ...styles.title,
  margin: "0 0 8px",
  fontWeight: 700,
};

const subheadline = {
  margin: "0 0 16px",
  fontSize: "16px",
  fontWeight: 600,
  color: "#5b21b6",
};

const pitch = {
  margin: "0 0 20px",
  fontSize: "16px",
  lineHeight: 1.5,
};

const cta = {
  ...styles.primaryButton,
  fontSize: "16px",
  padding: "14px 28px",
};

const posterSection = {
  padding: "0 0 8px",
  textAlign: "center" as const,
};

const posterImage = {
  display: "block",
  width: "100%",
  maxWidth: "480px",
  height: "auto",
  borderRadius: "8px",
};

const detailLabel = {
  ...styles.text,
  margin: "12px 0 2px",
  fontSize: "14px",
  fontWeight: 700,
};

const link = {
  color: "#15c",
  textDecoration: "underline",
};

const sendOff = {
  margin: "0 0 16px",
  fontSize: "18px",
  fontWeight: 600,
};

const closing = {
  padding: "8px 0 24px",
  textAlign: "center" as const,
};

RegistrationInvitationEmailTemplate.PreviewProps = {
  visitorName: "Camila",
  unsubscribeUrl: "http://localhost:3000/email/unsubscribe?token=preview",
  festival: {
    id: 1,
    name: "Glitter 5ta Edición - Max el Caimán",
    festivalType: "glitter",
    posterUrl: "/img/landing-festivals/glitter-characters.png",
    festivalBannerUrl: null,
    thumbnailUrl: null,
    locationLabel: "Centro de Convenciones Fexpocruz",
    address: "Av. Roca y Coronado, Santa Cruz de la Sierra",
    locationUrl: "https://maps.google.com/?q=Fexpocruz",
    festivalDates: [
      { id: 1, startDate: previewDate(6, 10), endDate: previewDate(6, 20) },
      { id: 2, startDate: previewDate(7, 10), endDate: previewDate(7, 19) },
    ],
  },
} as unknown as RegistrationInvitationEmailTemplateProps;
