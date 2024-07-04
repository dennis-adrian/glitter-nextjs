import * as styles from "@/app/emails/styles";
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import RegularBody from "./regular-body";
import ActiveFestivalBody from "./active-festival-body";
import { UserCategory } from "@/app/api/users/definitions";
import FullFestivalBody from "./full-festival-body";
import EmailFooter from "../email-footer";

interface FestivalActivationTemplateProps {
  name: string;
  festivalId?: number;
  isFestivalFull?: boolean;
  profileId: number;
  category: UserCategory;
}

export default function VerificationConfirmationEmailTemplate(
  props: FestivalActivationTemplateProps,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  return (
    <Html>
      <Head />
      <Preview>Ya eres parte de la comunidad Glitter</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.section}>
            <Text style={styles.text}>¡Hola {props.name}!</Text>
            <Text style={styles.text}>
              ¡Felicidades! Tu cuenta ha sido verificada
            </Text>
            {!props.festivalId && (
              <RegularBody category={props.category} baseUrl={baseUrl} />
            )}
            {props.festivalId && !props.isFestivalFull && (
              <ActiveFestivalBody
                baseUrl={baseUrl}
                festivalId={props.festivalId}
                profileId={props.profileId}
              />
            )}
            {props.festivalId && props.isFestivalFull && <FullFestivalBody />}
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

VerificationConfirmationEmailTemplate.PreviewProps = {
  name: "John Doe",
  festivalId: 9,
  profileId: 90,
} as FestivalActivationTemplateProps;
