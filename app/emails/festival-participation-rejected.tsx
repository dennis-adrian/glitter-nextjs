import { BaseProfile } from "@/app/api/users/definitions";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import { getUserName } from "@/app/lib/users/utils";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";

interface FestivalParticipationRejectedTemplateProps {
  profile: BaseProfile;
  festival: Pick<FestivalBase, "id" | "name" | "festivalType">;
  reason?: string;
}

export default function FestivalParticipationRejectedEmailTemplate({
  profile,
  festival,
  reason,
}: FestivalParticipationRejectedTemplateProps) {
  const userName = getUserName(profile);

  return (
    <Html>
      <Head />
      <Preview>Actualización sobre tu postulación para {festival.name}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader festivalType={festival.festivalType} />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola, {userName}!</Text>
            <Text style={styles.text}>
              Gracias por tu interés en participar en el festival{" "}
              <strong>{festival.name}</strong>. Lamentablemente, tu postulación
              no fue aprobada en esta ocasión.
            </Text>
            {reason ? (
              <>
                <Text style={styles.text}>El motivo que registramos es:</Text>
                {/* Typed in a textarea, so keep the admin's line breaks. */}
                <Text
                  style={{ ...styles.standoutText, whiteSpace: "pre-line" }}
                >
                  {reason}
                </Text>
              </>
            ) : null}
            <Text style={styles.text}>
              Si tenés preguntas o querés más información, escribinos a{" "}
              <Link
                href="mailto:soporte@productoraglitter.com"
                style={{
                  color: "#15c",
                  textDecoration: "underline",
                }}
              >
                soporte@productoraglitter.com
              </Link>{" "}
              y te ayudamos.
            </Text>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

FestivalParticipationRejectedEmailTemplate.PreviewProps = {
  profile: {
    id: 90,
    displayName: "Jane Doe",
  },
  festival: {
    id: 11,
    name: "Glitter 10ma edición",
    festivalType: "glitter",
  },
  reason: "El cupo del sector de ilustración ya está completo.",
} as FestivalParticipationRejectedTemplateProps;
