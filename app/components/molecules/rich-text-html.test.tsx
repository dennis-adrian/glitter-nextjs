import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import RichTextHtml from "@/app/components/molecules/rich-text-html";

afterEach(cleanup);

// What `blocksToSanitizedHtml(…, "announcement")` draws for a captioned
// image and for one without a caption.
const WITH_IMAGES =
  '<p>Así queda el armado:</p><figure><img src="https://abc123.ufs.sh/f/PLANO" alt="El plano" /><figcaption>El plano</figcaption></figure><img src="https://utfs.io/f/CREDENCIAL" alt="" /><p>Después</p>';

describe("RichTextHtml", () => {
  it("fits a comunicado's images to the column, a caption centred under its image", () => {
    const { container } = render(<RichTextHtml html={WITH_IMAGES} />);
    const body = container.firstElementChild!;

    expect(body.querySelectorAll("img")).toHaveLength(2);
    expect(body.querySelector("figcaption")?.textContent).toBe("El plano");
    for (const style of [
      // Never wider than the column, never stretched.
      "[&_img]:max-w-full",
      "[&_img]:h-auto",
      // A bare image is spaced like a figure, and an image in a figure
      // takes no second margin.
      "[&_img]:my-4",
      "[&_figure]:my-4",
      "[&_figure_img]:my-0",
      "[&_figcaption]:text-center",
      "[&_figcaption]:text-muted-foreground",
    ]) {
      expect(body.classList, style).toContain(style);
    }
  });

  it("renders nothing without HTML", () => {
    expect(render(<RichTextHtml html="  " />).container.innerHTML).toBe("");
  });
});
