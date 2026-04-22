import { z } from "zod";

export const clientSchema = z.object({
	// Auth (public keys)
	NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
	NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1),
	NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().min(1),
	NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string().min(1),
	NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z.string().min(1),

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

// Next.js only inlines NEXT_PUBLIC_* values when accessed individually —
// passing process.env as a whole gives an empty object in the browser.
let _clientEnv: z.infer<typeof clientSchema> | undefined;

export function getClientEnv() {
	if (!_clientEnv) {
		_clientEnv = clientSchema.parse({
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
				process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
			NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
			NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
			NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
				process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
			NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL:
				process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
			NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
			NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN:
				process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
			NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
			NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
			NEXT_PUBLIC_ILLUSTRATION_GROUP_LINK:
				process.env.NEXT_PUBLIC_ILLUSTRATION_GROUP_LINK,
			NEXT_PUBLIC_GASTRONOMY_GROUP_LINK:
				process.env.NEXT_PUBLIC_GASTRONOMY_GROUP_LINK,
			NEXT_PUBLIC_ENTREPRENEURSHIP_GROUP_LINK:
				process.env.NEXT_PUBLIC_ENTREPRENEURSHIP_GROUP_LINK,
		});
	}
	return _clientEnv;
}
