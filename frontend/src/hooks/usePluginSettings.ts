import { useAppContext } from "../contexts/AppContext";

export function usePluginSettings<T = Record<string, unknown>>(slug: string, fallback?: T): T {
  const { pluginSettings } = useAppContext();
  const settings = (pluginSettings?.[slug] as T | undefined) ?? fallback;
  return settings ?? ({} as T);
}
