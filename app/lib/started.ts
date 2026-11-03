/**
 * Starts a query now, to be awaited later, typically after the authorization
 * check that decides whether its result may be used at all.
 *
 * Running independent queries side by side instead of one after another is
 * what makes a page answer in one database round trip instead of five. But
 * when the check in between redirects (it throws), a query started earlier is
 * never awaited, and if it then fails Node reports an unhandled rejection.
 * This marks the promise as handled; awaiting it later still throws its error.
 */
export function started<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {});
  return promise;
}
