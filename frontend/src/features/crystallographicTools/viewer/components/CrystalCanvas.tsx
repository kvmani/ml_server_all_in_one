import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { StructurePayload, ViewerBasisSite } from "../../api";
import { elementColor } from "../../utils/elementColors";
import { atomCountForSupercell } from "../../utils/crystalMath";
import type { DirectionConfig, ElementOverrides, PlaneConfig, ViewerSettings } from "../types";

type Props = {
  structure: StructurePayload | null;
  supercell: [number, number, number];
  planes: PlaneConfig[];
  directions: DirectionConfig[];
  settings: ViewerSettings;
  elementRadii: Record<string, number>;
  canvasKey: number;
  elementOverrides?: ElementOverrides;
};

type AtomVisual = {
  position: THREE.Vector3;
  color: THREE.Color;
  radius: number;
};

function latticeVectors(latticeMatrix?: number[][]): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const matrix = latticeMatrix ?? [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  return [
    new THREE.Vector3(...matrix[0]),
    new THREE.Vector3(...matrix[1]),
    new THREE.Vector3(...matrix[2]),
  ];
}

function fracToCart(frac: THREE.Vector3, vectors: [THREE.Vector3, THREE.Vector3, THREE.Vector3]): THREE.Vector3 {
  return new THREE.Vector3()
    .addScaledVector(vectors[0], frac.x)
    .addScaledVector(vectors[1], frac.y)
    .addScaledVector(vectors[2], frac.z);
}

function buildAtoms(
  basis: ViewerBasisSite[],
  vectors: [THREE.Vector3, THREE.Vector3, THREE.Vector3],
  supercell: [number, number, number],
  elementRadii: Record<string, number>,
  atomScale: number,
  minAtomRadius: number,
  colorMode: "element" | "single",
  customColor: string,
  elementOverrides: ElementOverrides | undefined,
  showAtoms: boolean,
): AtomVisual[] {
  if (!showAtoms) return [];
  const atoms: AtomVisual[] = [];
  const [na, nb, nc] = supercell;
  basis.forEach((site) => {
    const frac = site.frac_position || site.frac_coords;
    const symbol = (site.element || "").trim();
    const override = elementOverrides?.[symbol];
    const baseRadius = (site.atomic_radius ?? elementRadii[symbol] ?? 0.6) * atomScale * (override?.scale ?? 1);
    const radius = Math.max(minAtomRadius, baseRadius);
    const basePosition = fracToCart(new THREE.Vector3(frac[0], frac[1], frac[2]), vectors);
    const color = new THREE.Color(
      override?.color ?? (colorMode === "single" ? customColor : elementColor(symbol)),
    ).convertSRGBToLinear();
    for (let i = 0; i < na; i += 1) {
      for (let j = 0; j < nb; j += 1) {
        for (let k = 0; k < nc; k += 1) {
          const offset = vectors[0].clone().multiplyScalar(i).add(vectors[1].clone().multiplyScalar(j)).add(vectors[2].clone().multiplyScalar(k));
          atoms.push({
            position: basePosition.clone().add(offset),
            color,
            radius,
          });
        }
      }
    }
  });
  return atoms;
}

function buildCorners(vectors: [THREE.Vector3, THREE.Vector3, THREE.Vector3], supercell: [number, number, number]): THREE.Vector3[] {
  const [na, nb, nc] = supercell;
  const a = vectors[0].clone().multiplyScalar(na);
  const b = vectors[1].clone().multiplyScalar(nb);
  const c = vectors[2].clone().multiplyScalar(nc);
  return [
    new THREE.Vector3(0, 0, 0),
    a.clone(),
    b.clone(),
    a.clone().add(b),
    c.clone(),
    a.clone().add(c),
    b.clone().add(c),
    a.clone().add(b).add(c),
  ];
}

function buildEdges(corners: THREE.Vector3[], color: string, dashed = false): THREE.LineSegments {
  const indices = [
    [0, 1],
    [0, 2],
    [0, 4],
    [1, 3],
    [1, 5],
    [2, 3],
    [2, 6],
    [3, 7],
    [4, 5],
    [4, 6],
    [5, 7],
    [6, 7],
  ];
  const points: number[] = [];
  indices.forEach(([start, end]) => {
    points.push(...corners[start].toArray(), ...corners[end].toArray());
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.3, gapSize: 0.2, linewidth: 1 })
    : new THREE.LineBasicMaterial({ color, linewidth: 1.2 });
  const line = new THREE.LineSegments(geometry, material);
  if (dashed) {
    line.computeLineDistances();
  }
  return line;
}

