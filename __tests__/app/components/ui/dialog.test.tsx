import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

function OverlayHandoff({
  dialogOpen,
  menuOpen,
}: {
  dialogOpen: boolean;
  menuOpen: boolean;
}) {
  return (
    <>
      <DropdownMenu open={menuOpen}>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Open dialog</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DrawerDialog isDesktop open={dialogOpen} onOpenChange={() => undefined}>
        <DrawerDialogContent isDesktop>
          <DrawerDialogTitle isDesktop>Dialog title</DrawerDialogTitle>
        </DrawerDialogContent>
      </DrawerDialog>
    </>
  );
}

describe("desktop drawer dialog overlay ownership", () => {
  afterEach(() => {
    cleanup();
    document.body.style.removeProperty("pointer-events");
  });

  it("keeps body pointer events consistent when taking over from a menu", () => {
    const view = render(<OverlayHandoff dialogOpen={false} menuOpen />);

    expect(document.body.style.pointerEvents).toBe("none");

    view.rerender(<OverlayHandoff dialogOpen menuOpen />);
    view.rerender(<OverlayHandoff dialogOpen menuOpen={false} />);

    expect(document.body.style.pointerEvents).toBe("none");

    view.rerender(<OverlayHandoff dialogOpen={false} menuOpen={false} />);

    expect(document.body.style.pointerEvents).toBe("");
  });
});
