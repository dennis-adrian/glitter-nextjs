import * as styles from "@/app/emails/styles";
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { BaseProfile } from "@/app/api/users/definitions";
import { getUserName } from "@/app/lib/users/utils";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";

type ProfileRejectionEmailTemplateProps = {
  profile: BaseProfile;
  reason: string;
};

export default function ProfileRejectionEmailTemplate(
  props: ProfileRejectionEmailTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const userName = getUserName(props.profile);

  return (
    <Html>
      <Head />
      <Preview>Hay algunas cosas que necesitas corregir en tu perfil</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {userName}!</Text>
            <Text style={styles.text}>
              Muchas gracias por tu interes en participar de nuestros eventos.
              Lastimosamente, luego de revisarlo creemos que de momento no está
              listo para ser verificado.
            </Text>
            <Text style={styles.text}>
              La razón por la que tu perfil no pudo ser verificado te la
              describimos acontinuación:
            </Text>
            <Text style={styles.standoutText}>{props.reason}</Text>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

ProfileRejectionEmailTemplate.PreviewProps = {
  profile: {
    displayName: "John Doe",
  },
  reason:
    "El perfil de Instagram que agregaste no tiene suficientes publicaciones para comprobar su calidad",
} as ProfileRejectionEmailTemplateProps;
