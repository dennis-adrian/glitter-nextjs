try {
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- needs sync load before exports execute
	const { loadEnvConfig } = require("@next/env");
	const projectDir = process.cwd();
	loadEnvConfig(projectDir);
} catch (err) {
	const message = err instanceof Error ? err.message : "";
	// Only ignore the missing-module case for `@next/env`
	if (
		(err as NodeJS.ErrnoException)?.code !== "MODULE_NOT_FOUND" ||
		!message.includes("@next/env")
	) {
		throw err;
	}
	// `@next/env` is not available outside of Next.js (e.g. standalone scripts).
	// Environment variables are expected to be set directly in that case.
}

export function getEnvLabel() {
	const env = process.env.VERCEL_ENV;
	if (env === "preview") {
		return "[Prev]";
	}

	if (env === "development") {
		return "[Dev]";
	}

	return "";
}
