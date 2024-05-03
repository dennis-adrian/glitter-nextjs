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
  profileId: number;
  displayName: string;
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
            El usuario <strong>{props.displayName}</strong> ha completado su
            perfil.
          </Text>
          <Text style={styles.text}>
            Puedes revisar su perfil en el siguiente enlace:
          </Text>
          <Button
            href={`${baseUrl}/dashboard/users/${props.profileId}`}
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
  profileId: 123,
  displayName: "John Doe Experience",
} as ProfileCompletionEmailTemplateProps;
