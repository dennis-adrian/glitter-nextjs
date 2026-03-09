import EmailFooter from "@/app/emails/email-footer";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import {
	Body,
	Container,
	Head,
	Html,
	Preview,
	Section,
	Text,
} from "@react-email/components";

interface OrderCancellationTemplateProps {
	customerName: string;
	orderId: number;
}

export default function OrderCancellationTemplate({
	customerName,
	orderId,
}: OrderCancellationTemplateProps) {
	const userName = customerName || "Cliente";

	return (
		<Html>
			<Head />
			<Preview>{`Tu orden #${orderId} fue cancelada por falta de pago`}</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola {userName}!</Text>
						<Text style={styles.text}>
							Lamentamos informarte que tu orden <strong>#{orderId}</strong> ha
							sido cancelada automáticamente porque no recibimos el comprobante
							de pago antes de la fecha límite.
						</Text>
						<Text style={styles.text}>
							Si aún querés adquirir los productos, podés realizar un nuevo
							pedido desde nuestra tienda.
						</Text>
						<Text style={styles.text}>
							Si creés que esto fue un error o tenés alguna consulta, no dudes
							en contactarnos a{" "}
							<span style={styles.email}>soporte@productoraglitter.com</span>
						</Text>
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
}

OrderCancellationTemplate.PreviewProps = {
	customerName: "Jane Doe",
	orderId: 42,
} as OrderCancellationTemplateProps;
