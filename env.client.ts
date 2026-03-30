import { z } from "zod";

export const clientSchema = z.object({
	// Auth (public keys)
	NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
	NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1),
	NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().min(1),
	NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().min(1),
	NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z.string().min(1),

	// App
	NEXT_PUBLIC_BASE_URL: z.string().min(1).default("http://localhost:3000"),

	// Analytics
	NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: z.string().min(1),
	NEXT_PUBLIC_POSTHOG_HOST: z.string().min(1),
	NEXT_PUBLIC_VERCEL_ENV: z
		.enum(["development", "preview", "production"])
		.default("development"),

	// WhatsApp group links
	NEXT_PUBLIC_ILLUSTRATION_GROUP_LINK: z.string().min(1).optional(),
	NEXT_PUBLIC_GASTRONOMY_GROUP_LINK: z.string().min(1).optional(),
	NEXT_PUBLIC_ENTREPRENEURSHIP_GROUP_LINK: z.string().min(1).optional(),
});

let _clientEnv: z.infer<typeof clientSchema> | undefined;
export function getClientEnv() {
	return (_clientEnv ??= clientSchema.parse(process.env));
}
