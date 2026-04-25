import { qrCodes } from "@/db/schema";
import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { z } from "zod";

export type QrCodeBase = InferSelectModel<typeof qrCodes>;
export type NewQrCode = InferInsertModel<typeof qrCodes>;

export const qrCodeFormSchema = z.object({
	qrCodeUrl: z.string().url("La imagen del QR es requerida"),
	amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
	expirationDate: z.coerce.date({
		message: "La fecha de vencimiento es requerida",
	}),
});

export type QrCodeFormValues = z.infer<typeof qrCodeFormSchema>;
