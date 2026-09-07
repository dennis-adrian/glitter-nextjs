export function assertValidHref(
  raw: string,
): { ok: true; href: string } | { ok: false; message: string } {
  const href = raw.trim();
  if (!href) {
    return { ok: false, message: "La URL no puede estar vacía." };
  }
  if (href.length > 2048 || /[\u0000-\u001f\u007f]/.test(href)) {
    return { ok: false, message: "La URL no es válida." };
  }
  if (
    ((href.startsWith("/") && !href.startsWith("//")) ||
      href.startsWith("#")) &&
    !href.includes("\\")
  ) {
    if (href.length > 2048) {
      return { ok: false, message: "La URL es demasiado larga." };
    }
    return { ok: true, href };
  }
  try {
    const u = new URL(href);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return {
        ok: false,
        message:
          "Solo se permiten enlaces http(s) o rutas internas (que empiezan con /).",
      };
    }
    return { ok: true, href };
  } catch {
    return { ok: false, message: "URL no válida." };
  }
}
