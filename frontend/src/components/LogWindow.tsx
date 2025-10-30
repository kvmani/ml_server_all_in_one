import { useMemo, useState } from "react";
import { useLog } from "../contexts/LogContext";
import type { StatusLevel } from "../types";

const LEVEL_CLASS: Record<StatusLevel | "info", string> = {
  info: "log-window__entry--info",
  success: "log-window__entry--success",
  error: "log-window__entry--error",
  warning: "log-window__entry--warning",
  progress: "log-window__entry--progress",
};

export function LogWindow() {
  const log = useLog();
  const [isCollapsed, setCollapsed] = useState(true);

  const entries = useMemo(() => log.entries.slice(-50), [log.entries]);

  return (
    <section className="log-window" data-log-window data-state={isCollapsed ? "collapsed" : "open"} aria-label="Activity log">
      <header className="log-window__header">
        <button
          className="log-window__toggle"
          type="button"
          data-log-toggle
          aria-expanded={!isCollapsed}
          onClick={() => setCollapsed((prev) => !prev)}
        >
          <span className="log-window__icon" aria-hidden="true">
            ⌘
          </span>
          <span className="log-window__title">Activity log</span>
        </button>
        <div className="log-window__actions">
          <button
            className="log-window__action"
            type="button"
            data-log-clear
            onClick={() => log.clear()}
            disabled={entries.length === 0}
          >
            Clear
          </button>
        </div>
      </header>
      <ol className="log-window__list" data-log-list>
        {entries.map((entry) => (
          <li key={entry.id} className={["log-window__entry", LEVEL_CLASS[entry.level]].filter(Boolean).join(" ")}>
            <span className="log-window__time">{entry.timestamp}</span>
            <p className="log-window__message">
              {entry.context ? `${entry.context}: ` : ""}
              {entry.message}
            </p>
          </li>
        ))}
      </ol>
      <p className="log-window__empty" data-log-empty hidden={entries.length > 0}>
        No recent activity yet.
      </p>
    </section>
  );
}
