// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@/app/components/cultural-activities/cultural-activity-wizard",
  () => ({ default: () => null }),
);

import CulturalActivityApplyPage from "@/app/(site)/(routes)/actividades-culturales/postular/page";

type Element = {
  props: { children: { props: { initialCategory: string | null } } };
};

async function initialCategory(tipo?: string | string[]) {
  const page = (await CulturalActivityApplyPage({
    searchParams: Promise.resolve(tipo === undefined ? {} : { tipo }),
  })) as unknown as Element;
  return page.props.children.props.initialCategory;
}

describe("/actividades-culturales/postular", () => {
  it.each([
    ["musica", "music"],
    ["baile", "dance"],
    ["charla", "talk"],
    ["taller", "workshop"],
    ["otro", "other"],
    ["TALLER", "workshop"],
  ])("starts ?tipo=%s on %s", async (tipo, category) => {
    expect(await initialCategory(tipo)).toBe(category);
  });

  it("takes the first value when tipo repeats", async () => {
    expect(await initialCategory(["charla", "baile"])).toBe("talk");
  });

  it.each([undefined, "", "music", "teatro"])(
    "starts on step 1 for %s",
    async (tipo) => {
      expect(await initialCategory(tipo)).toBeNull();
    },
  );
});
