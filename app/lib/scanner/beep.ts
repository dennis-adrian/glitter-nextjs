/**
 * The short tone a handheld scanner makes the instant it reads a code.
 *
 * Synthesised rather than served as an audio file: it is a tenth of a second of
 * square wave, so shipping and fetching an asset for it would cost more than
 * generating it, and a beep that arrives late — or not at all, because the file
 * request failed on a venue's wifi — is worse than no beep. At a door the
 * operator is looking at the ticket, not the screen, and the tone is the only
 * confirmation they get that the read happened.
 */

/**
 * Browsers cap how many AudioContexts a page may create (Chrome stops at six),
 * so the module keeps exactly one and reuses it for every beep.
 */
let context: AudioContext | null = null;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const Ctor =
    window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Ctor) return null;

  context ??= new Ctor();
  return context;
}

/**
 * Wakes the audio hardware from inside a user gesture.
 *
 * iOS Safari starts every AudioContext suspended and only resumes one from a
 * handler it can attribute to a tap. A decode callback is not that — it comes
 * from a video frame — so a beep triggered by a scan alone stays silent on
 * iPhones forever. Call this from the tap that opens the camera, which is the
 * gesture that always precedes the first scan.
 */
export function primeScannerAudio(): void {
  try {
    void getContext()?.resume();
  } catch {
    // A device that will not give us audio still has to scan.
  }
}

/** Plays the confirmation tone. Never throws: audio is not worth a failed check-in. */
export function playScanBeep(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;

    // Cheap insurance for a context suspended after priming — a backgrounded
    // tab, or an autoplay policy we did not predict.
    void ctx.resume();

    const startedAt = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    // Square at ~1kHz is the supermarket-checkout timbre people already read as
    // "it worked"; a sine reads as a notification and gets second-guessed.
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(1000, startedAt);

    // Ramping instead of switching avoids the click a hard gain edge makes, and
    // every value stays above zero because exponential ramps cannot reach it.
    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.15, startedAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.09);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(startedAt);
    oscillator.stop(startedAt + 0.1);
  } catch {
    // Same reasoning as priming: silence is a downgrade, not a failure.
  }
}
