import * as styles from "@/app/emails/styles";
import { Container, Img, Text } from "@react-email/components";

export default function EmailFooter() {
  return (
		<Container style={styles.footer}>
			<Img
				style={{ margin: "4px auto" }}
				src="https://utfs.io/f/a4e5ba5d-5403-4c59-99c0-7e170bb2d6f5-f0kpla.png"
				width={32}
			/>
			<Text style={styles.footerText}>Enviado por el equipo Glitter</Text>
			<Text style={styles.footerText}>
				© 2025 | Productora Glitter, Santa Cruz, Bolivia{" "}
			</Text>
		</Container>
	);
}
