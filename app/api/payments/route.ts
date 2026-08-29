import { auth } from "@clerk/nextjs/server";
import { createPayment } from "@/app/data/invoices/actions";
import {
  getPostHogClient,
  POSTHOG_SHUTDOWN_TIMEOUT_MS,
} from "@/app/lib/posthog-server";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { z } from "zod";

const PaymentSchema = z.object({
  invoiceId: z.number().int().positive(),
  voucherUrl: z.url(),
});

export type CreatePaymentRequestType = z.infer<typeof PaymentSchema>;

export type CreatePaymentResponseType = {
  success: boolean;
  message: string;
  errors?: unknown;
};

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), {
      status: 401,
    });
  }

  const profile = await getCurrentUserProfile();
  if (!profile) {
    return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), {
      status: 401,
    });
  }

  const body = await req.json();
  const validatedPayment = PaymentSchema.safeParse({
    invoiceId: body.invoiceId ?? body.payment?.invoiceId,
    voucherUrl: body.voucherUrl ?? body.payment?.voucherUrl,
  });
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
    invoiceId: data.invoiceId,
    voucherUrl: data.voucherUrl,
  });
  if (!result.success) {
    return new Response(JSON.stringify(result), { status: 400 });
  }

  try {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: String(profile.id),
      event: POSTHOG_EVENTS.PAYMENT_UPLOADED,
      properties: {
        invoice_id: data.invoiceId,
      },
    });
    await posthog.shutdown(POSTHOG_SHUTDOWN_TIMEOUT_MS);
  } catch (telemetryError) {
    console.error("PostHog telemetry failed (payments)", telemetryError);
  }

  return new Response(JSON.stringify(result), { status: 200 });
}
