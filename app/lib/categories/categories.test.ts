import { describe, expect, it } from "vitest";

import { isDeleteBlocked, hasUnverifiedLinks, shouldWarnRenameMove } from "@/app/lib/categories/delete";
import {
  filterPickerOptions,
  withExclusiveSelection,
} from "@/app/lib/categories/filters";
import {
  findCanonicalLabelDuplicates,
  formatCanonicalDuplicateReport,
  labelsMatch,
  normalizeCategoryLabel,
  uniqueLabelIndexKey,
  CANONICAL_LABEL_ENVIRONMENT_SQL,
  CANONICAL_LABEL_SQL,
} from "@/app/lib/categories/label";
import {
  categoryParticipantsHref,
  formatDeleteBlockedMessage,
  UNIQUE_LABEL_MESSAGE,
} from "@/app/lib/categories/copy";
import { isUniqueViolation } from "@/app/lib/categories/pg";
import {
  isAdminAssignable,
  isParticipantSelectable,
  isPubliclyListed,
} from "@/app/lib/categories/visibility";

describe("category visibility matrix", () => {
  it("maps hidden / listed / selectable to public and picker surfaces", () => {
    expect(isPubliclyListed("hidden")).toBe(false);
    expect(isParticipantSelectable("hidden", false)).toBe(false);
    expect(isAdminAssignable("hidden")).toBe(false);

    expect(isPubliclyListed("listed")).toBe(true);
    expect(isParticipantSelectable("listed", false)).toBe(false);
    expect(isAdminAssignable("listed")).toBe(true);

    expect(isPubliclyListed("selectable")).toBe(true);
    expect(isParticipantSelectable("selectable", false)).toBe(true);
    expect(isAdminAssignable("selectable")).toBe(true);
  });

  it("keeps admin-assignable-only rows out of the participant picker", () => {
    expect(isParticipantSelectable("selectable", true)).toBe(false);
    expect(isParticipantSelectable("listed", true)).toBe(false);
    expect(isAdminAssignable("listed")).toBe(true);
  });
});

describe("delete rules", () => {
  const empty = {
    verified: 0,
    paused: 0,
    pending: 0,
    rejected: 0,
    banned: 0,
    stands: 0,
  };

  it("blocks when a verified profile uses the row", () => {
    expect(isDeleteBlocked({ ...empty, verified: 2 })).toBe(true);
  });

  it("blocks when a stand uses the row", () => {
    expect(isDeleteBlocked({ ...empty, stands: 1 })).toBe(true);
  });

  it("allows delete when only unverified profiles are linked, with a warning", () => {
    const counts = { ...empty, pending: 2, rejected: 1, banned: 1 };
    expect(isDeleteBlocked(counts)).toBe(false);
    expect(hasUnverifiedLinks(counts)).toBe(true);
  });

  it("blocks when a paused profile uses the row", () => {
    expect(isDeleteBlocked({ ...empty, paused: 4 })).toBe(true);
    expect(hasUnverifiedLinks({ ...empty, paused: 4 })).toBe(false);
    expect(formatDeleteBlockedMessage("Pintura", 0, 1, 0)).toBe(
      "No se puede eliminar Pintura porque 1 perfil pausado la usa.",
    );
    expect(formatDeleteBlockedMessage("Pintura", 0, 4, 0)).toBe(
      "No se puede eliminar Pintura porque 4 perfiles pausados la usan.",
    );
    expect(formatDeleteBlockedMessage("Pintura", 1, 1, 1)).toBe(
      "No se puede eliminar Pintura porque 1 perfil verificado, 1 perfil pausado y 1 stand la usan.",
    );
  });

  it("warns on rename or move when any profile or stand is linked", () => {
    expect(shouldWarnRenameMove(true, { ...empty, pending: 1 })).toBe(true);
    expect(shouldWarnRenameMove(true, { ...empty, paused: 1 })).toBe(true);
    expect(shouldWarnRenameMove(true, { ...empty, rejected: 1 })).toBe(true);
    expect(shouldWarnRenameMove(true, { ...empty, banned: 1 })).toBe(true);
    expect(shouldWarnRenameMove(true, empty)).toBe(false);
    expect(shouldWarnRenameMove(false, { ...empty, pending: 2 })).toBe(false);
  });
});

