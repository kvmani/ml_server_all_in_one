import React from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingOverlay } from "../../src/components/LoadingOverlay";
import { LoadingProvider, useLoading } from "../../src/contexts/LoadingContext";

function Trigger({ active }: { active: boolean }) {
  const { begin, end } = useLoading();
  React.useEffect(() => {
    if (active) {
      begin();
    } else {
      end();
    }
  }, [active, begin, end]);
  return null;
}

function Harness({ active }: { active: boolean }) {
  return (
    <LoadingProvider>
      <LoadingOverlay />
      <Trigger active={active} />
    </LoadingProvider>
  );
}

describe("LoadingOverlay", () => {
  it("toggles visibility based on loading state", () => {
    const { rerender } = render(<Harness active={false} />);

    let overlay = screen.getByRole("status", { hidden: true });
    expect(overlay).toHaveAttribute("aria-busy", "false");
    expect(overlay.parentElement).toHaveAttribute("aria-hidden", "true");

    act(() => {
      rerender(<Harness active={true} />);
    });
    overlay = screen.getByRole("status", { hidden: true });
    expect(overlay).toHaveAttribute("aria-busy", "true");
    expect(overlay.parentElement).toHaveAttribute("aria-hidden", "false");

    act(() => {
      rerender(<Harness active={false} />);
    });
    overlay = screen.getByRole("status", { hidden: true });
    expect(overlay).toHaveAttribute("aria-busy", "false");
    expect(overlay.parentElement).toHaveAttribute("aria-hidden", "true");
  });
});
