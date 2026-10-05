import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "@jest/globals";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

/**
 * Regression cover for dialog reachability on short and landscape viewports.
 *
 * A Radix dialog locks body scrolling while it is open, so a tall dialog with
 * no height cap pushes its primary action below the fold with no way to reach
 * it. A wallet-verification dialog hit exactly that on a 667x320 viewport. The
 * contract asserted here is the height cap plus vertical scrolling on the
 * content element; jsdom does no layout, so the classes are what can be pinned.
 */

function openDialog(contentClassName?: string) {
  render(
    <Dialog open>
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle>Verify wallet</DialogTitle>
          <DialogDescription>Sign to confirm ownership.</DialogDescription>
        </DialogHeader>
        <button type="button">Sign message</button>
      </DialogContent>
    </Dialog>,
  );

  return screen.getByRole("dialog");
}

describe("DialogContent viewport contract", () => {
  it("caps its height to the viewport and scrolls its own content", () => {
    const content = openDialog();

    expect(content.className).toContain("max-h-[85vh]");
    expect(content.className).toContain("overflow-y-auto");
  });

  it("keeps the contract when a consumer passes its own classes", () => {
    const content = openDialog("glass sm:max-w-lg");

    expect(content.className).toContain("max-h-[85vh]");
    expect(content.className).toContain("overflow-y-auto");
    expect(content.className).toContain("sm:max-w-lg");
  });

  it("renders the primary action inside the scrollable content", () => {
    const content = openDialog();

    expect(content.contains(screen.getByRole("button", { name: "Sign message" }))).toBe(
      true,
    );
  });
});
