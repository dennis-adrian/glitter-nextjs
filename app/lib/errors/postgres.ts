type DriverErrorFields = { code?: unknown; constraint?: unknown };

/**
 * Whether `error` or anything in its `cause` chain `matches`.
 *
 * drizzle-orm (0.44+) throws every failed query as a `DrizzleQueryError` that
 * carries only `query`, `params` and `cause`; the driver error — the one with
 * the SQLSTATE `code` and the `constraint` — is its `cause`. A check on the
 * thrown error alone never sees a failed query. An error from a raw
 * `pool.query` arrives unwrapped, which is why the error itself is checked
 * first.
 */
function someInCauseChain(
  error: unknown,
  matches: (candidate: DriverErrorFields) => boolean,
): boolean {
  for (
    let current: unknown = error;
    current && typeof current === "object";
    current = (current as { cause?: unknown }).cause
  ) {
    if (matches(current as DriverErrorFields)) return true;
  }
  return false;
}

/** Whether a Postgres error with one of `codes` is behind `error`. */
export function hasPgErrorCode(error: unknown, ...codes: string[]): boolean {
  return someInCauseChain(
    error,
    (candidate) =>
      typeof candidate.code === "string" && codes.includes(candidate.code),
  );
}

/**
 * Whether a unique violation (23505) is behind `error`, on a constraint whose
 * name `matchesConstraint` accepts.
 */
export function isUniqueViolationOn(
  error: unknown,
  matchesConstraint: (constraint: string) => boolean,
): boolean {
  return someInCauseChain(
    error,
    (candidate) =>
      candidate.code === "23505" &&
      typeof candidate.constraint === "string" &&
      matchesConstraint(candidate.constraint),
  );
}
