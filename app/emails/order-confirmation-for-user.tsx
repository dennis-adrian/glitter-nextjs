import { BaseProfile } from "@/app/api/users/definitions";
import EmailHeader from "@/app/emails/email-header";
import * as styles from "@/app/emails/styles";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface Product {
  id: number;
  name: string;
  quantity: number;
  price: number;
}
interface EmailProfile {
  id: number;
  email: string;
  displayName: string | null;
}

interface OrderConfirmationForUsersEmailTemplateProps {
  profile: EmailProfile;
  orderId: string;
  products: Product[];
  total: number;
}

export default function OrderConfirmationForUsersEmailTemplate(
  props: OrderConfirmationForUsersEmailTemplateProps
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const userName = props.profile.displayName || "Cliente";

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
                  <th align="center" style={{ ...styles.text, padding: "6px 0" }}>
                    Cantidad
                  </th>
                  <th align="right" style={{ ...styles.text, padding: "6px 0" }}>
                    Precio
                  </th>
                </tr>
              </thead>
              <tbody>
                {props.products.map((p) => (
                  <tr key={p.id}>
                    <td style={{ ...styles.text, padding: "6px 0" }}>{p.name}</td>
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
                  <td
                    align="right"
                    style={{ ...styles.text, padding: "8px 0" }}
                  >
                    <strong>${props.total.toFixed(2)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>

            <Button
              href={`${baseUrl}/my_orders`}
              style={styles.button}
            >
              Ver mi orden
            </Button>
          </Section>
        </Container>

        <Container style={styles.footer}>
          <Img
            style={{ margin: "4px auto" }}
            src="https://utfs.io/f/a4e5ba5d-5403-4c59-99c0-7e170bb2d6f5-f0kpla.png"
            width={32}
          />
          <Text style={styles.footerText}>Enviado por el equipo Glitter Store</Text>
          <Text style={styles.footerText}>
            © 2025 | Glitter Store, Santa Cruz, Bolivia
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

OrderConfirmationForUsersEmailTemplate.PreviewProps = {
  orderId: "12345",
  profile: {
    id: 1,
    role: "user",     
    displayName: "Jane Doe",
    email: "jane@example.com",
    bio: null,
    birthdate: null,
    clerkId: "mock-clerk-id",
    firstName: "Jane",
    lastName: "Doe",
    avatarUrl: null,
    phone: null,
    category: "customer",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  products: [
    { id: 1, name: "Camiseta Glitter", quantity: 2, price: 20 },
    { id: 2, name: "Taza Glitter", quantity: 1, price: 10 },
  ],
  total: 50,
} as OrderConfirmationForUsersEmailTemplateProps;

