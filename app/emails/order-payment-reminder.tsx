import EmailFooter from "@/app/emails/email-footer";
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

interface OrderPaymentReminderTemplateProps {
	customerName: string;
	orderId: number;
	paymentDueDate: Date;
	ctaUrl: string;
}

export default function OrderPaymentReminderTemplate({
	customerName,
	orderId,
	paymentDueDate,
	ctaUrl,
}: OrderPaymentReminderTemplateProps) {
	const userName = customerName || "Cliente";
	const dueDateWithTime = formatDate(paymentDueDate).toLocaleString({
		...DateTime.DATETIME_MED,
		timeZoneName: "short",
	});

	return (
		<Html>
			<Head />
			<Preview>Tu pedido aún está pendiente de pago</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola {userName}!</Text>
						<Text style={styles.text}>
							Tu pedido de la Tiendita Glitter aún está pendiente de pago. No te
							olvidés de hacer el pago y subir el comprobante antes del{" "}
							<strong>{dueDateWithTime}</strong>.
						</Text>
						<Text style={styles.text}>
							Si el comprobante de pago no se sube a tiempo, el pedido se
							cancelará automáticamente y los productos volverán a estar
							disponibles.
						</Text>
						<Text style={styles.text}>
							¿Ya pagaste? ¡Perfecto! Solo subí el comprobante desde el botón de
							abajo y nosotros nos encargamos del resto.
						</Text>
						<Button href={ctaUrl} style={styles.button}>
							Ver mi pedido
						</Button>
						<Text style={styles.text}>
							Si tenés alguna duda, escribinos a{" "}
							<span style={styles.email}>soporte@productoraglitter.com</span> y
							te ayudamos.
						</Text>
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
}

OrderPaymentReminderTemplate.PreviewProps = {
	customerName: "Jane Doe",
	orderId: 42,
	paymentDueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
	ctaUrl: "http://localhost:3000/my_orders",
} as OrderPaymentReminderTemplateProps;
