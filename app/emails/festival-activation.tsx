import * as styles from "@/app/emails/styles";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface FestivalActivationTemplateProps {
  name: string;
  profileId: number;
  festivalId: number;
}

export default function FestivalActivationEmailTemplate({
  name,
  profileId,
  festivalId,
}: FestivalActivationTemplateProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  return (
    <Html>
      <Head />
      <Preview>Reserva tu espacio en nuestro próximo festival</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.text}>¡Hola {name}!</Text>
            <Text style={styles.text}>
              Acabamos de habilitar las reservas para nuestro próximo festival{" "}
            </Text>
            <Text style={styles.text}>
              El primer paso para reservar tu espacio es leer los términos y
              condiciones en el botón de abajo.
            </Text>
            <Text style={styles.text}>
              Luego de leer y aceptar, puedes darle al botón &quot;
              <strong>¡Quiero reservar!&quot;</strong> y comenzar tu proceso de
              reserva.
            </Text>
            <Text style={styles.text}>
              Si tienes dudas o problemas con la reserva, comunícate con
              nosotros al correo{" "}
              <Link
                href="mailto:soporte@productoraglitter.com"
                style={{
                  color: "#15c",
                  textDecoration: "underline",
                }}
              >
                soporte@productoraglitter.com
              </Link>{" "}
              para que podamos ayudarte.
            </Text>
            <Button
              href={`${baseUrl}/profiles/${profileId}/festivals/${festivalId}/terms`}
              style={styles.button}
            >
              Leer términos y condiciones
            </Button>
          </Section>
        </Container>
        <Container style={styles.footer}>
          <Img
            style={{ margin: "4px auto" }}
            src="https://utfs.io/f/a4e5ba5d-5403-4c59-99c0-7e170bb2d6f5-f0kpla.png"
            width={32}
          />
          <Text style={styles.footerText}>Enviado por el equipo Glitter</Text>
          <Text style={styles.footerText}>
            © 2024 | Productora Glitter, Santa Cruz, Bolivia{" "}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

FestivalActivationEmailTemplate.PreviewProps = {
  profileId: 90,
  name: "John Doe",
  category: "illustration",
  festivalId: 11,
} as FestivalActivationTemplateProps;
