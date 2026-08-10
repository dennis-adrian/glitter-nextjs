// This methods are meant to be used in both ui and sever

export function getTicketCode(festivalCode: string, ticketNumber: number) {
  const formattedTicketNumber = (ticketNumber || "")
    .toString()
    .padStart(4, "0");

  return `${festivalCode}-${formattedTicketNumber}`;
}

/**
 * The inverse of `getTicketCode`: recovers the ticket number a code carries.
 *
 * Lives here rather than in the verification form because the camera made this
 * the point where untrusted strings enter — a decoded barcode is whatever was
 * printed on the paper, not necessarily one of our codes — and that deserves
 * tests the form cannot easily carry.
 *
 * A bare number is accepted too, since that is what someone reading a code
 * aloud over the phone tends to give.
 *
 * Returns null for anything that does not yield a usable ticket number. That
 * includes the empty string, which `Number` would otherwise turn into 0 and
 * send to the database as a genuine lookup.
 */
export function parseTicketNumber(ticketCode: string): number | null {
  const trimmed = ticketCode.trim();
  const raw =
    trimmed.includes("-") || trimmed.includes("/")
      ? trimmed.split(/[-\/]/)[1] // Splits by either '-' or '/'
      : trimmed;

  const ticketNumber = Number(raw);
  if (!Number.isInteger(ticketNumber) || ticketNumber <= 0) return null;

  return ticketNumber;
}
