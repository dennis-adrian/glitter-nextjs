/**
 * Enough of an address for its owner to recognise it, and little for anyone
 * else: "camila.rojas@gmail.com" becomes "ca••••@gmail.com".
 */
export function maskEmail(address: string) {
  const trimmed = address.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return "••••";
  const local = trimmed.slice(0, at);
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}••••${trimmed.slice(at)}`;
}
