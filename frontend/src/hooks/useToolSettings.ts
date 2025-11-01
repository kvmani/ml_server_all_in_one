import { useCallback, useEffect, useRef, useState } from "react";

type SettingsState<T> = {
  settings: T;
  updateSetting: (key: keyof T, value: T[keyof T]) => void;
  resetSettings: () => void;
};

export function useToolSettings<T extends Record<string, unknown>>(_slug: string, defaults: T): SettingsState<T> {
  const defaultsRef = useRef(defaults);
  const [settings, setSettings] = useState<T>(() => ({ ...defaults }));

  useEffect(() => {
    const previous = defaultsRef.current;
    const next = defaults;
    const keys = new Set<keyof T>([
      ...(Object.keys(previous) as Array<keyof T>),
      ...(Object.keys(next) as Array<keyof T>),
    ]);
    let changed = false;
    for (const key of keys) {
      if (previous[key] !== next[key]) {
        changed = true;
        break;
      }
    }
    if (changed) {
      defaultsRef.current = next;
      setSettings((current) => ({ ...next, ...current }));
    }
  }, [defaults]);

  const updateSetting = useCallback(
    (key: keyof T, value: T[keyof T]) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const resetSettings = useCallback(() => {
    setSettings({ ...defaultsRef.current });
  }, []);

  return { settings, updateSetting, resetSettings };
}
