import { serverEnv } from "@/env";

export function getEnvLabel() {
	if (serverEnv.VERCEL_ENV === "preview") return "[Prev]";
	if (serverEnv.VERCEL_ENV === "development") return "[Dev]";
	return "";
}