function planePolygon(
  hkl: [number, number, number],
  vectors: [THREE.Vector3, THREE.Vector3, THREE.Vector3],
  supercell: [number, number, number],
): THREE.Vector3[] {
  const [h, k, l] = hkl;
  if (Math.abs(h) + Math.abs(k) + Math.abs(l) < 1e-8) return [];
  const bounds = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(supercell[0], 0, 0),
    new THREE.Vector3(0, supercell[1], 0),
    new THREE.Vector3(supercell[0], supercell[1], 0),
    new THREE.Vector3(0, 0, supercell[2]),
    new THREE.Vector3(supercell[0], 0, supercell[2]),
    new THREE.Vector3(0, supercell[1], supercell[2]),
    new THREE.Vector3(supercell[0], supercell[1], supercell[2]),
  ];
  const edges = [
    [0, 1],
    [0, 2],
    [0, 4],
    [1, 3],
    [1, 5],
    [2, 3],
    [2, 6],
    [3, 7],
    [4, 5],
    [4, 6],
    [5, 7],
    [6, 7],
  ];
  const fracPoints: THREE.Vector3[] = [];
  edges.forEach(([startIndex, endIndex]) => {
    const p1 = bounds[startIndex];
    const p2 = bounds[endIndex];
    const denom = h * (p2.x - p1.x) + k * (p2.y - p1.y) + l * (p2.z - p1.z);
    if (Math.abs(denom) < 1e-9) {
      return;
    }
    const t = (1 - (h * p1.x + k * p1.y + l * p1.z)) / denom;
    if (t < -1e-6 || t > 1 + 1e-6) {
      return;
    }
    const fracPoint = p1.clone().lerp(p2, t);
    fracPoints.push(fracPoint);
  });

  const cartPoints = fracPoints
    .map((point) => fracToCart(point, vectors))
    .filter((point, index, arr) => arr.findIndex((candidate) => candidate.distanceToSquared(point) < 1e-6) === index);

  if (cartPoints.length < 3) return [];

  const centroid = cartPoints.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(cartPoints.length);
  const normal = cartPoints[1].clone().sub(cartPoints[0]).cross(cartPoints[2].clone().sub(cartPoints[0])).normalize();
  const ref = Math.abs(normal.dot(new THREE.Vector3(0, 0, 1))) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const axis1 = new THREE.Vector3().crossVectors(normal, ref).normalize();
  const axis2 = new THREE.Vector3().crossVectors(normal, axis1).normalize();

  cartPoints.sort((a, b) => {
    const va = a.clone().sub(centroid);
    const vb = b.clone().sub(centroid);
    const angleA = Math.atan2(va.dot(axis2), va.dot(axis1));
    const angleB = Math.atan2(vb.dot(axis2), vb.dot(axis1));
    return angleA - angleB;
  });
  return cartPoints;
}

