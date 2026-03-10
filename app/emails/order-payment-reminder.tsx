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
}

export default function OrderPaymentReminderTemplate({
	customerName,
	orderId,
	paymentDueDate,
}: OrderPaymentReminderTemplateProps) {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
	const userName = customerName || "Cliente";
	const dueDateFormatted = formatDate(paymentDueDate).toLocaleString(
		DateTime.DATE_MED,
	);

	return (
		<Html>
			<Head />
			<Preview>{`Tu orden #${orderId} todavía está pendiente de pago`}</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola {userName}!</Text>
						<Text style={styles.text}>
							Te recordamos que tu orden <strong>#{orderId}</strong> todavía está
							pendiente de pago. Para confirmarla, debes subir tu comprobante de
							pago antes del <strong>{dueDateFormatted}</strong>.
						</Text>
						<Text style={styles.text}>
							Si no recibimos el comprobante antes de esa fecha, tu orden será
							cancelada automáticamente y el stock de los productos será
							liberado.
						</Text>
						<Text style={styles.text}>
							Si ya realizaste el pago, podés subir el comprobante desde el
							botón a continuación.
						</Text>
						<Button href={`${baseUrl}/my_orders`} style={styles.button}>
							Ver mi orden
						</Button>
						<Text style={styles.text}>
							Si tenés alguna duda, contactanos a{" "}
							<span style={styles.email}>soporte@productoraglitter.com</span>
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
} as OrderPaymentReminderTemplateProps;