describe("exclusive and admin-only picker filters", () => {
  const crochet = {
    id: 1,
    category: "entrepreneurship",
    isExclusive: false,
    isAdminAssignableOnly: false,
  };
  const skincare = {
    id: 2,
    category: "entrepreneurship",
    isExclusive: true,
    isAdminAssignableOnly: false,
  };
  const sublimacion = {
    id: 3,
    category: "entrepreneurship",
    isExclusive: false,
    isAdminAssignableOnly: true,
  };
  const all = [crochet, skincare, sublimacion];

  it("hides admin-assignable-only rows from the participant picker", () => {
    expect(
      filterPickerOptions(all, [], "entrepreneurship").map((row) => row.id),
    ).toEqual([1, 2]);
  });

  it("hides exclusive options once another row is selected", () => {
    expect(
      filterPickerOptions(all, [crochet], "entrepreneurship").map(
        (row) => row.id,
      ),
    ).toEqual([]);
  });

  it("clears other rows when an exclusive category is selected", () => {
    expect(withExclusiveSelection([crochet], skincare)).toEqual([skincare]);
  });

  it("returns no options after an exclusive row is selected", () => {
    expect(filterPickerOptions(all, [skincare], "entrepreneurship")).toEqual([]);
  });
});

describe("label normalization", () => {
  it("treats accents, slashes, and extra spaces as equivalent", () => {
    expect(normalizeCategoryLabel("Bisutería / Bijouteria")).toBe(
      "bisuteria bijouteria",
    );
    expect(labelsMatch("Arte en papel / Papercraft", "arte en papel papercraft")).toBe(
      true,
    );
    expect(labelsMatch("Sublimación colaborativa", "sublimacion colaborativa")).toBe(
      true,
    );
    expect(normalizeCategoryLabel("Cafe\u{1AB0}")).toBe("cafe");
  });

  it("treats the same trimmed lowercase label as a collision inside one área", () => {
    expect(uniqueLabelIndexKey("illustration", "Crochet")).toBe(
      uniqueLabelIndexKey("illustration", " CROCHET "),
    );
    expect(uniqueLabelIndexKey("illustration", "Crochet")).not.toBe(
      uniqueLabelIndexKey("entrepreneurship", "Crochet"),
    );
    expect(UNIQUE_LABEL_MESSAGE).toMatch(/área/i);
  });

  it("reports canonical duplicates that lower() would miss", () => {
    const duplicates = findCanonicalLabelDuplicates([
      { id: 1, category: "illustration", label: "Café" },
      { id: 2, category: "illustration", label: "Cafe" },
      { id: 3, category: "gastronomy", label: "Café" },
    ]);
    expect(duplicates).toEqual([
      {
        category: "illustration",
        canonical: "cafe",
        ids: [1, 2],
        labels: ["Café", "Cafe"],
      },
    ]);
    expect(formatCanonicalDuplicateReport(duplicates)).toContain("ids=1,2");
    expect(CANONICAL_LABEL_SQL).toContain("normalize(\"name\", NFD)");
    expect(CANONICAL_LABEL_SQL).toContain("\\1AB0-\\1AFF");
    expect(CANONICAL_LABEL_ENVIRONMENT_SQL).toContain("130000");
    expect(CANONICAL_LABEL_ENVIRONMENT_SQL).toContain("UTF8");
    expect(CANONICAL_LABEL_ENVIRONMENT_SQL).toContain("standard_conforming_strings");
    expect(CANONICAL_LABEL_ENVIRONMENT_SQL).not.toContain(CANONICAL_LABEL_SQL);
  });
});

describe("unique constraint errors", () => {
  it("recognizes Postgres unique-violation code 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("duplicate"))).toBe(false);
  });
});

describe("participants deep link", () => {
  it("filters the users list by the category área", () => {
    expect(categoryParticipantsHref("illustration")).toContain(
      "category=illustration",
    );
    expect(categoryParticipantsHref("none")).not.toContain("category=");
  });
});
