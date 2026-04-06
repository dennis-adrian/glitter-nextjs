import { NextRequest } from "next/server";
import { fetchFestivalActivity } from "@/app/lib/festival_activites/actions";
import {
	cmToInches,
	resolvePdfCanvasConfig,
} from "@/app/lib/festival_activites/coupon-book-print-config";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { z } from "zod";

const ParamsSchema = z.object({
	activityId: z.coerce.number(),
});

function parseCookieHeaderForOrigin(cookieHeader: string, origin: string) {
	return cookieHeader
		.split(";")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const separatorIndex = entry.indexOf("=");
			if (separatorIndex < 1) return null;

			const name = entry.slice(0, separatorIndex).trim();
			const value = entry.slice(separatorIndex + 1).trim();
			if (!name) return null;

			return {
				url: origin,
				name,
				value,
				path: "/",
			};
		})
		.filter((cookie) => cookie !== null);
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ activityId: string }> },
) {
	const profile = await getCurrentUserProfile();
	if (
		!profile ||
		(profile.role !== "admin" && profile.role !== "festival_admin")
	) {
		return new Response("No autorizado", { status: 401 });
	}

	const validatedParams = ParamsSchema.safeParse(await context.params);
	if (!validatedParams.success) {
		return new Response("Parámetros inválidos", { status: 400 });
	}

	const searchParams = new URLSearchParams(request.nextUrl.searchParams);
	const requestedDetailId = searchParams.get("detailId");
	const parsedDetailId = requestedDetailId ? Number(requestedDetailId) : null;
	const detailId = Number.isFinite(parsedDetailId) ? parsedDetailId : null;
	if (detailId === null) {
		searchParams.delete("detailId");
	} else {
		searchParams.set("detailId", String(detailId));
	}
	const pdfCanvas = resolvePdfCanvasConfig(searchParams);

	const { activityId } = validatedParams.data;
	const activity = await fetchFestivalActivity(activityId);
	if (!activity) {
		return new Response("Actividad no encontrada", { status: 404 });
	}

	const printUrl = new URL(
		`/couponbook-print/${activity.festivalId}/${activityId}`,
		request.nextUrl.origin,
	);
	printUrl.search = searchParams.toString();

	let playwrightModule: typeof import("playwright");
	try {
		playwrightModule = await import("playwright");
	} catch (_error) {
		return new Response(
			"La exportación PDF requiere instalar la dependencia playwright",
			{ status: 500 },
		);
	}

	const browser = await playwrightModule.chromium.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});
	let browserContext: Awaited<ReturnType<typeof browser.newContext>> | null =
		null;

	try {
		browserContext = await browser.newContext();
		const cookieHeader = request.headers.get("cookie");
		if (cookieHeader) {
			const cookies = parseCookieHeaderForOrigin(cookieHeader, printUrl.origin);
			if (cookies.length > 0) {
				await browserContext.addCookies(cookies);
			}
		}
		const page = await browserContext.newPage();
		await page.goto(printUrl.toString(), { waitUntil: "networkidle" });
		await page.waitForSelector("[data-couponbook-print-ready='true']", {
			timeout: 10000,
		});
		await page.evaluate(() => {
			// Isolate printable content in case app layouts inject nav/footer wrappers.
			const printableRoot = document.querySelector<HTMLElement>(
				"[data-couponbook-print-ready='true']",
			);
			if (printableRoot) {
				printableRoot.remove();
				document.body.innerHTML = "";
				document.body.style.margin = "0";
				document.body.style.padding = "0";
				document.body.style.background = "#fff";
				document.body.appendChild(printableRoot);
			}

			const nodes = document.querySelectorAll<HTMLElement>(
				"[data-fit-text='true']",
			);
			nodes.forEach((el) => {
				const min = Number(el.dataset.fitMinPx ?? 8);
				const max = Number(el.dataset.fitMaxPx ?? 18);
				const step = Number(el.dataset.fitStepPx ?? 0.5);
				const singleLine = el.dataset.fitSingleLine === "true";
				const safeStep = Number.isFinite(step) && step > 0 ? step : 0.5;

				el.style.fontSize = `${max}px`;
				el.style.whiteSpace = singleLine ? "nowrap" : "normal";

				let size = max;
				while (size > min) {
					const overWidth = el.scrollWidth - 0.5 > el.clientWidth;
					const overHeight = el.scrollHeight - 0.5 > el.clientHeight;
					if (!overWidth && !overHeight) break;
					size -= safeStep;
					el.style.fontSize = `${size}px`;
				}
				if (size < min) {
					el.style.fontSize = `${min}px`;
				}
			});
		});
		const pdf = await page.pdf({
			width: cmToInches(pdfCanvas.widthCm),
			height: cmToInches(pdfCanvas.heightCm),
			printBackground: true,
			margin: { top: "0", right: "0", bottom: "0", left: "0" },
		});

		const suffix =
			detailId !== null ? `variante-${detailId}` : "todas-las-variantes";
		const fileName = `cuponera-${activityId}-${suffix}.pdf`;

		return new Response(new Uint8Array(pdf), {
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": `attachment; filename="${fileName}"`,
				"Cache-Control": "no-store",
			},
		});
	} finally {
		if (browserContext) {
			await browserContext.close();
		}
		await browser.close();
	}
}
