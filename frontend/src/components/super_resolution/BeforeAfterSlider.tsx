import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

type BeforeAfterSliderProps = {
  beforeSrc: string;
  afterSrc: string;
  position: number;
  onPositionChange: (value: number) => void;
  aspectRatio?: number | null;
  disabled?: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  position,
  onPositionChange,
  aspectRatio,
  disabled = false,
}: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const updateFromPointer = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      if (!rect.width) {
        return;
      }
      const next = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
      onPositionChange(next);
    },
    [onPositionChange],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }
      event.preventDefault();
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      updateFromPointer(event.clientX);
    },
    [disabled, updateFromPointer],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!dragging || disabled) {
        return;
      }
      updateFromPointer(event.clientX);
    },
    [dragging, disabled, updateFromPointer],
  );

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release errors.
    }
  }, [disabled]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPositionChange(clamp(position - 2, 0, 100));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onPositionChange(clamp(position + 2, 0, 100));
      }
    },
    [disabled, onPositionChange, position],
  );

  return (
    <div
      ref={containerRef}
      className={`before-after ${disabled ? "is-disabled" : ""}`}
      style={aspectRatio ? { aspectRatio } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      role="group"
      aria-label="Before and after comparison"
    >
      <img className="before-after__image" src={beforeSrc} alt="Original input" />
      <div
        className="before-after__overlay"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img className="before-after__image" src={afterSrc} alt="Upscaled output" />
      </div>
      <div
        className="before-after__handle"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        aria-orientation="horizontal"
        aria-label="Comparison divider"
        style={{ left: `${position}%` }}
        onKeyDown={handleKeyDown}
      >
        <div className="before-after__line" />
        <span className="before-after__knob" aria-hidden="true">
          {"<>"}
        </span>
      </div>
      <span className="before-after__label before-after__label--left">Original</span>
      <span className="before-after__label before-after__label--right">Upscaled</span>
    </div>
  );
}
