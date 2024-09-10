import * as styles from "@/app/emails/styles";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
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
              {/* TODO: Finish this section */}
              <Section>
                <Text style={{ fontWeight: 600 }}>
                  {visitor.firstName} {visitor.lastName}
                </Text>
                <Text style={{ fontSize: "12px" }}>
                  +{ticket.numberOfVisitors - 1} acompañante(s)
                </Text>
              </Section>
              <Hr />
              <Section>
                {ticket.qrcodeUrl && (
                  <Img
                    style={marginAuto}
                    alt="codigo qr"
                    src={ticket.qrcodeUrl}
                    height={150}
                    width={150}
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
    firstName: "John",
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
    numberOfVisitors: 1,
    qrcodeUrl:
      "https://files.edgestore.dev/73e72hc0r4togc3l/publicFiles/_public/0ae823f1-bf0a-4abf-94d9-ff50b381d68e.png",
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
  width: "278px",
  padding: "16px",
  ...roundedLg,
};

const festivalName = {
  fontSize: "18px",
  fontWeight: "500",
  letterSpacing: "-0.025em",
  margin: 0,
};
