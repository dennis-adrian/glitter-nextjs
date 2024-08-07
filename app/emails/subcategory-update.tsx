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
import { ProfileType } from "@/app/api/users/definitions";
import { getUserName } from "@/app/lib/users/utils";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";

type ProfileRejectionEmailTemplateProps = {
  profile: ProfileType;
};

export default function SubcategoryUpdateEmailTemplate(
  props: ProfileRejectionEmailTemplateProps,
) {
  const userName = getUserName(props.profile);
  const mainCategoryLabel =
    props.profile.profileSubcategories[0]?.subcategory?.label;

  return (
    <Html>
      <Head />
      <Preview>Actualizamos la categoría de tu perfil</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {userName}!</Text>
            <Text style={styles.text}>
              Hemos cambiado la categoría de tu perfil a{" "}
              <strong>{mainCategoryLabel || "Sin categoría"}</strong> porque
              creemos que se apega mejor a lo que muestran las redes sociales
              enlazadas con tu perfil Glitter.
            </Text>
            <Text style={styles.text}>
              Ante cualquier consulta puedes comunicarte con nosotros al correo
              electrónico{" "}
              <Button
                href="mailto:soporte@productoraglitter.com"
                style={{
                  color: "#15c",
                  textDecoration: "underline",
                }}
              >
                soporte@productoraglitter.com
              </Button>
            </Text>
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

SubcategoryUpdateEmailTemplate.PreviewProps = {
  profile: {
    displayName: "John Doe",
    profileSubcategories: [
      {
        subcategory: {
          id: 1,
          label: "Ilustración",
          category: "illustration",
        },
      },
    ],
  },
} as ProfileRejectionEmailTemplateProps;
