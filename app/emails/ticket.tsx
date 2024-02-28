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

import {
  GLITTER_EMAIL_HEADING_URL,
  GLITTER_EMAIL_LOGO_URL,
  SAMY_HEAD_URL,
} from "@/app/lib/costants";
import { formatFullDate, getWeekdayFromDate } from "@/app/lib/formatters";
import { FestivalBase } from "../api/festivals/definitions";
import { VisitorWithTickets } from "../data/visitors/actions";

export default function TicketEmailTemplate({
  visitor,
  festival,
}: {
  festival: FestivalBase;
  visitor: VisitorWithTickets;
}) {
  const qrCodeSrc =
    visitor?.tickets[0]?.qrcodeUrl || "https://via.placeholder.com/200";

  let weekDayLabel = "sábado y domingo";
  if (visitor?.tickets) {
    if (visitor?.tickets.length > 1) {
      getWeekdayFromDate(new Date(visitor.tickets[0].date)) +
        " y " +
        getWeekdayFromDate(new Date(visitor.tickets[1].date));
    }
    if (visitor.tickets.length === 1) {
      getWeekdayFromDate(new Date(visitor.tickets[0].date));
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
              alt="Logo de Glitter con descripción"
              src={GLITTER_EMAIL_LOGO_URL}
              height={68}
              width={180}
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
              {visitor?.tickets?.length > 1 && (
                <Text style={{ height: "8px", padding: "0px" }}>
                  * Presentar esta misma entrada ambos días que asistas
                </Text>
              )}
            </Section>
            <Section style={{ margin: "16px auto", color: "white" }}>
              {visitor?.tickets ? (
                visitor.tickets.map((ticket) => (
                  <Row key={ticket.id}>
                    <Text style={ticketDate}>
                      {formatFullDate(new Date(ticket.date))} de 10:00 a 19:00
                    </Text>
                  </Row>
                ))
              ) : (
                <Row>
                  <Text style={ticketDate}>
                    {formatFullDate(new Date())} de 10:00 a 19:00
                  </Text>
                </Row>
              )}
            </Section>
            <Section style={addressLabel}>
              {festival?.locationLabel || "Galería del CBA. Calle Sucre 346"}
            </Section>
            <Img
              style={marginAuto}
              alt="Samy"
              src={SAMY_HEAD_URL}
              height={92}
              width={120}
            />
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

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
  fontSize: "18px",
  lineHeight: "24px",
};

const maxWidthFit = {
  maxWidth: "fit-content",
};

const container = {
  padding: "20px 0",
  ...marginAuto,
};

const ticketContainer = {
  background: "linear-gradient(#99A4E6, #52B0E6)",
  padding: "24px 24px 0",
  ...roundedLg,
};

const greeting = {
  fontSize: "30px",
  lineHeight: "36px",
  fontWeight: "700",
};

const backdropBlur = {
  backgroundColor: "rgba(255, 255, 255, 0.5)",
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
  backgroundColor: "rgb(30 58 138)",
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
  margin: "16px auto",
  textAlign: "center" as const,
  maxWidth: "400px",
  fontSize: "18px",
  lineHeight: "20px",
  fontWeight: "400",
  letterSpacing: "-0.025em",
};

const addressLabel = {
  margin: "0 auto 12px",
  fontSize: "14px",
  lineHeight: "20px",
  padding: "8px 16px",
  ...backdropBlur,
  ...maxWidthFit,
  ...roundedLg,
};
