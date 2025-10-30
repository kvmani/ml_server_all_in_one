import type { StatusState } from "../types";

export function StatusMessage({ status }: { status: StatusState | null }) {
  if (!status) {
    return <p className="status-text" data-role="status" aria-live="polite"></p>;
  }
  return (
    <p className="status-text" data-role="status" aria-live="polite" data-status={status.level}>
      {status.message}
    </p>
  );
}
