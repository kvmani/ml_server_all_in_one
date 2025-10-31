import { useEffect, useRef } from "react";
import { useLoading } from "../contexts/LoadingContext";

export function LoadingOverlay() {
  const { isLoading } = useLoading();
  const labelRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (!isLoading) {
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (labelRef.current) {
      labelRef.current.focus({ preventScroll: true });
    }
    return () => {
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [isLoading]);

  return (
    <div className={`loading-overlay${isLoading ? " is-active" : ""}`} aria-hidden={!isLoading}>
      <div className="loading-overlay__panel" role="status" aria-live="assertive" aria-busy={isLoading}>
        <div className="loading-overlay__spinner" aria-hidden="true" />
        <p className="loading-overlay__label" tabIndex={-1} ref={labelRef}>
          Working… Please wait.
        </p>
      </div>
    </div>
  );
}
