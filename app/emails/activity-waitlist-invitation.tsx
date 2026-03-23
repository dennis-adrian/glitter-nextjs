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
import * as styles from "@/app/emails/styles";
import EmailHeader from "@/app/emails/email-header";
import EmailFooter from "@/app/emails/email-footer";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { DateTime } from "luxon";

type ActivityWaitlistInvitationEmailProps = {
	userDisplayName?: string | null;
	userFirstName?: string | null;
	userLastName?: string | null;
	activityName: string;
	festivalName: string;
	festivalType?: FestivalBase["festivalType"];
	expiresAt: Date;
	activityUrl: string;
};

export default function ActivityWaitlistInvitationEmail({
	userDisplayName,
	userFirstName,
	userLastName,
	activityName,
	festivalName,
	festivalType = "glitter",
	expiresAt,
	activityUrl,
}: ActivityWaitlistInvitationEmailProps) {
	const userName =
		userDisplayName ||
		`${userFirstName ?? ""} ${userLastName ?? ""}`.trim() ||
		"";

	const expiryFormatted = DateTime.fromJSDate(expiresAt)
		.setLocale("es")
		.toLocaleString(DateTime.DATETIME_MED);

	return (
		<Html>
			<Head />
			<Preview>¡Tenés un cupo disponible en {activityName}!</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader festivalType={festivalType} />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola {userName}!</Text>
						<Text style={styles.text}>
							¡Buenas noticias! Se liberó un cupo en la actividad{" "}
							<strong>{activityName}</strong> del festival{" "}
							<strong>{festivalName}</strong> y vos sos el/la siguiente en la
							lista de espera.
						</Text>
						<Text style={styles.text}>
							Tenés tiempo hasta el <strong>{expiryFormatted}</strong> para
							inscribirte. Si no lo hacés a tiempo, el cupo pasará al siguiente
							participante en la lista.
						</Text>
						<Button href={activityUrl} style={styles.buttonWithBanner}>
							Inscribirme ahora
						</Button>
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
}

ActivityWaitlistInvitationEmail.PreviewProps = {
	userDisplayName: "Pandora",
	activityName: "Cuponera Glitter",
	festivalName: "Glitter 10ma edición",
	festivalType: "glitter",
	expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
	activityUrl: "http://localhost:3000/profiles/1/festivals/1/activity/1",
} as ActivityWaitlistInvitationEmailProps;
