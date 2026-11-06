import { getEnvLabel } from "@/app/lib/config";

/**
 * "Glitter", with the environment label in preview and development builds,
 * as page titles carry it, so a staging install is told apart from
 * production.
 */
export function installedAppName() {
  return `${getEnvLabel()} Glitter`.trim();
}
