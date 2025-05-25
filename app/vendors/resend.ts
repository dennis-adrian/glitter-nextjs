import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(options: {
  from: string;
  to: string[];
  subject: string;
  react: React.ReactElement;
}) {
  if (process.env.VERCEL_ENV === "development") {
		console.log("Sending email to", options.to);
		console.log("Subject:", options.subject);
		console.log("From:", options.from);
		console.log("To:", options.to);
		console.log("--------------------------------");
		console.log("--------------------------------");

		return {
			data: null,
			error: null,
		};
	}

  return await resend.emails.send(options);
}
