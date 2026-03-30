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

interface OrderPaymentWarningTemplateProps {
	customerName: string;
	orderId: number;
	paymentDueDate: Date;
	ctaUrl: string;
}

export default function OrderPaymentWarningTemplate({
	customerName,
	orderId,
	paymentDueDate,
	ctaUrl,
}: OrderPaymentWarningTemplateProps) {
	const userName = customerName || "Cliente";
	const dueDateWithTime = formatDate(paymentDueDate).toLocaleString({
		...DateTime.DATETIME_MED,
		timeZoneName: "short",
	});

	return (
		<Html>
			<Head />
			<Preview>¡Tu pedido está a punto de vencer!</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola {userName}!</Text>
						<Text style={styles.text}>
							¡Atención! Tu pedido <strong>#{orderId}</strong> vence en las
							próximas 2 horas (<strong>{dueDateWithTime}</strong>). Si no subís
							el comprobante de pago antes de ese horario, el pedido se
							cancelará automáticamente.
						</Text>
						<Text style={styles.text}>
							Si ya hiciste el pago, subí el comprobante ahora desde el botón de
							abajo para que no se cancele el pedido.
						</Text>
						<Button href={ctaUrl} style={styles.button}>
							Pagar ahora
						</Button>
						<Text style={styles.text}>
							Si ya subiste el comprobante, podés ignorar este mensaje. Para
							cualquier duda escribinos a{" "}
							<span style={styles.email}>soporte@productoraglitter.com</span>.
						</Text>
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
}

OrderPaymentWarningTemplate.PreviewProps = {
	customerName: "Jane Doe",
	orderId: 42,
	paymentDueDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
	ctaUrl: "http://localhost:3000/my_orders",
} as OrderPaymentWarningTemplateProps;
