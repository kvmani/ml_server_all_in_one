import { useMemo } from "react";
import { elementColor } from "../../utils/elementColors";
import type { ElementOverrides } from "../types";

type Props = {
  elements: string[];
  overrides: ElementOverrides;
  onChange: (next: ElementOverrides) => void;
  onClose: () => void;
};

export function AtomTypeSettings({ elements, overrides, onChange, onClose }: Props) {
  const sortedElements = useMemo(() => elements.slice().sort(), [elements]);

  const updateElement = (element: string, partial: Partial<{ color: string; scale: number }>) => {
    const current = overrides[element] || { color: elementColor(element), scale: 1 };
    const next = { ...current, ...partial };
    onChange({ ...overrides, [element]: next });
  };

  const resetElement = (element: string) => {
    const next = { ...overrides };
    delete next[element];
    onChange(next);
  };

  const resetAll = () => onChange({});

  return (
    <div className="cryst-atom-settings" role="dialog" aria-label="Atom view properties">
      <header className="cryst-atom-settings__header">
        <div>
          <p className="eyebrow">Per-element overrides</p>
          <h3>Atom view properties</h3>
        </div>
        <div className="cryst-actions">
          <button className="btn btn--subtle" type="button" onClick={resetAll}>
            Reset all
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      <div className="cryst-atom-settings__list">
        {sortedElements.map((el) => {
          const override = overrides[el];
          return (
            <div key={el} className="cryst-atom-settings__item">
              <div className="cryst-atom-settings__meta">
                <span className="badge">{el}</span>
                <button className="btn btn--ghost" type="button" onClick={() => resetElement(el)}>
                  Reset
                </button>
              </div>
              <label className="cryst-label">
                Color
                <input
                  type="color"
                  value={override?.color || elementColor(el)}
                  onChange={(event) => updateElement(el, { color: event.target.value })}
                />
              </label>
              <label className="cryst-label">
                Scale
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={override?.scale ?? 1}
                  onChange={(event) => updateElement(el, { scale: Number(event.target.value) })}
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AtomTypeSettings;
