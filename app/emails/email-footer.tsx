import * as styles from "@/app/emails/styles";
import { GLITTER_ISOTYPE_DARK_50X50_URL } from "@/app/lib/constants";
import { Container, Img, Text } from "@react-email/components";

export default function EmailFooter() {
	return (
		<Container style={styles.footer}>
			<Img
				style={{ margin: "4px auto", borderRadius: "20%" }}
				src={GLITTER_ISOTYPE_DARK_50X50_URL}
				width={32}
			/>
			<Text style={styles.footerText}>Enviado por el equipo Glitter</Text>
			<Text style={styles.footerText}>
				© 2025 | Productora Glitter, Santa Cruz, Bolivia{" "}
			</Text>
		</Container>
	);
}
