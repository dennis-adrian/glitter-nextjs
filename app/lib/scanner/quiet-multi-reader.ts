import type {
  BinaryBitmap,
  DecodeHintType,
  Reader,
  Result,
} from "@zxing/library";

/**
 * Tries each configured reader in turn and reports a plain "not found" when
 * none of them match.
 *
 * This is what ZXing's own `MultiFormatReader` does, minus a bug. Its
 * per-reader catch continues on `ex instanceof ReaderException` and treats
 * anything else as worth a `console.warn` — but `NotFoundException` extends
 * `Exception` *alongside* `ReaderException` rather than under it, so the
 * library's own "no code in this frame" never satisfies its own guard. Every
 * miss gets warned, several times a second, in production, for as long as a
 * door screen is open.
 *
 * Every import here is type-only, so this module pulls no part of ZXing into
 * whatever imports it. The readers and the exception arrive as constructor
 * arguments from the caller, which is the only place that has loaded the
 * library.
 */
export default class QuietMultiReader implements Reader {
  /**
   * @param readers Tried in order; the first match wins.
   * @param notFound Must build the library's real `NotFoundException`. The
   *   browser package's scan loop retries on that class specifically and treats
   *   any other error as fatal to the whole scan, so a stand-in `Error` here
   *   would stop the camera on the first frame that held no code.
   */
  constructor(
    private readonly readers: Reader[],
    private readonly notFound: () => Error,
  ) {}

  decode(
    image: BinaryBitmap,
    hints?: Map<DecodeHintType, unknown> | null,
  ): Result {
    for (const reader of this.readers) {
      try {
        return reader.decode(image, hints);
      } catch {
        // Every failure here means "not this symbology". Swallowing rather than
        // rethrowing matches the library, and matters more than it looks: the
        // scan loop above kills the camera on any error it does not recognise,
        // so one unexpected throw from a reader would end the session.
      }
    }

    throw this.notFound();
  }

  reset(): void {
    for (const reader of this.readers) reader.reset();
  }
}
