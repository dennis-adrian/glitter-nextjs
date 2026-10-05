import { BaseProfile } from "@/app/api/users/definitions";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import { getUserName } from "@/app/lib/users/utils";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

type ProfileReviewRequestEmailTemplateProps = {
  profile: BaseProfile;
  /** What the last rejection said, so the reviewer knows what to check. */
  previousReason?: string | null;
};

export default function ProfileReviewRequestEmailTemplate(
  props: ProfileReviewRequestEmailTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const userName = getUserName(props.profile);

  return (
    <Html>
      <Head />
      <Preview>{userName} pidió una nueva revisión de su perfil</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={{ ...styles.title, marginTop: "0px" }}>
              <strong>Solicitud de nueva revisión</strong>
            </Text>
            <Text style={styles.text}>
              <strong>{userName}</strong> pidió que volvamos a revisar su
              perfil, que habíamos rechazado.
            </Text>
            {props.previousReason && (
              <>
                <Text style={styles.text}>Motivo del rechazo anterior:</Text>
                {/* Typed in a textarea, so keep the admin's line breaks. */}
                <Text
                  style={{ ...styles.standoutText, whiteSpace: "pre-line" }}
                >
                  {props.previousReason}
                </Text>
              </>
            )}
            <Text style={styles.text}>
              Podés revisar su perfil en el siguiente enlace:
            </Text>
            <Button
              href={`${baseUrl}/dashboard/users/${props.profile.id}`}
              style={styles.button}
            >
              Ir al perfil de {userName}
            </Button>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

ProfileReviewRequestEmailTemplate.PreviewProps = {
  profile: {
    id: 123,
    displayName: "John Doe Experience",
    firstName: "John",
    lastName: "Doe",
  },
  previousReason:
    "El perfil de Instagram que agregaste no tiene suficientes publicaciones para comprobar su calidad",
} as ProfileReviewRequestEmailTemplateProps;
