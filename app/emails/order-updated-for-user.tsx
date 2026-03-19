import EmailHeader from "@/app/emails/email-header";
import EmailFooter from "@/app/emails/email-footer";
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

interface OrderChange {
	productName: string;
	oldQuantity: number;
	newQuantity: number; // 0 = removed
}

interface OrderUpdatedForUserEmailTemplateProps {
	customerName: string;
	orderId: string;
	changes: OrderChange[];
	newTotal: number;
}

export default function OrderUpdatedForUserEmailTemplate(
	props: OrderUpdatedForUserEmailTemplateProps,
) {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
	const userName = props.customerName || "Cliente";

	return (
		<Html>
			<Head />
			<Preview>Tu orden #{props.orderId} fue modificada</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola {userName}!</Text>
						<Text style={styles.text}>
							Tu orden <strong>#{props.orderId}</strong> fue modificada. Aquí
							está el resumen de cambios:
						</Text>

						<table
							style={{
								width: "100%",
								borderCollapse: "collapse",
								margin: "12px 0",
							}}
						>
							<thead>
								<tr>
									<th
										align="left"
										style={{ ...styles.text, padding: "6px 0" }}
									>
										Producto
									</th>
									<th
										align="center"
										style={{ ...styles.text, padding: "6px 0" }}
									>
										Antes
									</th>
									<th
										align="right"
										style={{ ...styles.text, padding: "6px 0" }}
									>
										Después
									</th>
								</tr>
							</thead>
							<tbody>
								{props.changes.map((change, i) => (
									<tr key={i}>
										<td style={{ ...styles.text, padding: "6px 0" }}>
											{change.productName}
										</td>
										<td
											align="center"
											style={{ ...styles.text, padding: "6px 0" }}
										>
											{change.oldQuantity}
										</td>
										<td
											align="right"
											style={{
												...styles.text,
												padding: "6px 0",
												color: change.newQuantity === 0 ? "#dc2626" : "inherit",
											}}
										>
											{change.newQuantity === 0
												? "Eliminado"
												: change.newQuantity}
										</td>
									</tr>
								))}
							</tbody>
							<tfoot>
								<tr>
									<td
										colSpan={2}
										style={{ ...styles.text, padding: "8px 0" }}
									>
										<strong>Nuevo total</strong>
									</td>
									<td
										align="right"
										style={{ ...styles.text, padding: "8px 0" }}
									>
										<strong>Bs{props.newTotal.toFixed(2)}</strong>
									</td>
								</tr>
							</tfoot>
						</table>

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

OrderUpdatedForUserEmailTemplate.PreviewProps = {
	customerName: "Jane Doe",
	orderId: "12345",
	changes: [
		{ productName: "Camiseta Glitter", oldQuantity: 2, newQuantity: 1 },
		{ productName: "Taza Glitter", oldQuantity: 1, newQuantity: 0 },
	],
	newTotal: 20,
} as OrderUpdatedForUserEmailTemplateProps;
