import "server-only";

import { fetchAdminUsers } from "@/app/lib/users/queries";
import OrderConfirmationForAdminsEmailTemplate from "@/app/emails/order-confirmation-for-admins";
import OrderConfirmationForUsersEmailTemplate from "@/app/emails/order-confirmation-for-user";
import type { ProductTransactionType } from "@/app/lib/rentals/types";
import { sendEmail } from "@/app/vendors/resend";

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
  // 1. Send to user
  const { orderId, customerEmail, customerName, products, total } = emailData;

  await sendEmail({
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

  // 2. Fetch admins
  const admins = await fetchAdminUsers();
  const adminEmails = admins.map((a) => a.email).filter(Boolean);

  if (adminEmails.length > 0) {
    await sendEmail({
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

  await sendEmail({
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

  const admins = await fetchAdminUsers();
  const adminEmails = admins.map((a) => a.email).filter(Boolean);

  if (adminEmails.length > 0) {
    await sendEmail({
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
  }
}
