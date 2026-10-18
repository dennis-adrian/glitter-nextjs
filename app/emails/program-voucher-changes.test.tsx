import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ProgramVoucherChangesEmailTemplate from "@/app/emails/program-voucher-changes";

describe("ProgramVoucherChangesEmailTemplate", () => {
  /** Reason boxes are a soft tint, like every other one, never an edge stripe. */
  it("sets the reason in a tinted box without a colored left border", () => {
    const html = renderToStaticMarkup(
      ProgramVoucherChangesEmailTemplate(
        ProgramVoucherChangesEmailTemplate.PreviewProps,
      ),
    );

    expect(html).not.toContain("border-left");
    expect(html).toMatch(
      /background-color:#f2f3f3[^>]*>El comprobante que subiste/,
    );
  });
});
