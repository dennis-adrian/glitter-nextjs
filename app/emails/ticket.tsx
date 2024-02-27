import {
  Container,
  Head,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

import {
  GLITTER_EMAIL_HEADING_URL,
  GLITTER_EMAIL_LOGO_URL,
  SAMY_HEAD_URL,
} from "@/app/lib/costants";
import { formatFullDate, getWeekdayFromDate } from "@/app/lib/formatters";
import { FestivalBase } from "../api/festivals/definitions";
import { VisitorWithTickets } from "../api/visitors/actions";

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
      <Tailwind>
        <Head></Head>
        <Preview>
          Muchas gracias por registrarte para {festival?.name || "Glitter"}. No
          te olvides mostrar tu entrada al ingresar al evento.
        </Preview>
        <Section style={main}>
          <Container style={container}>
            <Text className="text-3xl font-bold">
              Hola, {visitor?.firstName || "John"}
            </Text>
            <Text className="text-lg">
              Muchas gracias por registarte para {festival?.name || "Glitter"}.
              No te olvides mostrar tu entrada al ingresar al evento.
            </Text>
            <Section
              className="rounded-lg p-6 pb-0 md:p-8 md:pb-0"
              style={{ background: "linear-gradient(#99A4E6, #52B0E6)" }}
            >
              <Img
                className="m-auto"
                alt="Logo de Glitter con descripción"
                src={GLITTER_EMAIL_LOGO_URL}
                height={68}
                width={180}
              />
              <Section className="my-2 h-60 w-60 rounded-lg bg-white/50 backdrop-blur-sm">
                <Img
                  className="m-auto max-w-fit rounded-lg"
                  alt="código QR de la entrada"
                  src={qrCodeSrc}
                  height={204}
                  width={204}
                />
              </Section>
              <Img
                className="m-auto"
                alt="texto entrada"
                src={GLITTER_EMAIL_HEADING_URL}
                width={215}
                height={43}
              />
              <Text className="mx-auto my-4 max-w-fit rounded-2xl bg-blue-900 px-3 py-1 text-center font-semibold uppercase text-white">
                {weekDayLabel}
              </Text>
              <Section className="my-2 max-w-[400px] text-center text-lg leading-5 tracking-tight">
                Esta entrada es válida sólo para 1 persona y debe de ser
                mostrada al momento de ingresar al evento
                {visitor?.tickets?.length > 1 && (
                  <Text className="h-2 p-0">
                    * Presentar esta misma entrada ambos días que asistas
                  </Text>
                )}
              </Section>
              <Section className="my-4 text-white">
                {visitor?.tickets ? (
                  visitor.tickets.map((ticket) => (
                    <Row key={ticket.id}>
                      <Text className="m-auto max-w-fit text-lg">
                        {formatFullDate(new Date(ticket.date))} de 10:00 a 19:00
                      </Text>
                    </Row>
                  ))
                ) : (
                  <Row>
                    <Text className="m-auto max-w-fit text-lg">
                      {formatFullDate(new Date())} de 10:00 a 19:00
                    </Text>
                  </Row>
                )}
              </Section>
              <Section className="mb-3 flex w-fit items-center justify-center rounded-lg bg-white/50 px-4 py-2 text-sm backdrop-blur-sm">
                {festival?.locationLabel || "Galería del CBA. Calle Sucre 346"}
              </Section>
              <Img
                className="m-auto"
                alt="Samy"
                src={SAMY_HEAD_URL}
                height={92}
                width={120}
              />
            </Section>
          </Container>
        </Section>
      </Tailwind>
    </Html>
  );
}

const main = {
  backgroundColor: "#ffffff",
  color: "#14252E",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0",
};
