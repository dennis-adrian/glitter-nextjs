import {
  Container,
  Font,
  Head,
  Html,
  Img,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

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
    visitor?.tickets[0]?.qrcodeUrl || "https://via.placeholder.com/150";
  return (
    <Html>
      <Tailwind>
        <Head>
          <Font fontFamily="Inter" fallbackFontFamily="sans-serif" />
        </Head>
        <Section style={main}>
          <Container style={container}>
            <Text className="text-3xl font-bold">
              Hola, {visitor?.firstName || "John"}
            </Text>
            <Text className="text-lg">
              Muchas gracias por registarte para {festival?.name || "Glitter"}.
              Puedes descargar tu entrada desde el archivo adjunto
            </Text>
            <Img
              alt="código QR de la entrada"
              src={qrCodeSrc}
              height={150}
              width={150}
            />
          </Container>
        </Section>
      </Tailwind>
    </Html>
  );
}

const main = {
  backgroundColor: "#ffffff",
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  width: "580px",
  color: "#14252E",
};

const heading = {
  fontSize: "32px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#484848",
};

const paragraph = {
  fontSize: "18px",
  lineHeight: "1.4",
  color: "#484848",
};
