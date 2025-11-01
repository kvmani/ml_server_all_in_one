import userEvent from "@testing-library/user-event";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppContext, type AppContextValue } from "../../src/contexts/AppContext";
import { LoadingProvider } from "../../src/contexts/LoadingContext";
import { LogProvider } from "../../src/contexts/LogContext";
import TabularMlPage from "../../src/pages/TabularMlPage";

function renderTabularPage(overrides?: Partial<AppContextValue>) {
  const value: AppContextValue = {
    currentTheme: "night",
    defaultTheme: "night",
    themeOptions: {},
    manifests: [],
    siteSettings: { name: "Test", description: "", help_overview: "/help/overview" },
    pluginSettings: {
      tabular_ml: {
        upload: { max_mb: 5 },
        docs: "/help/tabular_ml",
      },
    },
    setTheme: vi.fn(),
    ...(overrides ?? {}),
  } as AppContextValue;

  return render(
    <AppContext.Provider value={value}>
      <LoadingProvider>
        <LogProvider>
          <TabularMlPage />
        </LogProvider>
      </LoadingProvider>
    </AppContext.Provider>,
  );
}

describe("TabularMlPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders dataset upload form", () => {
    renderTabularPage();
    expect(screen.getByRole("heading", { name: /tabular ml sandbox/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /browse csv/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load dataset/i })).toBeInTheDocument();
  });

  it("opens settings modal when requested", async () => {
    const user = userEvent.setup();
    renderTabularPage();
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /settings/i }));
    });
    expect(
      await screen.findByRole("heading", { name: /tabular ml preferences/i }),
    ).toBeInTheDocument();
  });
});
