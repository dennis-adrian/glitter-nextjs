try {
  const { loadEnvConfig } = require("@next/env");
  const projectDir = process.cwd();
  loadEnvConfig(projectDir);
} catch {
  // @next/env is not available outside of Next.js (e.g. standalone scripts).
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
