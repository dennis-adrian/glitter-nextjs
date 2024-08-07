import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

import { GLITTER_EMAIL_HEADING_URL } from "@/app/lib/constants";
import {
  formatDate,
  formatFullDate,
  getWeekdayFromDate,
} from "@/app/lib/formatters";
import { FestivalBase } from "../data/festivals/definitions";
import { VisitorWithTickets } from "../data/visitors/actions";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";
import EmailFooter from "@/app/emails/email-footer";
import { getFestivalLogo } from "@/app/lib/utils";

type TicketEmailTemplateProps = {
  festival: FestivalBase;
  visitor: VisitorWithTickets;
};

export default function TicketEmailTemplate({
  visitor,
  festival,
}: TicketEmailTemplateProps) {
  const festivalTickets = getVisitorFestivalTickets(visitor, festival);
  const festivalLogo = getFestivalLogo(festival.festivalType);
  const qrCodeSrc =
    festivalTickets[0]?.qrcodeUrl || "https://via.placeholder.com/200";

  let weekDayLabel = "sábado y domingo";
  if (festivalTickets) {
    if (festivalTickets.length > 1) {
      weekDayLabel =
        getWeekdayFromDate(festivalTickets[0].date) +
        " y " +
        getWeekdayFromDate(festivalTickets[1].date);
    }
    if (festivalTickets.length === 1) {
      weekDayLabel = getWeekdayFromDate(festivalTickets[0].date);
    }
  }

  return (
    <Html>
      <Head />
      <Preview>
        Confirmación de tu entrada para {festival?.name || "Festival Glitter"}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={greeting}>Hola, {visitor?.firstName || "John"}</Text>
          <Text style={textLg}>
            Muchas gracias por registarte para {festival?.name || "Glitter"}. No
            te olvides mostrar tu entrada al ingresar al evento.
          </Text>
          <Section style={ticketContainer}>
            <Img
              style={marginAuto}
              alt="logo"
              src={festivalLogo}
              height={80}
              width={270}
            />
            <Section style={qrCodeContainer}>
              <Img
                style={qrCode}
                alt="código QR de la entrada"
                src={qrCodeSrc}
                height={204}
                width={204}
              />
            </Section>
            <Img
              style={marginAuto}
              alt="texto entrada"
              src={GLITTER_EMAIL_HEADING_URL}
              width={215}
              height={43}
            />
            <Text style={weekDayPill}>{weekDayLabel}</Text>
            <Section style={message}>
              Esta entrada es válida sólo para 1 persona y debe de ser mostrada
              al momento de ingresar al evento
              {festivalTickets?.length > 1 && (
                <Text style={{ height: "8px", padding: "0px" }}>
                  * Presentar esta misma entrada ambos días que asistas
                </Text>
              )}
            </Section>
            <Section style={{ margin: "16px auto", color: "white" }}>
              {festivalTickets &&
                festivalTickets.map((ticket) => (
                  <Row key={ticket.id}>
                    <Text style={ticketDate}>
                      {formatFullDate(ticket.date)} de 13:00 a 21:00
                    </Text>
                  </Row>
                ))}
            </Section>
            <Section style={addressLabel}>
              {festival?.locationLabel} - {festival?.address}
            </Section>
            <Img
              style={marginAuto}
              alt="email footer"
              src="https://utfs.io/f/3b37a55f-bde5-496c-923f-b90630ed456f-nj1kyl.png"
              height={118}
              width={80}
            />
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

TicketEmailTemplate.PreviewProps = {
  visitor: {
    firstName: "John",
    tickets: [
      {
        id: 1,
        date: formatDate(new Date()).plus({ days: 6 }).toJSDate(),
      },
    ],
  },
  festival: {
    address: "Calle Sucre #346",
    endDate: formatDate(new Date()).plus({ days: 3 }).toJSDate(),
    locationLabel: "Galería del CBA",
    name: "Festival Glitter",
    startDate: formatDate(new Date()).plus({ days: 2 }).toJSDate(),
  },
} as TicketEmailTemplateProps;

const main = {
  backgroundColor: "#ffffff",
  color: "#14252E",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const marginAuto = {
  margin: "0 auto",
};

const roundedLg = {
  borderRadius: "8px",
};

const textLg = {
  fontSize: "16px",
  lineHeight: "20px",
};

const maxWidthFit = {
  maxWidth: "fit-content",
};

const container = {
  padding: "20px 0",
  ...marginAuto,
};

const ticketContainer = {
  background: "linear-gradient(#6173CD, #b0b8e2, #96B440)",
  padding: "24px 24px 0",
  ...roundedLg,
};

const greeting = {
  fontSize: "30px",
  lineHeight: "36px",
  fontWeight: "700",
};

const backdropBlur = {
  backgroundColor: "rgba(255, 255, 255, 0.2)",
  backdropFilter: "blur(4px)",
};

const qrCodeContainer = {
  height: "240px",
  margin: "8px auto",
  width: "240px",
  ...backdropBlur,
  ...roundedLg,
};

const weekDayPill = {
  backgroundColor: "#6173CD",
  borderRadius: "16px",
  color: "white",
  fontWeight: "600",
  padding: "4px 12px",
  margin: "16px auto",
  textAlign: "center" as const,
  textTransform: "uppercase" as const,
  ...maxWidthFit,
};

const qrCode = {
  ...marginAuto,
  ...maxWidthFit,
  ...roundedLg,
};

const ticketDate = {
  ...maxWidthFit,
  ...marginAuto,
  ...textLg,
};

const message = {
  color: "white",
  margin: "16px auto",
  textAlign: "center" as const,
  maxWidth: "400px",
  fontSize: "18px",
  lineHeight: "20px",
  fontWeight: "400",
  letterSpacing: "-0.025em",
};

const addressLabel = {
  color: "white",
  margin: "0 auto 12px",
  fontSize: "14px",
  lineHeight: "20px",
  padding: "8px 16px",
  textAlign: "center" as const,
  ...backdropBlur,
  ...maxWidthFit,
  ...roundedLg,
};
