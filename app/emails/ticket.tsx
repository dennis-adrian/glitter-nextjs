import * as styles from "@/app/emails/styles";
import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

import { formatDate } from "@/app/lib/formatters";
import { FestivalBase } from "../data/festivals/definitions";
import { VisitorBase } from "../data/visitors/actions";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import { TicketBase } from "@/app/data/tickets/actions";
import { getTicketCode } from "@/app/lib/tickets/utils";
import { DateTime } from "luxon";

type TicketEmailTemplateProps = {
  festival: FestivalBase;
  visitor: VisitorBase;
  ticket: TicketBase;
};

export default function TicketEmailTemplate({
  visitor,
  festival,
  ticket,
}: TicketEmailTemplateProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const ticketCode = getTicketCode(
    festival.festivalCode || "",
    ticket.ticketNumber || 0,
  );
  const numberOfCompanions = ticket.numberOfVisitors - 1;
  const ticketDate = formatDate(ticket.date).toLocaleString(DateTime.DATE_MED);
  return (
    <Html>
      <Head />
      <Preview>Muestra tu entrada en puerta para ingresar al evento</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>
              {visitor.firstName}, ya tienes tu entrada para el festival{" "}
              <strong>{festival.name}</strong>
            </Text>
            <Text style={styles.text}>
              No te olvides mostrar el código en puerta para poder ingresar al
              evento
            </Text>
            <Section style={ticketContainer}>
              {festival.mascotUrl && (
                <Img
                  style={marginAuto}
                  alt="logo"
                  src={festival.mascotUrl}
                  height={150}
                  width={150}
                />
              )}
              <Text style={festivalName}>{festival.name}</Text>
              <Hr />
              <Row width="100%" style={{ margin: "16px 0" }}>
                <Column style={{ textAlign: "left", width: "50%" }}>
                  <Text style={textLg}>
                    {visitor.firstName} {visitor.lastName}
                  </Text>
                  {numberOfCompanions > 0 && (
                    <Text
                      style={{ ...styles.text, fontSize: "12px", margin: 0 }}
                    >
                      +{numberOfCompanions} acompañante(s)
                    </Text>
                  )}
                </Column>
                <Column style={{ textAlign: "right", width: "50%" }}>
                  <Text
                    style={{ fontSize: "18px", margin: 0, fontWeight: 600 }}
                  >
                    {ticketDate}
                  </Text>
                  <Text
                    style={{
                      ...styles.text,
                      fontSize: "12px",
                      margin: 0,
                      textAlign: "right",
                      lineHeight: "16px",
                    }}
                  >
                    {festival.locationLabel}
                  </Text>
                  <Text
                    style={{
                      ...styles.text,
                      fontSize: "12px",
                      margin: 0,
                      textAlign: "right",
                      lineHeight: "16px",
                    }}
                  >
                    {festival.address}
                  </Text>
                </Column>
              </Row>
              <Hr />
              <Section style={{ marginTop: "16px" }}>
                {ticket.qrcodeUrl && (
                  <Img
                    style={marginAuto}
                    alt="codigo qr"
                    src={ticket.qrcodeUrl}
                    height={200}
                    width={200}
                  />
                )}
                <Text style={{ margin: "0 auto", fontWeight: 600 }}>
                  {ticketCode}
                </Text>
              </Section>
            </Section>
            <Text style={{ ...styles.text, marginTop: "16px" }}>
              Si tienes problemas viendo el código, puedes hacer clic en el
              botón e ingresar con tu correo electrónico para descargar tu
              entrada
            </Text>
            <Link
              href={`${baseUrl}/festivals/${festival.id}/registration`}
              style={styles.button}
            >
              Ver mi entrada
            </Link>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

TicketEmailTemplate.PreviewProps = {
  visitor: {
    firstName: "John Maximillian",
    lastName: "Doherty Smith",
  },
  festival: {
    id: 12,
    address: "Calle Sucre #346",
    festivalCode: "GLT05",
    endDate: formatDate(new Date()).plus({ days: 3 }).toJSDate(),
    locationLabel: "Galería del CBA",
    name: "Glitter 5ta Edición - Max el Caimán",
    startDate: formatDate(new Date()).plus({ days: 2 }).toJSDate(),
    mascotUrl:
      "https://utfs.io/f/513ff3e2-94a2-49a1-a6fa-d1ccb82b85b5-2y3k9.png",
  },
  ticket: {
    date: new Date(),
    numberOfVisitors: 2,
    qrcodeUrl:
      "https://files.edgestore.dev/73e72hc0r4togc3l/publicFiles/_public/92f1c9fa-820b-4c18-8ce9-9f79f78b5962.png",
    ticketNumber: 2,
  },
} as TicketEmailTemplateProps;

const marginAuto = {
  margin: "0 auto",
};

const roundedLg = {
  borderRadius: "8px",
};

const ticketContainer = {
  border: "1px solid #dedede",
  width: "282px",
  padding: "16px",
  ...roundedLg,
};

const textLg = {
  fontSize: "24px",
  lineHeight: "22px",
  fontWeight: 700,
  margin: 0,
};

const festivalName = {
  fontSize: "18px",
  fontWeight: "500",
  letterSpacing: "-0.025em",
  margin: 0,
};
