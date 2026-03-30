import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

const postgresUrl =
	process.env.POSTGRES_URL ??
	`postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}/${process.env.POSTGRES_DATABASE}`;

export default defineConfig({
	schema: "./db/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: postgresUrl + "?sslmode=require",
	},
	verbose: true,
	strict: true,
});
