import { BaseProfile } from "@/app/api/users/definitions";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import { formatDate, formatFullDate } from "@/app/lib/formatters";
import { getUserName } from "@/app/lib/users/utils";
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
import { DateTime } from "luxon";
import { FestivalWithDates } from "../lib/festivals/definitions";
import EmailFooter from "@/app/emails/email-footer";

interface FestivalActivationTemplateProps {
	festival: FestivalWithDates;
	profile: BaseProfile;
	standLabel: string;
}

export default function ReservationConfirmationEmailTemplate(
	props: FestivalActivationTemplateProps,
) {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
	const userName = getUserName(props.profile);
	let whatsAppGroupLink;
	if (props.profile.category === "illustration") {
		whatsAppGroupLink = process.env.NEXT_PUBLIC_ILLUSTRATION_GROUP_LINK;
	} else if (props.profile.category === "gastronomy") {
		whatsAppGroupLink = process.env.NEXT_PUBLIC_GASTRONOMY_GROUP_LINK;
	} else if (props.profile.category === "entrepreneurship") {
		whatsAppGroupLink = process.env.NEXT_PUBLIC_ENTREPRENEURSHIP_GROUP_LINK;
	}

	return (
		<Html>
			<Head />
			<Preview>El festival {props.festival.name} te espera</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola {userName}!</Text>
						<Text style={styles.text}>
							¡Tu reserva para el espacio <strong>{props.standLabel}</strong> en
							el festival <strong>{props.festival.name}</strong> ha sido
							confirmada!
						</Text>
						<Text style={styles.text}>
							Te esperamos el{" "}
							{formatFullDate(props.festival.festivalDates[0].startDate)} en{" "}
							{props.festival.locationLabel} a las{" "}
							{formatDate(props.festival.festivalDates[0].startDate)
								.minus({ hour: 1 })
								.toLocaleString(DateTime.TIME_24_SIMPLE)}{" "}
							para el armado de tu espacio.
						</Text>
						<Text style={styles.text}>
							Te invitamos a unirte a nuestra comunidad de WhatsApp haciendo
							clic en{" "}
							<Link href={whatsAppGroupLink || baseUrl}>este enlace</Link>
						</Text>
						<Text style={styles.text}>
							Puedes ver la página del evento en cualquier momento y ver a los
							demás participantes que estarán presentes.
						</Text>
						<Button
							href={`${baseUrl}/festivals/${props.festival.id}`}
							style={styles.button}
						>
							Ir a la página del evento
						</Button>
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
}

ReservationConfirmationEmailTemplate.PreviewProps = {
  standLabel: "A52",
  festival: {
    id: 9,
    name: "Glitter 10ma edición",
    locationLabel: "Galería del CBA",
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
  profile: {
    id: 1,
    displayName: "John Doe",
    category: "illustration",
  },
} as FestivalActivationTemplateProps;
