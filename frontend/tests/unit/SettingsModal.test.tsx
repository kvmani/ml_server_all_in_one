import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsModal, type SettingsField } from "../../src/components/SettingsModal";

describe("SettingsModal", () => {
  const fields: SettingsField[] = [
    { key: "flag", label: "Enable feature", type: "boolean" },
    { key: "name", label: "Display name", type: "text", placeholder: "Enter name" },
  ];

  it("renders controls and wires events", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const handleClose = vi.fn();
    const handleReset = vi.fn();

    render(
      <SettingsModal
        isOpen
        title="Preferences"
        fields={fields}
        values={{ flag: false, name: "" }}
        onChange={handleChange}
        onClose={handleClose}
        onReset={handleReset}
      />,
    );

    expect(screen.getByRole("dialog", { name: /preferences/i })).toBeInTheDocument();

    await user.click(screen.getByLabelText(/enable feature/i));
    expect(handleChange).toHaveBeenCalledWith("flag", true);

    const input = screen.getByLabelText(/display name/i);
    await user.type(input, "A");
    expect(handleChange).toHaveBeenLastCalledWith("name", "A");

    await user.click(screen.getByRole("button", { name: /reset to defaults/i }));
    expect(handleReset).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /done/i }));
    expect(handleClose).toHaveBeenCalled();
  });
});
