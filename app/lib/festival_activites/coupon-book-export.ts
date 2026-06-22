import { NextRequest } from "next/server";
import type { Page } from "playwright";

import {
  CouponBookDraft,
  CouponBookExportScope,
} from "@/app/lib/festival_activites/coupon-book-draft";
import {
  createCouponBookPrintSession,
  deleteCouponBookPrintSession,
} from "@/app/lib/festival_activites/coupon-book-print-session";
import {
  cmToInches,
  resolvePdfCanvasConfig,
} from "@/app/lib/festival_activites/coupon-book-print-config";

function parseCookieHeaderForOrigin(cookieHeader: string, origin: string) {
  let originUrl: string;
  try {
    originUrl = new URL(origin).toString();
  } catch {
    return [];
  }

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
        url: originUrl,
        name,
        value,
      };
    })
    .filter((cookie) => cookie !== null);
}

export async function generateCouponBookPdf(input: {
  request: NextRequest;
  festivalId: number;
  activityId: number;
  searchParams: URLSearchParams;
  fileNameSuffix: string;
}): Promise<Response> {
  const pdfCanvas = resolvePdfCanvasConfig(input.searchParams);

  const printUrl = new URL(
    `/couponbook-print/${input.festivalId}/${input.activityId}`,
    input.request.nextUrl.origin,
  );
  printUrl.search = input.searchParams.toString();

  return renderCouponBookPdf({
    request: input.request,
    pdfCanvas,
    fileName: `cuponera-${input.activityId}-${input.fileNameSuffix}.pdf`,
    loadPage: async (page) => {
      await page.goto(printUrl.toString(), { waitUntil: "networkidle" });
    },
  });
}

export async function generateDraftCouponBookPdf(input: {
  request: NextRequest;
  activityId: number;
  draft: CouponBookDraft;
  exportScope: CouponBookExportScope;
  fileNameSuffix: string;
}): Promise<Response> {
  const searchParams = new URLSearchParams();
  searchParams.set(
    "pdfWcm",
    String(input.draft.globalSettings.pdfCanvas.widthCm),
  );
  searchParams.set(
    "pdfHcm",
    String(input.draft.globalSettings.pdfCanvas.heightCm),
  );
  searchParams.set(
    "pdfOrientation",
    input.draft.globalSettings.pdfCanvas.orientation,
  );
  const pdfCanvas = resolvePdfCanvasConfig(searchParams);
  const sessionId = createCouponBookPrintSession({
    draft: input.draft,
    exportScope: input.exportScope,
  });
  const printUrl = new URL(
    `/couponbook-print/draft/${sessionId}`,
    input.request.nextUrl.origin,
  );
  printUrl.search = searchParams.toString();

  try {
    return await renderCouponBookPdf({
      request: input.request,
      pdfCanvas,
      fileName: `cuponera-${input.activityId}-${input.fileNameSuffix}.pdf`,
      loadPage: async (page) => {
        await page.goto(printUrl.toString(), { waitUntil: "networkidle" });
      },
    });
  } finally {
    deleteCouponBookPrintSession(sessionId);
  }
}

export async function renderCouponBookPdf(input: {
  request: NextRequest;
  pdfCanvas: ReturnType<typeof resolvePdfCanvasConfig>;
  fileName: string;
  loadPage: (page: Page) => Promise<void>;
}): Promise<Response> {
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
    const cookieHeader = input.request.headers.get("cookie");
    if (cookieHeader) {
      const cookies = parseCookieHeaderForOrigin(
        cookieHeader,
        input.request.nextUrl.origin,
      );
      if (cookies.length > 0) {
        await browserContext.addCookies(cookies);
      }
    }
    const page = await browserContext.newPage();
    await input.loadPage(page);
    await page.waitForSelector("[data-couponbook-print-ready='true']", {
      timeout: 10000,
    });
    await page.evaluate(() => {
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
      width: cmToInches(input.pdfCanvas.widthCm),
      height: cmToInches(input.pdfCanvas.heightCm),
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${input.fileName}"`,
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
