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

type PlaywrightModule = typeof import("playwright");
type ChromiumLaunchOptions = Parameters<
  PlaywrightModule["chromium"]["launch"]
>[0];

const ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "https://game.glitter.com.bo",
];
const DEFAULT_CHROMIUM_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];

function resolveTrustedOrigin(request: NextRequest): string {
  const canonicalOrigin = (
    process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const allowedOrigins = new Set([...ALLOWED_ORIGINS, canonicalOrigin]);
  const requestOrigin = request.nextUrl.origin;
  return allowedOrigins.has(requestOrigin) ? requestOrigin : canonicalOrigin;
}

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

function isServerlessRuntime() {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.AWS_EXECUTION_ENV)
  );
}

async function resolveChromiumLaunchOptions(): Promise<ChromiumLaunchOptions> {
  const configuredExecutablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (configuredExecutablePath) {
    return {
      headless: true,
      executablePath: configuredExecutablePath,
      args: DEFAULT_CHROMIUM_ARGS,
    };
  }

  if (!isServerlessRuntime()) {
    return {
      headless: true,
      args: DEFAULT_CHROMIUM_ARGS,
    };
  }

  const chromium = (await import("@sparticuz/chromium")).default;
  chromium.setGraphicsMode = false;

  return {
    headless: true,
    executablePath: await chromium.executablePath(),
    args: chromium.args,
  };
}

export async function generateCouponBookPdf(input: {
  request: NextRequest;
  festivalId: number;
  activityId: number;
  searchParams: URLSearchParams;
  fileNameSuffix: string;
}): Promise<Response> {
  const pdfCanvas = resolvePdfCanvasConfig(input.searchParams);
  const trustedOrigin = resolveTrustedOrigin(input.request);

  const printUrl = new URL(
    `/couponbook-print/${input.festivalId}/${input.activityId}`,
    trustedOrigin,
  );
  printUrl.search = input.searchParams.toString();

  return renderCouponBookPdf({
    request: input.request,
    pdfCanvas,
    fileName: `cuponera-${input.activityId}-${input.fileNameSuffix}.pdf`,
    loadPage: async (page) => {
      await page.goto(printUrl.toString(), { waitUntil: "load" });
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
  const sessionId = await createCouponBookPrintSession({
    draft: input.draft,
    exportScope: input.exportScope,
  });
  const trustedOrigin = resolveTrustedOrigin(input.request);
  const printUrl = new URL(
    `/couponbook-print/draft/${sessionId}`,
    trustedOrigin,
  );
  printUrl.search = searchParams.toString();

  try {
    return await renderCouponBookPdf({
      request: input.request,
      pdfCanvas,
      fileName: `cuponera-${input.activityId}-${input.fileNameSuffix}.pdf`,
      loadPage: async (page) => {
        await page.goto(printUrl.toString(), { waitUntil: "load" });
      },
    });
  } finally {
    await deleteCouponBookPrintSession(sessionId);
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

  let browser: Awaited<ReturnType<PlaywrightModule["chromium"]["launch"]>>;
  try {
    browser = await playwrightModule.chromium.launch(
      await resolveChromiumLaunchOptions(),
    );
  } catch (error) {
    console.error("Error launching browser for coupon book PDF export", error);
    return new Response(
      "No se pudo iniciar el navegador para exportar la cuponera.",
      { status: 500 },
    );
  }
  let browserContext: Awaited<ReturnType<typeof browser.newContext>> | null =
    null;

  try {
    browserContext = await browser.newContext();
    const cookieHeader = input.request.headers.get("cookie");
    if (cookieHeader) {
      const cookies = parseCookieHeaderForOrigin(
        cookieHeader,
        resolveTrustedOrigin(input.request),
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
