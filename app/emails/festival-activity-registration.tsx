import {
	Body,
	Container,
	Head,
	Html,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import * as styles from "@/app/emails/styles";
import EmailHeader from "@/app/emails/email-header";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import EmailFooter from "@/app/emails/email-footer";
import { BaseProfile } from "@/app/api/users/definitions";
import { FestivalActivity } from "@/app/lib/festivals/definitions";

export default function FestivalActivityRegistrationEmail({
	festivalActivityName,
	userDisplayName,
	festivalName,
	festivalType = "glitter",
}: {
	festivalActivityName: FestivalActivity["name"];
	userDisplayName?: BaseProfile["displayName"];
	festivalName?: FestivalBase["name"];
	festivalType?: FestivalBase["festivalType"];
}) {
	return (
		<Html>
			<Head />
			<Preview>
				Inscripción de {userDisplayName || "un usuario"} en una actividad
			</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader festivalType={festivalType} />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola!</Text>
						<Text style={styles.text}>
							Ha habido una nueva inscripción en una actividad del festival{" "}
							<strong>{festivalName}</strong>
						</Text>
						<Text style={styles.text}>
							El usuario <strong>{userDisplayName}</strong> se ha inscrito a la
							actividad {festivalActivityName}
						</Text>
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
}

FestivalActivityRegistrationEmail.PreviewProps = {
	festivalType: "glitter",
	festivalName: "Glitter 10ma edición",
	festivalActivityName: "Colección de Sellos - Pasaporte Glitter",
	userDisplayName: "Juan Pérez",
};
