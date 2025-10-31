import { useCallback, useMemo, useState } from "react";

type SettingsState<T> = {
  settings: T;
  updateSetting: (key: keyof T, value: T[keyof T]) => void;
  resetSettings: () => void;
};

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) {
      return fallback;
    }
    const parsed = JSON.parse(stored) as Partial<T>;
    return { ...fallback, ...parsed };
  } catch (error) {
    return fallback;
  }
}

export function useToolSettings<T extends Record<string, unknown>>(slug: string, defaults: T): SettingsState<T> {
  const storageKey = useMemo(() => `ml-server-settings:${slug}`, [slug]);
  const [settings, setSettings] = useState<T>(() => readStorage(storageKey, defaults));

  const persist = useCallback(
    (next: T) => {
      setSettings(next);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch (error) {
          // Ignore storage quota issues in restricted environments
        }
      }
    },
    [storageKey],
  );

  const updateSetting = useCallback(
    (key: keyof T, value: T[keyof T]) => {
      persist({ ...settings, [key]: value });
    },
    [persist, settings],
  );

  const resetSettings = useCallback(() => {
    persist({ ...defaults });
  }, [defaults, persist]);

  return { settings, updateSetting, resetSettings };
}
