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
    const viewerPayload = {
      lattice: { a: 5.43, b: 5.43, c: 5.43, alpha: 90, beta: 90, gamma: 90 },
      lattice_matrix: [
        [5.43, 0, 0],
        [0, 5.43, 0],
        [0, 0, 5.43],
      ],
      sites: [],
      basis: [
        { element: "Si", frac_position: [0, 0, 0], cart_position: [0, 0, 0], atomic_number: 14 },
        { element: "Si", frac_position: [0.25, 0.25, 0.25], cart_position: [1.3575, 1.3575, 1.3575], atomic_number: 14 },
      ],
      cif: "data",
      num_sites: 2,
      formula: "Si2",
      is_hexagonal: false,
      crystal_system: "cubic",
      space_group: { symbol: "Fd-3m", number: 227 },
      viewer_limits: {
        max_atoms: 500,
        supercell_default: [3, 3, 3],
        supercell_max: [4, 4, 4],
        supercell_requested: [3, 3, 3],
        atom_count: 2,
        atom_count_supercell: 54,
      },
    };
    const samplePayload = {
      lattice: { a: 2.8665, b: 2.8665, c: 2.8665, alpha: 90, beta: 90, gamma: 90 },
      lattice_matrix: [
        [2.8665, 0, 0],
        [0, 2.8665, 0],
        [0, 0, 2.8665],
      ],
      sites: [],
      basis: [
        { element: "Fe", frac_position: [0, 0, 0], cart_position: [0, 0, 0], atomic_number: 26 },
        { element: "Fe", frac_position: [0.5, 0.5, 0.5], cart_position: [1.43325, 1.43325, 1.43325], atomic_number: 26 },
      ],
      cif: "fe",
      num_sites: 2,
      formula: "Fe2",
      is_hexagonal: false,
      crystal_system: "cubic",
      space_group: { symbol: "Im-3m", number: 229 },
      viewer_limits: {
        max_atoms: 500,
        supercell_default: [3, 3, 3],
        supercell_max: [4, 4, 4],
        supercell_requested: [3, 3, 3],
        atom_count: 2,
        atom_count_supercell: 54,
      },
    };
    const mockFetch = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/crystal_viewer/element_radii")) {
        return Promise.resolve(apiResponse({ Fe: 1.26, Si: 1.11 }));
      }
      if (url.includes("/crystal_viewer/parse")) {
        return Promise.resolve(apiResponse(viewerPayload));
      }
      if (url.includes("/crystal_viewer/export_structure")) {
        return Promise.resolve(apiResponse(samplePayload));
      }
      if (url.includes("/edit_cif")) {
        return Promise.resolve(apiResponse(samplePayload));
      }
      if (url.includes("/xrd")) {
        return Promise.resolve(apiResponse({
          peaks: [{ two_theta: 30, intensity: 100, intensity_lp: 50, intensity_normalized: 100, d_spacing: 2.0, hkl: [1, 1, 1] }],
          curve: [{ two_theta: 30, intensity: 100 }],
          range: { min: 20, max: 80, step: 0.1 },
          instrument: { radiation: "CuKa", wavelength_angstrom: 1.54, geometry: "bragg_brentano", polarization_ratio: 0.5 },
          profile: { u: 0.02, v: 0, w: 0.1, model: "gaussian" },
          summary: { peak_count: 1, max_intensity: 100 },
        }));
      }
      if (url.includes("/tem_saed")) {
        return Promise.resolve(
          apiResponse({
            metadata: {
              phase_name: "Si",
              formula: "Si2",
              spacegroup: "Fd-3m",
              zone_axis: [1, 0, 0],
              x_axis_hkl: null,
              inplane_rotation_deg: 0,
              voltage_kv: 200,
              lambda_angstrom: 0.025,
              camera_length_cm: 10,
              laue_zone: 0,
              min_d_angstrom: 0.5,
              max_index: 3,
              intensity_min_relative: 0.01,
            },
            limits: { x_min: -1, x_max: 1, y_min: -1, y_max: 1, r_max: 1.2, i_max: 1 },
            spots: [
              {
                hkl: [1, 1, 0],
                zone: 0,
                d_angstrom: 2.5,
                s2: null,
                intensity_raw: 120,
                intensity_rel: 0.8,
                x_cm: 0.1,
                y_cm: 0.2,
                x_rot_cm: 0.1,
                y_rot_cm: 0.2,
                x_norm: 0.2,
                y_norm: 0.4,
                r_cm: 0.2236,
                two_theta_deg: 5.0,
                label: "110",
              },
            ],
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

    fireEvent.click(screen.getByRole("tab", { name: /xrd peaks/i }));
    fireEvent.click(screen.getByRole("button", { name: /compute xrd/i }));
    await waitFor(() => expect(screen.getByText("30.000")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: /TEM/i }));
    fireEvent.click(screen.getByRole("button", { name: /simulate saed/i }));
    await waitFor(() => expect(screen.getByText(/d = 2\.500/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: /Calculator/i }));
    fireEvent.click(screen.getByRole("button", { name: /compute angles/i }));
    await waitFor(() => expect(screen.getByText(/90\.00°/)).toBeInTheDocument());
    expect(screen.getByText(/45\.00°/)).toBeInTheDocument();
  });

  it("loads the Fe sample and pre-fills a [0 0 1] zone axis", async () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: /load fe sample/i }));

    await waitFor(() => expect(screen.getByText("Fe2")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: /tem/i }));
    const [zoneH] = screen.getAllByLabelText("h") as HTMLInputElement[];
    const kInput = screen.getByLabelText("k") as HTMLInputElement;
    const lInput = screen.getByLabelText("l") as HTMLInputElement;

    expect(zoneH.value).toBe("0");
    expect(kInput.value).toBe("0");
    expect(lInput.value).toBe("1");
  });

  it("shows four-index helpers for hexagonal structures", async () => {
    (global as any).fetch = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/crystal_viewer/element_radii")) {
        return Promise.resolve(apiResponse({ Mg: 1.6 }));
      }
      if (url.includes("/crystal_viewer/parse")) {
        return Promise.resolve(
          apiResponse({
            lattice: { a: 3.0, b: 3.0, c: 5.0, alpha: 90, beta: 90, gamma: 120 },
            lattice_matrix: [
              [3, 0, 0],
              [0, 3, 0],
              [0, 0, 5],
            ],
            sites: [],
            basis: [{ element: "Mg", frac_position: [0, 0, 0], cart_position: [0, 0, 0], atomic_number: 12 }],
            cif: "hex",
            num_sites: 2,
            formula: "Mg",
            is_hexagonal: true,
            crystal_system: "hexagonal",
            space_group: { symbol: "P63/mmc", number: 194 },
            viewer_limits: {
              max_atoms: 500,
              supercell_default: [3, 3, 3],
              supercell_max: [4, 4, 4],
              supercell_requested: [3, 3, 3],
              atom_count: 1,
              atom_count_supercell: 27,
            },
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
    const [computedField] = screen.getAllByLabelText("t = -(u+v)") as HTMLInputElement[];
    expect(computedField.value).toBe("-1.000");
  });
});
