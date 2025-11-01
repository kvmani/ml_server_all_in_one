import { createContext, useContext } from "react";
import type { InitialState, PluginManifest, SiteSettings } from "../types";

export type AppContextValue = {
  currentTheme: string;
  defaultTheme: string;
  themeOptions: Record<string, { label?: string }>;
  manifests: PluginManifest[];
  siteSettings: SiteSettings;
  pluginSettings: Record<string, Record<string, unknown>>;
  setTheme: (theme: string) => void;
};

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("AppContext is unavailable");
  }
  return value;
}

export function normaliseInitialState(state: InitialState): InitialState {
  return {
    ...state,
    manifests: (state.manifests || []).map((manifest) => ({
      ...manifest,
      tags: Array.isArray(manifest.tags) ? manifest.tags : [],
    })),
    pluginSettings: state.pluginSettings || {},
  };
}
