import { loadEnvConfig } from "@next/env";

const projectDir = process.cwd();
loadEnvConfig(projectDir);

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
