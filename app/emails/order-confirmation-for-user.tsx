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
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import EmailFooter from "@/app/emails/email-footer";

interface Product {
	id: number;
	name: string;
	quantity: number;
	price: number;
	isPreOrder: boolean;
	availableDate: Date | null;
}
interface OrderConfirmationForUsersEmailTemplateProps {
	customerName: string;
	orderId: string;
	products: Product[];
	total: number;
}

export default function OrderConfirmationForUsersEmailTemplate(
	props: OrderConfirmationForUsersEmailTemplateProps,
) {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
	const userName = props.customerName || "Cliente";

	return (
		<Html>
			<Head />
			<Preview>Tu orden #{props.orderId} ha sido recibida</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola {userName}!</Text>
						<Text style={styles.text}>
							Gracias por tu compra. Hemos recibido tu orden{" "}
							<strong>#{props.orderId}</strong> y la estamos procesando.
						</Text>

						<Text style={{ ...styles.text, marginTop: "16px" }}>
							<strong>Detalles de tu orden:</strong>
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
									<th align="left" style={{ ...styles.text, padding: "6px 0" }}>
										Producto
									</th>
									<th
										align="center"
										style={{ ...styles.text, padding: "6px 0" }}
									>
										Cant.
									</th>
									<th
										align="right"
										style={{ ...styles.text, padding: "6px 0" }}
									>
										Precio
									</th>
								</tr>
							</thead>
							<tbody>
								{props.products.map((p) => (
									<tr key={p.id}>
										<td>
											<div
												style={{
													...styles.text,
													marginBottom: p.isPreOrder ? "2px" : "10px",
												}}
											>
												{p.name}{" "}
											</div>
											{p.isPreOrder && p.availableDate && (
												<div style={{ ...styles.textSmall }}>
													(Disponible el{" "}
													{formatDate(p.availableDate).toLocaleString(
														DateTime.DATE_MED,
													)}
													)
												</div>
											)}
										</td>
										<td
											align="right"
											style={{ ...styles.text, padding: "6px 0" }}
										>
											{p.quantity}
										</td>
										<td
											align="right"
											style={{ ...styles.text, padding: "6px 0" }}
										>
											Bs{p.price.toFixed(2)}
										</td>
									</tr>
								))}
							</tbody>
							<tfoot>
								<tr>
									<td colSpan={2} style={{ ...styles.text, padding: "8px 0" }}>
										<strong>Total</strong>
									</td>
									<td
										align="right"
										style={{ ...styles.text, padding: "8px 0" }}
									>
										<strong>Bs{props.total.toFixed(2)}</strong>
									</td>
								</tr>
							</tfoot>
						</table>

						<Text style={styles.text}>
							Nos comunicaremos contigo en los próximos días para coordinar el
							pago y la entrega de tu orden.
						</Text>

						<Text style={styles.text}>
							Puedes ver el detalle de tu orden haciendo clic en el botón
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

OrderConfirmationForUsersEmailTemplate.PreviewProps = {
	orderId: "12345",
	customerName: "Jane Doe",
	products: [
		{
			id: 1,
			name: "Camiseta Glitter",
			quantity: 2,
			price: 20,
			isPreOrder: false,
			availableDate: null,
		},
		{
			id: 2,
			name: "Taza Glitter",
			quantity: 1,
			price: 10,
			isPreOrder: false,
			availableDate: null,
		},
	],
	total: 50,
} as OrderConfirmationForUsersEmailTemplateProps;
