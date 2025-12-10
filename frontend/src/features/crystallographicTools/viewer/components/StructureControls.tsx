import { useCallback } from "react";
import type { StructurePayload, ViewerLimits } from "../../api";
import { clampSupercell, atomCountForSupercell } from "../../utils/crystalMath";

type Props = {
  structure: StructurePayload | null;
  supercell: [number, number, number];
  limits?: ViewerLimits;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onUploadFile: (file?: File) => void;
  onLoadSample: () => void;
  onSupercellChange: (next: [number, number, number]) => void;
  onSendToXrd: () => void;
  onSendToTem: () => void;
};

const latticeFields = [
  { key: "a", label: "a (Å)" },
  { key: "b", label: "b (Å)" },
  { key: "c", label: "c (Å)" },
  { key: "alpha", label: "α (°)" },
  { key: "beta", label: "β (°)" },
  { key: "gamma", label: "γ (°)" },
] as const;

export function StructureControls({
  structure,
  supercell,
  limits,
  fileInputRef,
  onUploadFile,
  onLoadSample,
  onSupercellChange,
  onSendToXrd,
  onSendToTem,
}: Props) {
  const maxAtoms = limits?.max_atoms ?? 500;
  const baseAtoms = limits?.atom_count ?? structure?.num_sites ?? 0;
  const atomCount = atomCountForSupercell(baseAtoms, supercell);
  const maxSupercell = limits?.supercell_max ?? [4, 4, 4];

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        onUploadFile(file);
      }
    },
    [onUploadFile],
  );

  const handleSupercellChange = useCallback(
    (index: number, value: number) => {
      const next = clampSupercell(
        supercell.map((v, idx) => (idx === index ? value : v)),
        maxSupercell,
      );
      onSupercellChange(next);
    },
    [maxSupercell, onSupercellChange, supercell],
  );

  return (
    <div className="cryst-viewer__panel">
      <header className="cryst-panel__header">
        <div>
          <p className="eyebrow">Structure</p>
          <h2>Load CIF or POSCAR</h2>
          <p className="muted">Files stay in-memory; nothing is saved to disk.</p>
        </div>
        <div className="cryst-actions">
          <button className="btn" type="button" onClick={() => fileInputRef.current?.click()}>
            Upload
          </button>
          <button className="btn btn--subtle" type="button" onClick={onLoadSample}>
            Load Fe sample
          </button>
        </div>
      </header>

      <div
        className="cryst-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            fileInputRef.current?.click();
          }
        }}
        aria-label="Upload a CIF or POSCAR by clicking or dropping a file"
      >
        <div>
          <strong>Drop a CIF or POSCAR</strong>
          <p className="muted">Supports .cif, .vasp, POSCAR/CONTCAR.</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".cif,.vasp,.poscar,.txt"
          className="visually-hidden"
          onChange={(event) => onUploadFile(event.target.files?.[0] || undefined)}
        />
      </div>

      <div className="cryst-grid cryst-grid--two">
        <div className="cryst-stack">
          <p className="eyebrow">Supercell</p>
          <div className="cryst-inline-inputs">
            {["n_a", "n_b", "n_c"].map((label, idx) => (
              <input
                key={label}
                type="number"
                min={1}
                max={maxSupercell[idx]}
                value={supercell[idx]}
                onChange={(event) => handleSupercellChange(idx, Number(event.target.value))}
                aria-label={`Supercell ${label}`}
              />
            ))}
          </div>
          <p className={atomCount > maxAtoms ? "cryst-warning" : "muted"}>
            {atomCount} atoms in view (max {maxAtoms}). Limits guard rendering cost.
          </p>
        </div>

        <div className="cryst-stack">
          <p className="eyebrow">Send to simulators</p>
          <div className="cryst-chip-row">
            <button className="cryst-chip" type="button" onClick={onSendToXrd}>
              Send to XRD
            </button>
            <button className="cryst-chip" type="button" onClick={onSendToTem}>
              Send to TEM/SAED
            </button>
          </div>
          {structure?.space_group ? <p className="muted">Space group: {structure.space_group.symbol} #{structure.space_group.number}</p> : null}
        </div>
      </div>

      <div className="cryst-meta">
        <div>
          <p className="eyebrow">Formula</p>
          <p className="cryst-meta__value">{structure?.formula || "—"}</p>
        </div>
        <div>
          <p className="eyebrow">Sites</p>
          <p className="cryst-meta__value">{structure?.num_sites ?? "—"}</p>
        </div>
        <div>
          <p className="eyebrow">System</p>
          <p className="cryst-meta__value">{structure?.crystal_system || (structure?.is_hexagonal ? "hexagonal" : "—")}</p>
        </div>
      </div>

      {structure ? (
        <div className="cryst-lattice-grid">
          {latticeFields.map((field) => (
            <label key={field.key} className="cryst-label">
              {field.label}
              <input value={((structure.lattice as any)[field.key] as number).toFixed(3)} readOnly />
            </label>
          ))}
        </div>
      ) : (
        <p className="muted">Lattice parameters will appear after loading a structure.</p>
      )}
    </div>
  );
}

export default StructureControls;
