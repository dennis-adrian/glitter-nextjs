const NEXT_IMAGE_ALLOWED_HOSTNAMES = [
	"img.clerk.com",
	"files.edgestore.dev",
	"utfs.io",
	"ufs.sh",
];
const NEXT_IMAGE_ALLOWED_HOST_SUFFIXES = [".ufs.sh"];
const INTERNAL_ASSET_BASE_URL = "https://utfs.io/f/";

const INTERNAL_ASSET_IDENTIFIER_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{5,255}$/;

function isAllowedUrlOrigin(url: URL): boolean {
	if (url.protocol !== "https:") return false;

	const hostname = url.hostname.toLowerCase();
	if (NEXT_IMAGE_ALLOWED_HOSTNAMES.includes(hostname)) return true;

	return NEXT_IMAGE_ALLOWED_HOST_SUFFIXES.some((suffix) =>
		hostname.endsWith(suffix),
	);
}

function isInternalUploadedAssetIdentifier(value: string): boolean {
	return INTERNAL_ASSET_IDENTIFIER_REGEX.test(value);
}

function extractAssetIdentifier(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith("uploadthing:")) {
		const identifier = trimmed.slice("uploadthing:".length).trim();
		return isInternalUploadedAssetIdentifier(identifier) ? identifier : null;
	}

	if (trimmed.includes("://") || trimmed.startsWith("/")) {
		return null;
	}

	return isInternalUploadedAssetIdentifier(trimmed) ? trimmed : null;
}

export function resolveCouponBookHeaderImageUrl(
	input: string | null | undefined,
): string | null {
	const raw = input?.trim();
	if (!raw) return null;

	try {
		const parsed = new URL(raw);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			if (!isAllowedUrlOrigin(parsed)) return null;
			return parsed.toString();
		}
	} catch {
		// Fallback to internal identifier handling.
	}

	const assetIdentifier = extractAssetIdentifier(raw);
	if (!assetIdentifier) return null;
	return new URL(assetIdentifier, INTERNAL_ASSET_BASE_URL).toString();
}

export function validateCouponBookHeaderImageInput(
	input: string | null | undefined,
):
	| {
			ok: true;
			value: string | null;
	  }
	| {
			ok: false;
			error: string;
	  } {
	const raw = input?.trim();
	if (!raw) {
		return { ok: true, value: null };
	}

	try {
		const parsed = new URL(raw);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			if (!isAllowedUrlOrigin(parsed)) {
				return {
					ok: false,
					error:
						"La imagen de cabecera debe usar una URL de un origen permitido.",
				};
			}
			return { ok: true, value: parsed.toString() };
		}
	} catch {
		// Fallback to internal identifier handling.
	}

	const assetIdentifier = extractAssetIdentifier(raw);
	if (assetIdentifier) {
		return { ok: true, value: raw };
	}

	return {
		ok: false,
		error:
			"La imagen de cabecera debe ser una URL permitida o un identificador interno válido.",
	};
}
