import { NextResponse } from "next/server";

export type CreatePaymentResponseType = {
  success: boolean;
  message: string;
  errors?: unknown;
};

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message:
        "Este endpoint ya no acepta comprobantes. Subí el archivo desde la reserva.",
    },
    { status: 410 },
  );
}
