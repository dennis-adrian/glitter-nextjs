import { CreateEmailOptions, CreateEmailRequestOptions, Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(
	payload: CreateEmailOptions,
	options?: CreateEmailRequestOptions,
) {
	if (process.env.VERCEL_ENV === "development") {
		console.log("Sending email to", payload.to);
		console.log("Subject:", payload.subject);
		console.log("From:", payload.from);
		console.log("To:", payload.to);
		console.log("--------------------------------");
		console.log("--------------------------------");

		return {
			data: null,
			error: null,
		};
	}

	return await resend.emails.send(payload, options);
}
