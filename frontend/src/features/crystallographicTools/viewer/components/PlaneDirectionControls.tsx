import type { DirectionConfig, PlaneConfig, ViewerSettings } from "../types";

type Props = {
  planes: PlaneConfig[];
  directions: DirectionConfig[];
  isHexagonal: boolean;
  settings: ViewerSettings;
  onPlanesChange: (next: PlaneConfig[]) => void;
  onDirectionsChange: (next: DirectionConfig[]) => void;
  onSettingsChange: (settings: Partial<ViewerSettings>) => void;
  onOpenAtomSettings: () => void;
};

export function PlaneDirectionControls({
  planes,
  directions,
  isHexagonal,
  settings,
  onPlanesChange,
  onDirectionsChange,
  onSettingsChange,
  onOpenAtomSettings,
}: Props) {
  const handlePlaneField = (index: number, key: keyof PlaneConfig, value: number | boolean | string) => {
    const next = planes.map((plane, idx) => (idx === index ? { ...plane, [key]: value } : plane));
    onPlanesChange(next);
  };

  const handleDirectionField = (index: number, key: keyof DirectionConfig, value: number | boolean | string) => {
    const next = directions.map((direction, idx) => (idx === index ? { ...direction, [key]: value } : direction));
    onDirectionsChange(next);
  };

  return (
    <div className="cryst-viewer__panel">
      <header className="cryst-panel__header">
        <div>
          <p className="eyebrow">Geometry</p>
          <h2>Planes & directions</h2>
          <p className="muted">Up to three planes and arrows at once.</p>
        </div>
      </header>

      <div className="cryst-stack">
        <div className="cryst-flex-between">
          <p className="eyebrow">Atoms & layers</p>
          <button className="btn btn--subtle" type="button" onClick={onOpenAtomSettings} aria-label="Open atom view properties">
            ⚙ Atom view properties
          </button>
        </div>
        <div className="cryst-grid">
          <label className="cryst-label">
            Atom color mode
            <select
              value={settings.colorMode}
              onChange={(event) => onSettingsChange({ colorMode: event.target.value as ViewerSettings["colorMode"] })}
            >
              <option value="element">Per element palette</option>
              <option value="single">Single color</option>
            </select>
          </label>
          <label className="cryst-label" aria-live="polite">
            Custom color
            <input
              type="color"
              value={settings.customColor}
              onChange={(event) => onSettingsChange({ customColor: event.target.value })}
              disabled={settings.colorMode !== "single"}
              aria-disabled={settings.colorMode !== "single"}
            />
          </label>
          <label className="cryst-label">
            Atom size scale
            <input
              type="range"
              min={0.4}
              max={1.8}
              step={0.05}
              value={settings.atomScale}
              onChange={(event) => onSettingsChange({ atomScale: Number(event.target.value) })}
            />
          </label>
          <label className="cryst-label">
            Minimum radius (Å, visual)
            <input
              type="range"
              min={0.1}
              max={0.8}
              step={0.02}
              value={settings.minAtomRadius}
              onChange={(event) => onSettingsChange({ minAtomRadius: Number(event.target.value) })}
            />
          </label>
        </div>
        <div className="cryst-chip-row">
          {[
            { key: "showAtoms", label: "Atoms" },
            { key: "showCell", label: "Unit cell" },
            { key: "showSupercell", label: "Supercell" },
            { key: "showPlanes", label: "Planes" },
            { key: "showDirections", label: "Directions" },
            { key: "showAxes", label: "Axes" },
          ].map((toggle) => (
            <label key={toggle.key} className="cryst-chip cryst-chip--toggle">
              <input
                type="checkbox"
                checked={(settings as any)[toggle.key]}
                onChange={(event) => onSettingsChange({ [toggle.key]: event.target.checked } as Partial<ViewerSettings>)}
              />
              {toggle.label}
            </label>
          ))}
        </div>
      </div>

      <div className="cryst-stack">
        <p className="eyebrow">Miller planes</p>
        {planes.map((plane, index) => (
          <div key={plane.id} className="cryst-plane">
            <div className="cryst-inline-inputs">
              {["h", "k", "l"].map((axis) => (
                <input
                  key={`${plane.id}-${axis}`}
                  type="number"
                  value={(plane as any)[axis]}
                  onChange={(event) => handlePlaneField(index, axis as keyof PlaneConfig, Number(event.target.value))}
                  aria-label={`Plane ${axis.toUpperCase()}`}
                />
              ))}
              {isHexagonal ? (
                <input value={-(plane.h + plane.k)} readOnly aria-label="Plane i (derived)" />
              ) : null}
              <input
                type="color"
                aria-label="Plane color"
                value={plane.color}
                onChange={(event) => handlePlaneField(index, "color", event.target.value)}
              />
            </div>
            {isHexagonal ? <p className="muted">(hkli) i = {-(plane.h + plane.k)}</p> : null}
            <div className="cryst-plane__controls">
              <label className="cryst-label">
                Opacity
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={plane.opacity}
                  onChange={(event) => handlePlaneField(index, "opacity", Number(event.target.value))}
                />
              </label>
              <label className="cryst-checkbox">
                <input
                  type="checkbox"
                  checked={plane.visible}
                  onChange={(event) => handlePlaneField(index, "visible", event.target.checked)}
                />
                Show
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="cryst-stack">
        <p className="eyebrow">Directions [uvw]</p>
        {isHexagonal ? <p className="muted">Hexagonal helper: t = -(u+v) is derived for [uvtw]; w stays editable.</p> : null}
        {directions.map((direction, index) => (
          <div key={direction.id} className="cryst-plane">
            <div className="cryst-inline-inputs">
              {["u", "v", "w"].map((axis) => (
                <input
                  key={`${direction.id}-${axis}`}
                  type="number"
                  value={(direction as any)[axis]}
                  onChange={(event) => handleDirectionField(index, axis as keyof DirectionConfig, Number(event.target.value))}
                  aria-label={`Direction ${axis}`}
                />
              ))}
              {isHexagonal ? <input value={-(direction.u + direction.v)} readOnly aria-label="Direction t (derived)" /> : null}
              <input
                type="color"
                aria-label="Direction color"
                value={direction.color}
                onChange={(event) => handleDirectionField(index, "color", event.target.value)}
              />
            </div>
            {isHexagonal ? <p className="muted">t = -(u+v) = {-(direction.u + direction.v)}</p> : null}
            <label className="cryst-checkbox">
              <input
                type="checkbox"
                checked={direction.visible}
                onChange={(event) => handleDirectionField(index, "visible", event.target.checked)}
              />
              Show
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PlaneDirectionControls;
