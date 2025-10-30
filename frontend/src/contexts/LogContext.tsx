import { createContext, useContext, useMemo, useState } from "react";
import type { StatusLevel } from "../types";

type LogEntry = {
  id: number;
  timestamp: string;
  message: string;
  level: StatusLevel | "info";
  context?: string;
};

type LogContextValue = {
  entries: LogEntry[];
  push: (message: string, level?: StatusLevel | "info", context?: string) => void;
  clear: () => void;
};

const LogContext = createContext<LogContextValue | null>(null);

let idCounter = 0;

export function useLog(): LogContextValue {
  const value = useContext(LogContext);
  if (!value) {
    throw new Error("LogContext is unavailable");
  }
  return value;
}

export function LogProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  const value = useMemo<LogContextValue>(() => ({
    entries,
    push(message, level = "info", context) {
      const trimmed = (message ?? "").toString().trim();
      if (!trimmed) {
        return;
      }
      const entry: LogEntry = {
        id: idCounter += 1,
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        message: trimmed,
        level,
        context,
      };
      setEntries((prev) => {
        const next = [...prev, entry];
        if (next.length > 50) {
          next.shift();
        }
        return next;
      });
    },
    clear() {
      setEntries([]);
    },
  }), [entries]);

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}
