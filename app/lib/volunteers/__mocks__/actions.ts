import type { SubmitVolunteerApplicationResult } from "@/app/lib/volunteers/definitions";

/**
 * Storybook's stand-in (`sb.mock` in .storybook/preview.tsx): the real
 * action is server code, so stories answer "received" without a network.
 */
export async function submitVolunteerApplication(): Promise<SubmitVolunteerApplicationResult> {
  return { success: true };
}
