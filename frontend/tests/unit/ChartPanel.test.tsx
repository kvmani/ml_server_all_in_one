import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartPanel } from "../../src/components/ChartPanel";

describe("ChartPanel", () => {
  it("renders placeholder when no data", () => {
    render(<ChartPanel title="Empty chart" data={null} />);
    expect(screen.getByText(/no chart data available yet/i)).toBeInTheDocument();
  });

  it("renders chart with metadata", () => {
    render(
      <ChartPanel
        title="Scatter"
        data={{
          x: [1, 2, 3],
          y: [3, 2, 1],
          labels: ["A", "B", "C"],
          meta: { chartType: "scatter", notes: "demo" },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: /scatter/i })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: /scatter chart/i })).toBeInTheDocument();
    expect(screen.getByText(/notes/i)).toBeInTheDocument();
  });
});
