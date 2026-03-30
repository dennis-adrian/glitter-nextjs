import { getPostgresUrl } from "./env";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./db/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: getPostgresUrl() + "?sslmode=require",
	},
	verbose: true,
	strict: true,
});
