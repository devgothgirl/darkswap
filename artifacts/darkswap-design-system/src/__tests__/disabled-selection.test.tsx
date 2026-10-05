import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, jest } from "@jest/globals";

import { AssetRow } from "../components/ui/asset-row";
import { RouteCard } from "../components/ui/route-card";

/**
 * Regression cover for the disabled contract on the two selectable families.
 *
 * `pointer-events: none` plus `aria-disabled` is not enough: with the
 * documented `asChild` button composition an unavailable option stayed
 * focusable and could still be chosen with Enter or Space. These tests pin both
 * halves of the fix -- native `disabled` forwarded to the rendered child, and
 * capture-phase blocking for a child element that does not honour it.
 *
 * Plain DOM assertions only, so the package needs no extra matcher dependency.
 */

const CASES = [
  { name: "RouteCard", Family: RouteCard },
  { name: "AssetRow", Family: AssetRow },
] as const;

type Case = (typeof CASES)[number];

describe.each(CASES)("$name disabled contract", ({ Family }: Case) => {
  it("forwards native disabling to an asChild button and removes it from the tab order", () => {
    render(
      <Family asChild disabled>
        <button type="button">Unavailable option</button>
      </Family>,
    );

    const option = screen.getByRole("button") as HTMLButtonElement;
    expect(option.disabled).toBe(true);
    expect(option.getAttribute("aria-disabled")).toBe("true");
    // `disabled` plus `tabindex="-1"` is what takes the option out of the tab
    // order and out of keyboard activation in a real browser. jsdom does not
    // enforce either, so the attributes are the contract asserted here; the
    // next test covers the behaviour for children that ignore them.
    expect(option.getAttribute("tabindex")).toBe("-1");
  });

  it("blocks click and Enter/Space activation on a child that ignores native disabling", () => {
    const onClick = jest.fn();
    const onKeyDown = jest.fn();
    render(
      <Family asChild disabled>
        <a href="#option" onClick={onClick} onKeyDown={onKeyDown}>
          Unavailable option
        </a>
      </Family>,
    );

    const option = screen.getByText("Unavailable option");

    fireEvent.click(option);
    expect(onClick).not.toHaveBeenCalled();

    for (const key of ["Enter", " "]) {
      // fireEvent returns false once a handler has called preventDefault.
      expect(fireEvent.keyDown(option, { key })).toBe(false);
    }
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("leaves an enabled option fully interactive", () => {
    const onClick = jest.fn();
    render(
      <Family asChild onClick={onClick}>
        <button type="button">Available option</button>
      </Family>,
    );

    const option = screen.getByRole("button", {
      name: "Available option",
    }) as HTMLButtonElement;
    expect(option.disabled).toBe(false);
    expect(option.getAttribute("tabindex")).toBe(null);

    option.focus();
    expect(document.activeElement).toBe(option);

    fireEvent.click(option);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
