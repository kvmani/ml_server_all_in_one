import { useMemo, useState } from "react";
import type { StructurePayload, ViewerLimits } from "../api";
import CrystalCanvas from "./components/CrystalCanvas";
import PlaneDirectionControls from "./components/PlaneDirectionControls";
import StructureControls from "./components/StructureControls";
import type { DirectionConfig, ElementOverrides, PlaneConfig, ViewerSettings } from "./types";
import type { SampleCif } from "../samples";

type Props = {
  structure: StructurePayload | null;
  supercell: [number, number, number];
  limits?: ViewerLimits;
  elementRadii: Record<string, number>;
  samples: SampleCif[];
  fileInputRef: React.RefObject<HTMLInputElement>;
  onUploadFile: (file?: File) => void;
  onLoadSample: (sampleId?: string) => void;
  onSupercellChange: (next: [number, number, number]) => void;
  onSendToXrd: () => void;
  onSendToTem: () => void;
};

const DEFAULT_PLANES: PlaneConfig[] = [
  { id: "plane-100", h: 1, k: 0, l: 0, color: "#22d3ee", opacity: 0.35, visible: true },
  { id: "plane-110", h: 1, k: 1, l: 0, color: "#f97316", opacity: 0.3, visible: true },
  { id: "plane-111", h: 1, k: 1, l: 1, color: "#22c55e", opacity: 0.3, visible: false },
];

const DEFAULT_DIRECTIONS: DirectionConfig[] = [
  { id: "dir-100", u: 1, v: 0, w: 0, color: "#38bdf8", visible: true },
  { id: "dir-010", u: 0, v: 1, w: 0, color: "#f59e0b", visible: false },
];

const DEFAULT_SETTINGS: ViewerSettings = {
  showAtoms: true,
  showCell: true,
  showSupercell: true,
  showPlanes: true,
  showDirections: true,
  showAxes: false,
  atomScale: 0.85,
  minAtomRadius: 0.25,
  colorMode: "single",
  customColor: "#ef4444",
};

export function CrystalViewerTab({
  structure,
  supercell,
  limits,
  elementRadii,
  samples,
  fileInputRef,
  onUploadFile,
  onLoadSample,
  onSupercellChange,
  onSendToXrd,
  onSendToTem,
}: Props) {
  const [planes, setPlanes] = useState<PlaneConfig[]>(DEFAULT_PLANES);
  const [directions, setDirections] = useState<DirectionConfig[]>(DEFAULT_DIRECTIONS);
  const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);
  const [canvasKey, setCanvasKey] = useState(0);
  const [elementOverrides, setElementOverrides] = useState<ElementOverrides>({});

  const limitWarning = useMemo(() => {
    if (!limits) return null;
    const atoms = (limits.atom_count || 0) * supercell[0] * supercell[1] * supercell[2];
    if (atoms > limits.max_atoms) {
      return `Supercell would exceed the ${limits.max_atoms} atom budget.`;
    }
    return null;
  }, [limits, supercell]);

  return (
    <div className="cryst-viewer">
      <StructureControls
        structure={structure}
        supercell={supercell}
        limits={limits}
        samples={samples}
        fileInputRef={fileInputRef}
        onUploadFile={onUploadFile}
        onLoadSample={(sampleId?: string) => {
          setPlanes(DEFAULT_PLANES);
          setDirections(DEFAULT_DIRECTIONS);
          onLoadSample(sampleId);
        }}
        onSupercellChange={onSupercellChange}
        onSendToXrd={onSendToXrd}
        onSendToTem={onSendToTem}
      />

      <div className="cryst-viewer__center">
        <header className="cryst-panel__header">
          <div>
            <p className="eyebrow">Crystal Viewer</p>
            <h2>Interactive lattice</h2>
            <p className="muted">Orbit, pan, and zoom. Planes and arrows update instantly.</p>
          </div>
          <div className="cryst-actions">
            <button className="btn btn--subtle" type="button" onClick={() => setCanvasKey((key) => key + 1)}>
              Reset camera
            </button>
          </div>
        </header>
        <CrystalCanvas
          structure={structure}
          supercell={supercell}
          planes={planes}
          directions={directions}
          settings={settings}
          elementRadii={elementRadii}
          canvasKey={canvasKey}
          elementOverrides={elementOverrides}
        />
        {limitWarning ? <div className="cryst-warning">{limitWarning}</div> : null}
      </div>

      <PlaneDirectionControls
        planes={planes}
        directions={directions}
        isHexagonal={structure?.is_hexagonal ?? false}
        elements={(structure?.basis || []).map((site) => site.element)}
        settings={settings}
        elementOverrides={elementOverrides}
        onElementOverridesChange={setElementOverrides}
        onPlanesChange={setPlanes}
        onDirectionsChange={setDirections}
        onSettingsChange={(partial) => setSettings((current) => ({ ...current, ...partial }))}
      />
    </div>
  );
}

export default CrystalViewerTab;
