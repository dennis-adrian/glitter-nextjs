import { timingSafeEqual } from "crypto";

/**
 * Whether a request carries the scheduler's bearer secret.
 *
 * Fails closed when `CRON_SECRET` is unset: an endpoint that mails every
 * attendee or rewrites purchase state must not become world-callable because a
 * deployment forgot an environment variable.
 *
 * `timingSafeEqual` needs equal-length buffers and throws otherwise, so the
 * length is compared first. That comparison leaks only the secret's length,
 * which is not the secret.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const token = authorization.slice("Bearer ".length);
  const tokenBuffer = Buffer.from(token);
  const secretBuffer = Buffer.from(cronSecret);
  if (tokenBuffer.length !== secretBuffer.length) {
    return false;
  }

  return timingSafeEqual(tokenBuffer, secretBuffer);
}
