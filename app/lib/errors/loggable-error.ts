/**
 * The parts of an error that are safe to put in server logs.
 *
 * Drizzle's query errors carry the failed SQL and its parameters in their
 * message ("Failed query: … params: ana@mail.com,…"), so logging the error
 * itself writes people's emails, names and phones to the logs. The name, the
 * Postgres error code and the constraint are enough to tell what went wrong.
 */
export function loggableError(error: unknown) {
  if (!(error instanceof Error)) return { name: typeof error };
  const cause = (error as { cause?: unknown }).cause as
    | { code?: unknown; constraint?: unknown; table?: unknown }
    | undefined;
  const field = (value: unknown) =>
    typeof value === "string" ? value : undefined;
  return {
    name: error.name,
    code: field(cause?.code) ?? field((error as { code?: unknown }).code),
    constraint: field(cause?.constraint),
    table: field(cause?.table),
  };
}
