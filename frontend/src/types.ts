export type ThemeOption = {
  key: string;
  label: string;
};

export type PluginManifest = {
  blueprint: string;
  title: string;
  summary: string;
  category: string;
  icon?: string | null;
  tags?: string[];
  docs?: string;
};

export type SiteSettings = {
  name?: string;
  description?: string;
  help_overview?: string;
  themes?: Record<string, { label: string }>;
  default_theme?: string;
};

export type InitialState = {
  page: string;
  currentTheme: string;
  defaultTheme: string;
  themeOptions: Record<string, { label?: string }>;
  siteSettings: SiteSettings;
  manifests: PluginManifest[];
  props: Record<string, unknown>;
};

export type StatusLevel = "info" | "success" | "error" | "warning" | "progress";

export type StatusState = {
  message: string;
  level: StatusLevel;
};
