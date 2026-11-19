/**
 * How many times a profile deletion is tried before its row stops being
 * claimed and waits for an operator, with its `lastError` kept. Matches the
 * disciplinary notification outbox. A row written with this many attempts is
 * parked from the start.
 */
export const MAX_DELETION_ATTEMPTS = 5;
