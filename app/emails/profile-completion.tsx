import { BaseProfile } from "@/app/api/users/definitions";
import * as styles from "@/app/emails/styles";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type ProfileCompletionEmailTemplateProps = {
  profile: BaseProfile;
};

export default function ProfileCompletionEmailTemplate(
  props: ProfileCompletionEmailTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  return (
    <Html>
      <Head />
      <Preview>Un usuario a completado su perfil</Preview>
      <Body style={styles.main}></Body>
      <Container style={styles.container}>
        <Text style={styles.title}>
          <strong>Nuevo perfil listo para verificar</strong>
        </Text>
        <Section style={styles.section}>
          <Text style={styles.text}>
            El usuario{" "}
            <strong>
              {props.profile.displayName} ({props.profile.firstName || ""}{" "}
              {props.profile.lastName || ""})
            </strong>{" "}
            ha completado su perfil.
          </Text>
          <Text style={styles.text}>
            Puedes revisar su perfil en el siguiente enlace:
          </Text>
          <Button
            href={`${baseUrl}/dashboard/users/${props.profile.id}`}
            style={styles.button}
          >
            Ir a perfil
          </Button>
        </Section>
      </Container>
    </Html>
  );
}

ProfileCompletionEmailTemplate.PreviewProps = {
  profile: {
    id: 123,
    displayName: "John Doe Experience",
    firstName: "John",
    lastName: "Doe",
  },
} as ProfileCompletionEmailTemplateProps;
