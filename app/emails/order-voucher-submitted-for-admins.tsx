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

interface OrderVoucherSubmittedForAdminsEmailTemplateProps {
	customerName: string;
	orderId: string;
}

export default function OrderVoucherSubmittedForAdminsEmailTemplate(
	props: OrderVoucherSubmittedForAdminsEmailTemplateProps,
) {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

	return (
		<Html>
			<Head />
			<Preview>Nuevo comprobante de pago — orden #{props.orderId}</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>Hola equipo,</Text>
						<Text style={styles.text}>
							El cliente <strong>{props.customerName}</strong> ha subido un
							comprobante de pago para la orden{" "}
							<strong>#{props.orderId}</strong>. Revísalo y aprueba o rechaza
							el pago.
						</Text>
						<Button
							href={`${baseUrl}/dashboard/store/payments`}
							style={styles.button}
						>
							Revisar comprobante
						</Button>
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
}

OrderVoucherSubmittedForAdminsEmailTemplate.PreviewProps = {
	customerName: "Jane Doe",
	orderId: "42",
} as OrderVoucherSubmittedForAdminsEmailTemplateProps;
