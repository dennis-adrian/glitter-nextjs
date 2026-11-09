import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ContactList from "@/app/components/contact/contact-list";

afterEach(cleanup);

describe("ContactList", () => {
  it("offers the footer's email and social networks", () => {
    render(<ContactList />);

    expect(
      screen.getByRole("link", { name: /Escribinos/ }).getAttribute("href"),
    ).toBe("mailto:info@productoraglitter.com");
    for (const [name, href] of [
      ["Instagram", "https://www.instagram.com/glitter.bo"],
      ["TikTok", "https://tiktok.com/@glitter.bo"],
      ["Facebook", "https://www.facebook.com/glitterfestival"],
    ]) {
      const link = screen.getByRole("link", { name: new RegExp(name) });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("target")).toBe("_blank");
    }
  });
});
