/**
 * Rounds half-up to two decimals via integer cents. Scaling through
 * micro-units first absorbs binary float noise so values like 10.075
 * become 10.08 instead of 10.07.
 */
export function roundMoney(value: number): number {
  const sign = Math.sign(value);
  const micros = Math.round(Math.abs(value) * 1e6);
  return sign * Math.round(micros / 1e4) / 100;
}
