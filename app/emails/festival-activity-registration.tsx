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
import { FestivalBase } from "@/app/data/festivals/definitions";
import EmailFooter from "@/app/emails/email-footer";
import { BaseProfile } from "@/app/api/users/definitions";
import { FestivalActivity } from "@/app/lib/festivals/definitions";

export default function FestivalActivityRegistrationEmail({
	festival,
	festivalActivity,
	user,
}: {
	festival: FestivalBase;
	festivalActivity: FestivalActivity;
	user: BaseProfile;
}) {
	return (
		<Html>
			<Head />
			<Preview>
				Inscripción de {user.displayName || "un usuario"} en una actividad
			</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader festivalType={festival.festivalType} />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola!</Text>
						<Text style={styles.text}>
							Ha habido una nueva inscripción en una actividad del festival{" "}
							<strong>{festival.name}</strong>
						</Text>
						<Text style={styles.text}>
							El usuario <strong>{user.displayName}</strong> se ha inscrito a la
							actividad {festivalActivity.name}
						</Text>
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
}

FestivalActivityRegistrationEmail.PreviewProps = {
	festival: {
		festivalType: "glitter",
		name: "Festival de la música",
		date: "2024-01-01",
	},
	festivalActivity: {
		name: "Colección de Sellos - Pasaporte Glitter",
	},
	user: {
		displayName: "Juan Pérez",
	},
};