export function CrystalCanvas({
  structure,
  supercell,
  planes,
  directions,
  settings,
  elementRadii,
  canvasKey,
  elementOverrides,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);

  useEffect(() => {
    if (!structure || !structure.basis || !structure.lattice_matrix) {
      setFallback("Upload a CIF or POSCAR to render the crystal.");
      return undefined;
    }
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    if (typeof (window as any).WebGLRenderingContext === "undefined") {
      setFallback("WebGL is unavailable in this environment.");
      return undefined;
    }

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext | null;
    } catch (_error) {
      gl = null;
    }
    if (!gl) {
      setFallback("WebGL is unavailable in this environment.");
      return undefined;
    }
    setFallback(null);

    const vectors = latticeVectors(structure.lattice_matrix);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1224");
    scene.fog = new THREE.Fog(scene.background, 20, 140);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, context: gl, alpha: true });
    (renderer as any).outputColorSpace = THREE.SRGBColorSpace;
    (renderer as any).outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = false;
    const resize = () => {
      const { clientWidth, clientHeight } = container;
      renderer.setSize(clientWidth, clientHeight, false);
    };
    resize();

    const camera = new THREE.PerspectiveCamera(48, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 2000);
    const corners = buildCorners(vectors, supercell);
    const center = corners.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / corners.length);
    const boundingRadius = Math.max(...corners.map((point) => point.length())) || 12;
    camera.position.copy(new THREE.Vector3(boundingRadius * 0.8, boundingRadius * 0.9, boundingRadius * 1.1));
    camera.lookAt(center);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(center);
    controls.update();

    scene.add(new THREE.AmbientLight(0xb4c6ef, 0.85));
    const keyLight = new THREE.DirectionalLight(0x9cccf8, 0.8);
    keyLight.position.set(1.8, 1.2, 2.4);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x6dd3c6, 0.4);
    fillLight.position.set(-1.2, -0.8, 1.2);
    scene.add(fillLight);

    if (settings.showCell) {
      scene.add(buildEdges(buildCorners(vectors, [1, 1, 1]), "#67e8f9"));
    }
    if (settings.showSupercell) {
      scene.add(buildEdges(corners, "#22c55e", true));
    }
    if (settings.showAxes) {
      const axes = new THREE.AxesHelper(Math.max(...corners.map((c) => c.length())) * 0.6);
      scene.add(axes);
    }

    const atoms = buildAtoms(
      structure.basis,
      vectors,
      supercell,
      elementRadii,
      settings.atomScale,
      settings.minAtomRadius,
      settings.colorMode,
      settings.customColor,
      settings.elementOverrides,
      settings.showAtoms,
    );
    if (atoms.length && settings.showAtoms) {
      const geometry = new THREE.SphereGeometry(1, 24, 24);
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.25,
        roughness: 0.4,
      });
      material.color.set("#ffffff");
      material.emissive = new THREE.Color("#0c1020");
      material.emissiveIntensity = 0.18;
      material.needsUpdate = true;
      const mesh = new THREE.InstancedMesh(geometry, material, atoms.length);
      const colorArray = new Float32Array(atoms.length * 3);
      atoms.forEach((atom, index) => {
        const matrix = new THREE.Matrix4();
        matrix.makeScale(atom.radius, atom.radius, atom.radius);
        matrix.setPosition(atom.position);
        mesh.setMatrixAt(index, matrix);
        colorArray.set(atom.color.toArray(), index * 3);
      });
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      scene.add(mesh);
    }

    if (settings.showPlanes) {
      planes.filter((plane) => plane.visible).forEach((plane) => {
        const hkl: [number, number, number] = [plane.h, plane.k, plane.l];
        const points = planePolygon(hkl, vectors, supercell);
        if (points.length >= 3) {
          const triangles: number[] = [];
          for (let i = 1; i < points.length - 1; i += 1) {
            triangles.push(...points[0].toArray(), ...points[i].toArray(), ...points[i + 1].toArray());
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.Float32BufferAttribute(triangles, 3));
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(plane.color),
            transparent: true,
            opacity: plane.opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);

          const outlineGeometry = new THREE.BufferGeometry().setFromPoints([...points, points[0]]);
          const outlineMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(plane.color).offsetHSL(0, 0, -0.15) });
          const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial);
          scene.add(outline);
        }
      });
    }

    if (settings.showDirections) {
      directions.filter((direction) => direction.visible).forEach((direction) => {
        const vector = new THREE.Vector3()
          .addScaledVector(vectors[0], direction.u)
          .addScaledVector(vectors[1], direction.v)
          .addScaledVector(vectors[2], direction.w);
        if (vector.length() < 1e-6) return;
        const length = Math.min(Math.max(vector.length(), 1.5), Math.max(boundingRadius, 2));
        const arrow = new THREE.ArrowHelper(vector.clone().normalize(), new THREE.Vector3(0, 0, 0), length, direction.color, 0.4, 0.24);
        scene.add(arrow);
      });
    }

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
        const { clientWidth, clientHeight } = container;
        camera.aspect = clientWidth / Math.max(clientHeight, 1);
        camera.updateProjectionMatrix();
        renderer.setSize(clientWidth, clientHeight, false);
      })
      : null;
    observer?.observe(container);

    return () => {
      renderer.setAnimationLoop(null);
      observer?.disconnect();
      scene.clear();
      renderer.dispose();
      controls.dispose();
    };
  }, [structure, supercell, planes, directions, settings, elementRadii, canvasKey, elementOverrides]);

  const totalAtoms = structure?.viewer_limits ? atomCountForSupercell(structure.viewer_limits.atom_count, supercell) : 0;

  return (
    <div className="cryst-viewer__canvas" ref={containerRef} aria-live="polite">
      <canvas ref={canvasRef} />
      <div className="cryst-viewer__hud">
        <div className="badge">{structure?.space_group?.symbol || "P1"}</div>
        {totalAtoms ? <div className="badge">{totalAtoms} atoms</div> : null}
      </div>
      {fallback ? <div className="cryst-viewer__fallback">{fallback}</div> : null}
    </div>
  );
}

export default CrystalCanvas;
