import { BaseProfile } from "@/app/api/users/definitions";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import { formatDate } from "@/app/lib/formatters";
import { getUserName } from "@/app/lib/users/utils";
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
import { DateTime } from "luxon";
import { FestivalBase } from "../lib/festivals/definitions";

interface FestivalActivationTemplateProps {
  profile: BaseProfile;
  festival: FestivalBase;
}

export default function FestivalActivationEmailTemplate({
  profile,
  festival,
}: FestivalActivationTemplateProps) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const userName = getUserName(profile);
  const fullDate = formatDate(festival.reservationsStartDate).toLocaleString(
    DateTime.DATE_FULL,
  );
  const hour = formatDate(festival.reservationsStartDate).toLocaleString(
		DateTime.TIME_24_SIMPLE,
	);

  return (
		<Html>
			<Head />
			<Preview>Alístate para participar en nuestro próximo festival</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader festivalType={festival.festivalType} />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola, {userName}!</Text>
						<Text style={styles.text}>
							Las reservas para el festival <strong>{festival.name}</strong> se
							habilitarán el día {fullDate} a las {hour}.
						</Text>
						<Text style={styles.text}>
							Hasta mientras te pedimos que por favor leas con atención los
							términos y condiciones haciendo clic en el botón debajo del texto.
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
  profile: {
    id: 90,
    displayName: "John Doe",
  },
  festival: {
    id: 11,
    name: "Glitter 10ma edición",
    reservationsStartDate: new Date("2024-08-12 12:00:00"),
    festivalType: "twinkler",
  },
} as FestivalActivationTemplateProps;
