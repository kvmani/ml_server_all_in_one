import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildAtoms } from "./CrystalCanvas";
import type { ViewerBasisSite } from "../../api";

const identityVectors: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
];

const basis: ViewerBasisSite[] = [
  { element: "Fe", frac_position: [0, 0, 0], cart_position: [0, 0, 0], atomic_radius: 1 },
];

const colorArray = (value: string) => new THREE.Color(value).convertSRGBToLinear().toArray();

describe("buildAtoms", () => {
  it("uses the custom color when single-color mode is selected", () => {
    const atoms = buildAtoms(
      basis,
      identityVectors,
      [1, 1, 1],
      {},
      1,
      0.25,
      "single",
      "#ff0000",
      {},
      true,
    );

    expect(atoms).toHaveLength(1);
    const [r, g, b] = atoms[0].color.toArray();
    const [er, eg, eb] = colorArray("#ff0000");
    expect(r).toBeCloseTo(er);
    expect(g).toBeCloseTo(eg);
    expect(b).toBeCloseTo(eb);
  });

  it("honors per-element override colors even when single-color mode is active", () => {
    const atoms = buildAtoms(
      basis,
      identityVectors,
      [1, 1, 1],
      {},
      1,
      0.25,
      "single",
      "#0000ff",
      { Fe: { color: "#00ff00" } },
      true,
    );

    expect(atoms).toHaveLength(1);
    const [r, g, b] = atoms[0].color.toArray();
    const [er, eg, eb] = colorArray("#00ff00");
    expect(r).toBeCloseTo(er);
    expect(g).toBeCloseTo(eg);
    expect(b).toBeCloseTo(eb);
  });
});
