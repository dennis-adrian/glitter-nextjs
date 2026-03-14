import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
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

interface OrderPaymentConfirmationForUserEmailTemplateProps {
	customerName: string;
	orderId: string;
	total: number;
}

export default function OrderPaymentConfirmationForUserEmailTemplate(
	props: OrderPaymentConfirmationForUserEmailTemplateProps,
) {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
	const userName = props.customerName || "Cliente";

	return (
		<Html>
			<Head />
			<Preview>Tu pago de la orden #{props.orderId} fue confirmado</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola {userName}!</Text>
						<Text style={styles.text}>
							Tu pago de la orden <strong>#{props.orderId}</strong> por{" "}
							<strong>Bs. {props.total.toFixed(2)}</strong> fue confirmado.
							Estamos preparando tu pedido.
						</Text>
						<Text style={styles.text}>
							Puedes ver el detalle de tu orden haciendo clic en el botón.
						</Text>
						<Button href={`${baseUrl}/my_orders`} style={styles.button}>
							Ver mi orden
						</Button>
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
}

OrderPaymentConfirmationForUserEmailTemplate.PreviewProps = {
	customerName: "Jane Doe",
	orderId: "42",
	total: 85.5,
} as OrderPaymentConfirmationForUserEmailTemplateProps;
