import { BaseProfile } from "@/app/api/users/definitions";
import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import { formatFullDate } from "@/app/lib/formatters";
import { getUserName } from "@/app/lib/users/utils";
import { FestivalBase } from "@/app/lib/festivals/definitions";
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

interface FestivalParticipationApprovedTemplateProps {
	profile: BaseProfile;
	festival: Pick<
		FestivalBase,
		"id" | "name" | "festivalType" | "reservationsStartDate"
	>;
}

export default function FestivalParticipationApprovedEmailTemplate({
	profile,
	festival,
}: FestivalParticipationApprovedTemplateProps) {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
	const userName = getUserName(profile);
	const now = new Date();
	const reservationsOpen =
		!festival.reservationsStartDate || festival.reservationsStartDate <= now;
	const formattedStartDate = formatFullDate(festival.reservationsStartDate);

	return (
		<Html>
			<Head />
			<Preview>Tu postulación para {festival.name} fue aprobada</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader festivalType={festival.festivalType} />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola, {userName}!</Text>
						<Text style={styles.text}>
							Tu postulación para participar en el festival{" "}
							<strong>{festival.name}</strong> ha sido aprobada.{" "}
							{reservationsOpen
								? "Ya puedes continuar con el proceso de reserva de tu espacio."
								: `Podrás hacer tu reserva a partir del ${formattedStartDate}.`}
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
							href={`${baseUrl}/profiles/${profile.id}/festivals/${festival.id}/terms`}
							style={styles.button}
						>
							Reservar mi espacio
						</Button>
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
}

FestivalParticipationApprovedEmailTemplate.PreviewProps = {
	profile: {
		id: 90,
		displayName: "Jane Doe",
	},
	festival: {
		id: 11,
		name: "Glitter 10ma edición",
		festivalType: "glitter",
		reservationsStartDate: new Date("2026-08-12 12:00:00"),
	},
} as FestivalParticipationApprovedTemplateProps;
