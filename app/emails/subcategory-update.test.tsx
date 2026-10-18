import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SubcategoryUpdateEmailTemplate from "@/app/emails/subcategory-update";

describe("SubcategoryUpdateEmailTemplate", () => {
  it("closes the sentence after the support address", () => {
    const html = renderToStaticMarkup(
      SubcategoryUpdateEmailTemplate(
        SubcategoryUpdateEmailTemplate.PreviewProps,
      ),
    );

    expect(html).toContain("soporte@productoraglitter.com</a>.");
  });
});
