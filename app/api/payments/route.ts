import { auth } from "@clerk/nextjs/server";
import { createPayment } from "@/app/data/invoices/actions";
import {
  getPostHogClient,
  POSTHOG_SHUTDOWN_TIMEOUT_MS,
} from "@/app/lib/posthog-server";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { z } from "zod";

const PaymentSchema = z.object({
  id: z.number().optional(),
  amount: z.number(),
  date: z.coerce.date(),
  invoiceId: z.number(),
  voucherUrl: z.url(),
  oldVoucherUrl: z.url().optional(),
  reservationId: z.number(),
  standId: z.number(),
});

export type CreatePaymentRequestType = z.infer<typeof PaymentSchema>;

export type CreatePaymentResponseType = {
  success: boolean;
  message: string;
  errors?: any;
};

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  const body = await req.json();
  const validatedPayment = PaymentSchema.safeParse(body);
  if (!validatedPayment.success) {
    return new Response(
      JSON.stringify({
        message: "Invalid payment data",
        errors: validatedPayment.error.issues,
        success: false,
      }),
      {
        status: 400,
      },
    );
  }

  const { data } = validatedPayment;
  const result = await createPayment({
    payment: {
      id: data.id,
      amount: data.amount,
      date: data.date,
      invoiceId: data.invoiceId,
      voucherUrl: data.voucherUrl,
    },
    oldVoucherUrl: data.oldVoucherUrl,
    reservationId: data.reservationId,
    standId: data.standId,
  });
  if (!result.success) {
    return new Response(JSON.stringify(result), { status: 400 });
  }

  // Past the success check, so the payment is already recorded. An unreachable
  // PostHog must not turn that into a 500 the caller reads as a failed upload —
  // same guard the other server-side captures already use.
  try {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: clerkId ?? `reservation_${data.reservationId}`,
      event: POSTHOG_EVENTS.PAYMENT_UPLOADED,
      properties: {
        reservation_id: data.reservationId,
        stand_id: data.standId,
        invoice_id: data.invoiceId,
        amount: data.amount,
      },
    });
    await posthog.shutdown(POSTHOG_SHUTDOWN_TIMEOUT_MS);
  } catch (telemetryError) {
    console.error("PostHog telemetry failed (payments)", telemetryError);
  }

  return new Response(JSON.stringify(result), { status: 200 });
}
