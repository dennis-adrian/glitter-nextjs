import * as styles from "@/app/emails/styles";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface FestivalActivationTemplateProps {
  name: string;
  festivalId?: number;
  profileId: number;
}

export default function VerificationConfirmationEmailTemplate({
  name,
  festivalId,
  profileId,
}: FestivalActivationTemplateProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  return (
    <Html>
      <Head />
      <Preview>Ya eres parte de la comunidad Glitter</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.text}>¡Hola {name}!</Text>
            <Text style={styles.text}>
              ¡Felicidades! Tu cuenta ha sido verificada
            </Text>
            {!festivalId ? (
              <>
                <Text style={styles.text}>
                  Cuando tengamos un evento en curso recibirás una notificación
                  para participar.
                </Text>
                <Text style={styles.text}>
                  ¡Quédate a nuetras redes sociales!
                </Text>
                <Text style={styles.text}>
                  Y recuerda que siempre puedes visitar nuestra página y ver si
                  tenemos novedades.
                </Text>
                <Button href={baseUrl} style={styles.button}>
                  Ir a la página web
                </Button>
              </>
            ) : (
              <>
                <Text style={styles.text}>
                  Un nuevo festival se acerca y te invitamos a que reserves tu
                  espacio con anticipación.
                </Text>
                <Text style={styles.text}>
                  El primer paso para reservar tu espacio es leer los términos y
                  condiciones en el botón de abajo.
                </Text>
                <Text style={styles.text}>
                  Luego de leer y aceptar, puedes darle al botón &quot;
                  <strong>¡Quiero reservar!&quot;</strong> y comenzar tu proceso
                  de reserva.
                </Text>
                <Text style={styles.text}>
                  Si tienes dudas o problemas con la reserva, comunícate con al
                  correo{" "}
                  <Link
                    href="mailto:soporte@productoraglitter.com"
                    style={{
                      color: "#15c",
                      textDecoration: "underline",
                    }}
                  >
                    soporte@productoraglitter.com
                  </Link>{" "}
                  nosotros para que podamos ayudarte.
                </Text>
                <Button
                  href={`${baseUrl}/profiles/${profileId}/festivals/${festivalId}/terms`}
                  style={styles.button}
                >
                  Leer términos y condiciones
                </Button>
              </>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

VerificationConfirmationEmailTemplate.PreviewProps = {
  name: "John Doe",
  festivalId: 9,
  profileId: 90,
} as FestivalActivationTemplateProps;
