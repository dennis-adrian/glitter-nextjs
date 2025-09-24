import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface AdminOrderNotificationEmailProps {
  orderId: string;
  customer?: {
    displayName?: string | null;
  };
  products: {
    id: number;
    name: string;
    quantity: number;
    price: number;
  }[];
  total: number;
}

export default function OrderConfirmationForAdminsEmailTemplate(
  props: AdminOrderNotificationEmailProps
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const customerName = props.customer?.displayName || "Cliente";

  return (
    <Html>
      <Head />
      <Preview>Nueva orden #{props.orderId} en la tienda</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <EmailHeader />
          <Section style={styles.sectionWithBanner}>
            <Text style={styles.text}>Hola equipo,</Text>
            <Text style={styles.text}>
              Se ha recibido una nueva orden <strong>#{props.orderId}</strong> en
              la tienda.
            </Text>

            <Text style={{ ...styles.text, marginTop: "16px" }}>
              <strong>Cliente:</strong> {customerName}
            </Text>

            <Text style={{ ...styles.text, marginTop: "16px" }}>
              <strong>Detalles de la orden:</strong>
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
                    Cantidad
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
                    <td style={{ ...styles.text, padding: "6px 0" }}>
                      {p.name}
                    </td>
                    <td
                      align="center"
                      style={{ ...styles.text, padding: "6px 0" }}
                    >
                      {p.quantity}
                    </td>
                    <td
                      align="right"
                      style={{ ...styles.text, padding: "6px 0" }}
                    >
                      ${p.price.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ ...styles.text, padding: "8px 0" }}>
                    <strong>Total</strong>
                  </td>
                  <td align="right" style={{ ...styles.text, padding: "8px 0" }}>
                    <strong>${props.total.toFixed(2)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>

            <Text style={styles.text}>
              Revisa los detalles completos en el panel de administración.
            </Text>

            <Button
              href={`${baseUrl}/dashboard/orders`}
              style={styles.button}
            >
              Ver en Dashboard
            </Button>
          </Section>
        </Container>

        <Container style={styles.footer}>
          <Img
            style={{ margin: "4px auto" }}
            src="https://utfs.io/f/a4e5ba5d-5403-4c59-99c0-7e170bb2d6f5-f0kpla.png"
            width={32}
          />
          <Text style={styles.footerText}>Notificación automática</Text>
          <Text style={styles.footerText}>
            © 2025 | Glitter Store, Santa Cruz, Bolivia
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

OrderConfirmationForAdminsEmailTemplate.PreviewProps = {
  orderId: "12345",
  customer: {
    displayName: "Jane Doe",
  },
  products: [
    { id: 1, name: "Camiseta Glitter", quantity: 2, price: 20 },
    { id: 2, name: "Taza Glitter", quantity: 1, price: 10 },
  ],
  total: 50,
} as AdminOrderNotificationEmailProps;
