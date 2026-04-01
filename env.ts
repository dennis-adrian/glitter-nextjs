// eslint-disable-next-line @typescript-eslint/no-require-imports -- needs sync load before exports execute
try {
	const { loadEnvConfig } = require("@next/env");
	loadEnvConfig(process.cwd());
} catch (err) {
	const message = err instanceof Error ? err.message : "";
	if (
		(err as NodeJS.ErrnoException)?.code !== "MODULE_NOT_FOUND" ||
		!message.includes("@next/env")
	) {
		throw err;
	}
}

import { z } from "zod";
import { getClientEnv } from "./env.client";

export { getClientEnv };

const serverSchema = z
	.object({
		// Auth
		CLERK_SECRET_KEY: z.string().min(1),

		// Database — one of two valid configurations:
		//   1. POSTGRES_URL alone (remote/prod/preview)
		//   2. Individual credentials (local dev)
		POSTGRES_URL: z.string().min(1).optional(),
		POSTGRES_DATABASE: z.string().min(1).optional(),
		POSTGRES_HOST: z.string().min(1).optional(),
		POSTGRES_PASSWORD: z.string().min(1).optional(),
		POSTGRES_USER: z.string().min(1).optional(),

		// Email
		RESEND_API_KEY: z.string().min(1),

		// File storage
		EDGE_STORE_ACCESS_KEY: z.string().min(1),
		EDGE_STORE_SECRET_KEY: z.string().min(1),
		UPLOADTHING_TOKEN: z.string().min(1),

		// Runtime
		VERCEL_ENV: z
			.enum(["development", "preview", "production"])
			.default("development"),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
	})
	.superRefine((data, ctx) => {
		const hasUrl = Boolean(data.POSTGRES_URL);
		const hasIndividual = Boolean(
			data.POSTGRES_DATABASE &&
				data.POSTGRES_HOST &&
				data.POSTGRES_PASSWORD &&
				data.POSTGRES_USER,
		);

		if (!hasUrl && !hasIndividual) {
			ctx.addIssue({
				code: "custom",
				path: ["POSTGRES_URL"],
				message:
					"Database misconfigured: set POSTGRES_URL, or set all of POSTGRES_DATABASE, POSTGRES_HOST, POSTGRES_PASSWORD, POSTGRES_USER",
			});
		}
	});

export const serverEnv = serverSchema.parse(process.env);

export function getPostgresUrl(): string {
	if (serverEnv.POSTGRES_URL) return serverEnv.POSTGRES_URL;
	const user = encodeURIComponent(serverEnv.POSTGRES_USER!);
	const password = encodeURIComponent(serverEnv.POSTGRES_PASSWORD!);
	const host = serverEnv.POSTGRES_HOST!;
	const database = serverEnv.POSTGRES_DATABASE!;
	return `postgres://${user}:${password}@${host}/${database}`;
}
