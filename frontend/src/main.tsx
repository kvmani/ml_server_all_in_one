import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppContext, normaliseInitialState } from "./contexts/AppContext";
import { LoadingProvider } from "./contexts/LoadingContext";
import { LogProvider } from "./contexts/LogContext";
import type { InitialState } from "./types";
import "./styles/core.css";

function getInitialState(): InitialState {
  const script = document.getElementById("app-state");
  if (!script?.textContent) {
    throw new Error("Missing initial application state");
  }
  const raw = JSON.parse(script.textContent) as InitialState;
  return normaliseInitialState(raw);
}

const initial = getInitialState();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing root element");
}

const root = ReactDOM.createRoot(container);

function AppWrapper() {
  const [currentTheme, setCurrentTheme] = React.useState(initial.currentTheme);

  return (
    <AppContext.Provider
      value={{
        currentTheme,
        defaultTheme: initial.defaultTheme,
        themeOptions: initial.themeOptions,
        manifests: initial.manifests,
        siteSettings: initial.siteSettings,
        pluginSettings: initial.pluginSettings,
        setTheme: setCurrentTheme,
      }}
    >
      <LoadingProvider>
        <LogProvider>
          <App />
        </LogProvider>
      </LoadingProvider>
    </AppContext.Provider>
  );
}

root.render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>,
);
