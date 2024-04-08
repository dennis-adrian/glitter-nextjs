import { createPayment } from "@/app/data/invoices/actions";
import { z } from "zod";

const PaymentSchema = z.object({
  id: z.number().optional(),
  amount: z.number(),
  date: z.coerce.date(),
  invoiceId: z.number(),
  voucherUrl: z.string(),
});

export type CreatePaymentResponseType = {
  success: boolean;
  message: string;
  errors?: any;
};

export async function POST(req: Request) {
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

  const payment = validatedPayment.data;
  const result = await createPayment(payment);
  if (!result.success) {
    return new Response(JSON.stringify(result), { status: 400 });
  }

  return new Response(JSON.stringify(result), { status: 200 });
}
