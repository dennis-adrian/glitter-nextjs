import * as styles from "@/app/emails/styles";
import {
  Body,
  Container,
  Head,
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

type TicketEmailTemplateProps = {
  festival: FestivalBase;
  visitor: VisitorBase;
};

export default function TicketEmailTemplate({
  visitor,
  festival,
}: TicketEmailTemplateProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return (
    <Html>
      <Head />
      <Preview>Muestra tu entrada en puerta para ingresar al evento</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={festivalName}>{festival.name}</Text>
            {festival.mascotUrl && (
              <Img
                style={marginAuto}
                alt="logo"
                src={festival.mascotUrl}
                height={150}
                width={150}
              />
            )}
            <Text style={styles.text}>
              {visitor.firstName}, ya tienes tu entrada para ingresar al
              festival {festival.name}
            </Text>
            <Text style={styles.text}>
              No te olvides descargarla para mostrarla en puerta y poder
              ingresar al evento
            </Text>
            <Text style={styles.text}>
              Si aún no descargaste tu entrada, haz clic en el botón e ingresa
              con tu correo electrónico <strong>{visitor.email}</strong>
            </Text>
            <Link
              style={styles.button}
              href={`${baseUrl}/festivals/${festival.id}/registration`}
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
    email: "example@mail.com",
  },
  festival: {
    id: 12,
    address: "Calle Sucre #346",
    endDate: formatDate(new Date()).plus({ days: 3 }).toJSDate(),
    locationLabel: "Galería del CBA",
    name: "Glitter 5ta Edición - Max el Caimán",
    startDate: formatDate(new Date()).plus({ days: 2 }).toJSDate(),
    mascotUrl:
      "https://utfs.io/f/513ff3e2-94a2-49a1-a6fa-d1ccb82b85b5-2y3k9.png",
  },
} as TicketEmailTemplateProps;

const marginAuto = {
  margin: "0 auto",
};

const festivalName = {
  fontSize: "18px",
  fontWeight: "500",
  letterSpacing: "-0.025em",
  margin: 0,
};
