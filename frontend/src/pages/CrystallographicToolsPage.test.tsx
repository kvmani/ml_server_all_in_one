import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrystallographicToolsPage from "./CrystallographicToolsPage";
import { LoadingProvider } from "../contexts/LoadingContext";
import { LogProvider } from "../contexts/LogContext";

function renderPage() {
  return render(
    <LoadingProvider>
      <LogProvider>
        <CrystallographicToolsPage />
      </LogProvider>
    </LoadingProvider>,
  );
}

function apiResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status < 400, data }), { status });
}

describe("CrystallographicToolsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    const mockFetch = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/load_cif")) {
        return Promise.resolve(
          apiResponse({
            lattice: { a: 5.43, b: 5.43, c: 5.43, alpha: 90, beta: 90, gamma: 90 },
            sites: [],
            cif: "data",
            num_sites: 2,
            formula: "Si2",
            is_hexagonal: false,
            crystal_system: "cubic",
          }),
        );
      }
      if (url.includes("/xrd")) {
        return Promise.resolve(apiResponse({ peaks: [{ two_theta: 30, intensity: 100, d_spacing: 2.0, hkl: [1, 1, 1] }] }));
      }
      if (url.includes("/tem_saed")) {
        return Promise.resolve(
          apiResponse({
            spots: [{ hkl: [1, 1, 0], x: 0.1, y: 0.2, intensity: 0.8, g_magnitude: 2.0, d_spacing: 2.5, two_theta: 5.0 }],
            calibration: { wavelength_angstrom: 0.025, camera_length_mm: 100, zone_axis: [1, 0, 0], max_index: 3, g_max: 6 },
            basis: { zone: [1, 0, 0], x: [0, 1, 0], y: [0, 0, 1] },
          }),
        );
      }
      if (url.includes("/calculator")) {
        return Promise.resolve(
          apiResponse({
            is_hexagonal: false,
            direction_angle_deg: 90,
            plane_vector_angle_deg: 45,
            direction_a: { three_index: [1, 0, 0], four_index: null },
            direction_b: { three_index: [0, 1, 0], four_index: null },
            plane: { three_index: [1, 0, 0], four_index: null },
            equivalents: { direction: { three_index: [[1, 0, 0]], four_index: [] }, plane: { three_index: [[1, 0, 0]], four_index: [] } },
          }),
        );
      }
      return Promise.resolve(apiResponse({ success: false }, 404));
    });
    (global as any).fetch = mockFetch;
  });

  it("shares the loaded CIF across tabs and triggers calculations", async () => {
    const { container } = renderPage();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["cif"], "si.cif", { type: "chemical/x-cif" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("Si2")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /compute xrd/i }));
    await waitFor(() => expect(screen.getByText(/30\.00° 2θ/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: /TEM/i }));
    fireEvent.click(screen.getByRole("button", { name: /simulate saed/i }));
    await waitFor(() => expect(screen.getByText(/g = 2\.000/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: /Calculator/i }));
    fireEvent.click(screen.getByRole("button", { name: /compute angles/i }));
    await waitFor(() => expect(screen.getByText(/90\.00°/)).toBeInTheDocument());
    expect(screen.getByText(/45\.00°/)).toBeInTheDocument();
  });

  it("shows four-index helpers for hexagonal structures", async () => {
    (global as any).fetch = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/load_cif")) {
        return Promise.resolve(
          apiResponse({
            lattice: { a: 3.0, b: 3.0, c: 5.0, alpha: 90, beta: 90, gamma: 120 },
            sites: [],
            cif: "hex",
            num_sites: 2,
            formula: "Mg",
            is_hexagonal: true,
            crystal_system: "hexagonal",
          }),
        );
      }
      return Promise.resolve(apiResponse({ success: false }, 404));
    });

    const { container } = renderPage();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["cif"], "hex.cif", { type: "chemical/x-cif" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText("Mg")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: /Calculator/i }));
    const computedField = screen.getByLabelText("t = -(u+v)") as HTMLInputElement;
    expect(computedField.value).toBe("-1.000");
  });
});
