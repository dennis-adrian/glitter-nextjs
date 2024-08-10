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
import RegularBody from "./regular-body";
import ActiveFestivalBody from "./active-festival-body";
import { UserCategory } from "@/app/api/users/definitions";
import FullFestivalBody from "./full-festival-body";
import EmailFooter from "../email-footer";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import EmailHeader from "@/app/emails/email-header";

interface FestivalActivationTemplateProps {
  name: string;
  festival?: FestivalWithDates | null;
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
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>¡Hola {props.name}!</Text>
            <Text style={styles.text}>
              ¡Felicidades! Tu cuenta ha sido verificada
            </Text>
            {!props.festival ? (
              <RegularBody category={props.category} baseUrl={baseUrl} />
            ) : !props.isFestivalFull ? (
              <ActiveFestivalBody
                baseUrl={baseUrl}
                festival={props.festival}
                profileId={props.profileId}
              />
            ) : (
              <FullFestivalBody
                baseUrl={baseUrl}
                festival={props.festival}
                category={props.category}
              />
            )}
          </Section>
        </Container>
        <EmailFooter />
      </Body>
    </Html>
  );
}

VerificationConfirmationEmailTemplate.PreviewProps = {
  name: "John Doe",
  profileId: 90,
  category: "illustration",
  festival: {
    id: 12,
    name: "Glitter 10ma edición",
    reservationsStartDate: new Date("2024-08-10 22:00:00"),
    festivalDates: [
      {
        id: 1,
        startDate: new Date(),
        endDate: new Date(),
      },
      {
        id: 2,
        startDate: new Date(),
        endDate: new Date(),
      },
    ],
  },
  isFestivalFull: true,
} as FestivalActivationTemplateProps;
