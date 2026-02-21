import { BaseProfile } from "@/app/api/users/definitions";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import { formatDate } from "@/app/lib/formatters";
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
import { DateTime } from "luxon";
import { FestivalBase } from "../lib/festivals/definitions";
import EmailFooter from "@/app/emails/email-footer";

interface FestivalActivationTemplateProps {
	profile: {
		id: BaseProfile["id"];
		displayName: string;
		category: BaseProfile["category"];
	};
	festival: {
		id: FestivalBase["id"];
		name: FestivalBase["name"];
		reservationsStartDate: FestivalBase["reservationsStartDate"];
	};
}

export default function TermsAcceptanceEmailTemplate({
	profile,
	festival,
}: FestivalActivationTemplateProps) {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
	const fullDate = formatDate(festival.reservationsStartDate).toLocaleString(
		DateTime.DATE_FULL,
	);
	const hour = formatDate(festival.reservationsStartDate).toLocaleString(
		DateTime.TIME_24_SIMPLE,
	);

	return (
		<Html>
			<Head />
			<Preview>
				{profile.displayName} ha aceptado los términos y condiciones
			</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>
							<strong>{profile.displayName}</strong> ha aceptado los términos y
							condiciones para participar en el festival {festival.name}
						</Text>
						<Text style={styles.text}>
							Este perfil podrá hacer su reserva el día {fullDate} a partir de
							las {hour}
						</Text>
						<Text style={styles.text}>
							Si te gustaría ver el perfil del participante haz clic en el botón
						</Text>
						<Button
							href={`${baseUrl}/dashboard/users/${profile.id}`}
							style={styles.button}
						>
							Ir a perfil
						</Button>
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
}

TermsAcceptanceEmailTemplate.PreviewProps = {
	profile: {
		id: 90,
		displayName: "John Doe",
	},
	festival: {
		id: 11,
		name: "Glitter 10ma edición",
		reservationsStartDate: new Date("2024-08-10 22:00:00"),
	},
} as FestivalActivationTemplateProps;
