import { ReactNode, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

export type SettingsField = {
  key: string;
  label: string;
  description?: string;
  type: "boolean" | "select" | "number" | "text";
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

type SettingsModalProps = {
  isOpen: boolean;
  title: string;
  description?: string;
  fields: SettingsField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onClose: () => void;
  onReset?: () => void;
  footer?: ReactNode;
};

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function usePortalRoot(id: string) {
  return useMemo(() => {
    let element = document.getElementById(id);
    if (!element) {
      element = document.createElement("div");
      element.setAttribute("id", id);
      document.body.appendChild(element);
    }
    return element;
  }, [id]);
}

export function SettingsModal({
  isOpen,
  title,
  description,
  fields,
  values,
  onChange,
  onClose,
  onReset,
  footer,
}: SettingsModalProps) {
  const portalRoot = usePortalRoot("modal-root");
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) {
          return;
        }
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
        if (!focusable.length) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
      firstFocusable?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const content = (
    <div className="modal-overlay" role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        aria-describedby={description ? "settings-modal-description" : undefined}
        ref={dialogRef}
      >
        <header className="modal__header">
          <h2 id="settings-modal-title" className="modal__title">
            {title}
          </h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </header>
        {description ? (
          <p id="settings-modal-description" className="modal__description">
            {description}
          </p>
        ) : null}
        <form className="modal__form" onSubmit={(event) => event.preventDefault()}>
          {fields.map((field) => {
            const value = values[field.key];
            const fieldId = `settings-${field.key}`;
            switch (field.type) {
              case "boolean":
                return (
                  <label key={field.key} className="modal__field modal__field--switch" htmlFor={fieldId}>
                    <span className="modal__label">{field.label}</span>
                    {field.description ? <span className="modal__hint">{field.description}</span> : null}
                    <div className="switch">
                      <input
                        id={fieldId}
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(event) => onChange(field.key, event.target.checked)}
                      />
                      <span className="switch__decor" aria-hidden="true" />
                    </div>
                  </label>
                );
              case "select":
                return (
                  <label key={field.key} className="modal__field" htmlFor={fieldId}>
                    <span className="modal__label">{field.label}</span>
                    {field.description ? <span className="modal__hint">{field.description}</span> : null}
                    <select
                      id={fieldId}
                      value={String(value ?? "")}
                      onChange={(event) => onChange(field.key, event.target.value)}
                    >
                      {(field.options || []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              case "number":
                return (
                  <label key={field.key} className="modal__field" htmlFor={fieldId}>
                    <span className="modal__label">{field.label}</span>
                    {field.description ? <span className="modal__hint">{field.description}</span> : null}
                    <input
                      id={fieldId}
                      type="number"
                      value={value === undefined || value === null ? "" : String(value)}
                      onChange={(event) => onChange(field.key, event.target.value === "" ? undefined : Number(event.target.value))}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                    />
                  </label>
                );
              case "text":
              default:
                return (
                  <label key={field.key} className="modal__field" htmlFor={fieldId}>
                    <span className="modal__label">{field.label}</span>
                    {field.description ? <span className="modal__hint">{field.description}</span> : null}
                    <input
                      id={fieldId}
                      type="text"
                      value={value === undefined || value === null ? "" : String(value)}
                      placeholder={field.placeholder}
                      onChange={(event) => onChange(field.key, event.target.value)}
                    />
                  </label>
                );
            }
          })}
        </form>
        <footer className="modal__footer">
          {onReset ? (
            <button type="button" className="modal__reset" onClick={onReset}>
              Reset to defaults
            </button>
          ) : null}
          <div className="modal__footer-actions">
            {footer}
            <button type="button" className="modal__close-button" onClick={onClose}>
              Done
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(content, portalRoot);
}
