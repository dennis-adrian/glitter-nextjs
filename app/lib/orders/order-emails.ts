import "server-only";

import { fetchAdminUsers } from "@/app/lib/users/queries";
import OrderConfirmationForAdminsEmailTemplate from "@/app/emails/order-confirmation-for-admins";
import OrderConfirmationForUsersEmailTemplate from "@/app/emails/order-confirmation-for-user";
import type { ProductTransactionType } from "@/app/lib/rentals/types";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent } from "@/app/vendors/resend-result";

/*
 * Order confirmation emails. Server-only, not server actions: the recipient,
 * name and totals come from the order the checkout just created, never from a
 * client request.
 */

export async function sendOrderEmails(emailData: {
  orderId: number;
  customerEmail: string;
  customerName: string;
  products: {
    id: number;
    name: string;
    quantity: number;
    price: number;
    status: "available" | "presale" | "sale";
    availableDate: Date | null;
    transactionType?: ProductTransactionType;
    components?: string[];
  }[];
  total: number;
}) {
  const { orderId, customerEmail, customerName, products, total } = emailData;

  // 1. Send to user. Caught on its own so a failure here does not also cost
  // the admins their notice.
  try {
    const result = await sendEmail({
      to: [customerEmail],
      from: "Glitter Store <reservas@productoraglitter.com>",
      subject: `Tu orden #${orderId} ha sido recibida`,
      react: OrderConfirmationForUsersEmailTemplate({
        customerName,
        orderId: String(orderId),
        products,
        total,
      }) as React.ReactElement,
    });
    assertSent(result);
  } catch (error) {
    console.error("Failed to send order confirmation email", {
      orderId,
      error,
    });
  }

  // 2. Fetch admins
  const admins = await fetchAdminUsers();
  const adminEmails = admins.map((a) => a.email).filter(Boolean);

  if (adminEmails.length > 0) {
    const result = await sendEmail({
      to: adminEmails,
      from: "Glitter Store <store@productoraglitter.com>",
      replyTo: "soporte@productoraglitter.com",
      subject: `Nueva orden #${orderId} de ${customerName || "Cliente"}`,
      react: OrderConfirmationForAdminsEmailTemplate({
        customerName,
        orderId: String(orderId),
        products,
        total,
      }) as React.ReactElement,
    });
    assertSent(result);
  }
}

export async function sendGuestOrderEmails(emailData: {
  orderId: number;
  guestOrderToken: string;
  customerEmail: string;
  customerName: string;
  products: {
    id: number;
    name: string;
    quantity: number;
    price: number;
    status: "available" | "presale" | "sale";
    availableDate: Date | null;
    transactionType?: ProductTransactionType;
  }[];
  total: number;
}) {
  const {
    orderId,
    guestOrderToken,
    customerEmail,
    customerName,
    products,
    total,
  } = emailData;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const trackingUrl = `${baseUrl}/orders/${orderId}?token=${guestOrderToken}`;

  // Caught on its own so a failure here does not also cost the admins their
  // notice.
  try {
    const result = await sendEmail({
      to: [customerEmail],
      from: "Glitter Store <reservas@productoraglitter.com>",
      subject: `Tu orden #${orderId} ha sido recibida`,
      react: OrderConfirmationForUsersEmailTemplate({
        customerName,
        orderId: String(orderId),
        products,
        total,
        trackingUrl,
      }) as React.ReactElement,
    });
    assertSent(result);
  } catch (error) {
    console.error("Failed to send guest order confirmation email", {
      orderId,
      error,
    });
  }

  const admins = await fetchAdminUsers();
  const adminEmails = admins.map((a) => a.email).filter(Boolean);

  if (adminEmails.length > 0) {
    const result = await sendEmail({
      to: adminEmails,
      from: "Glitter Store <store@productoraglitter.com>",
      replyTo: "soporte@productoraglitter.com",
      subject: `Nueva orden #${orderId} de ${customerName || "Cliente"} (invitado)`,
      react: OrderConfirmationForAdminsEmailTemplate({
        customerName,
        orderId: String(orderId),
        products,
        total,
      }) as React.ReactElement,
    });
    assertSent(result);
  }
}
