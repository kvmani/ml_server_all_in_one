import { useCallback, useState } from "react";
import { useLog } from "../contexts/LogContext";
import type { StatusLevel, StatusState } from "../types";

type Options = {
  context?: string;
};

export function useStatus(initial?: StatusState, options?: Options) {
  const [status, setStatusState] = useState<StatusState | null>(initial ?? null);
  const log = useLog();

  const setStatus = useCallback(
    (message: string, level: StatusLevel = "info") => {
      if (!message) {
        setStatusState(null);
        return;
      }
      const next: StatusState = { message, level };
      setStatusState(next);
      log.push(message, level, options?.context);
    },
    [log, options?.context],
  );

  const resetStatus = useCallback(() => {
    setStatusState(null);
  }, []);

  return { status, setStatus, resetStatus } as const;
}
