import { expect, test } from "@playwright/test";
import { STATIC_BASE } from "../e2e/support/testData";

const SESSION_ID = "session-e2e";
const RUN_ID = "run-e2e";

const CONFIG_RESPONSE = {
  upload: { max_mb: 5, max_files: 1, max_columns: 64, max_rows: 5000 },
};

const DATASET_LIST = {
  datasets: [
    { key: "titanic", name: "Titanic (full)", rows: 891, cols: 12, license: "CC" },
    { key: "adult", name: "Adult Income", rows: 48842, cols: 15, license: "UCI" },
  ],
};

const DATASET_PREVIEW = {
  session_id: SESSION_ID,
  head: [
    { PassengerId: 1, Survived: 0, Pclass: 3, Name: "Allen, Miss. Elisabeth Walton", Age: 29.0 },
    { PassengerId: 2, Survived: 1, Pclass: 1, Name: "Allison, Master. Hudson Trevor", Age: 0.92 },
    { PassengerId: 3, Survived: 1, Pclass: 3, Name: "Beesley, Mr. Lawrence", Age: 34.0 },
  ],
  dtypes: { PassengerId: "int64", Survived: "int64", Pclass: "int64", Name: "object", Age: "float64" },
  columns: [
    { name: "PassengerId", dtype: "int64", missing: 0, is_numeric: true },
    { name: "Survived", dtype: "int64", missing: 0, is_numeric: true },
    { name: "Pclass", dtype: "int64", missing: 0, is_numeric: true },
    { name: "Name", dtype: "object", missing: 0, is_numeric: false },
    { name: "Age", dtype: "float64", missing: 177, is_numeric: true },
  ],
  shape: [891, 12] as [number, number],
};

const PREPROCESS_SUMMARY = {
  summary: {
    target: "Survived",
    task: "classification" as const,
    rows: { train: 623, test: 268 },
    numeric_columns: ["PassengerId", "Pclass", "Age"],
    categorical_columns: ["Name"],
  },
  columns: ["PassengerId", "Pclass", "Age", "Name"],
};

const OUTLIER_REPORT = {
  mask_stats: { total_rows: 891, outlier_rows: 24, kept_rows: 867 },
  indices_removed: [5, 17, 82],
};

const HISTOGRAM = {
  column: "Age",
  bins: 20,
  counts: Array.from({ length: 20 }, (_, index) => 10 + (index % 5)),
  bin_edges: Array.from({ length: 21 }, (_, index) => index * 4),
  centres: Array.from({ length: 20 }, (_, index) => index * 4 + 2),
  kde: {
    x: Array.from({ length: 50 }, (_, index) => index * 2),
    y: Array.from({ length: 50 }, (_, index) => Number((0.4 + index * 0.01).toFixed(3))),
  },
};

const TRAIN_RESULT = {
  run_id: RUN_ID,
  model_summary: {
    task: "classification" as const,
    target: "Survived",
    algorithm: "rf" as const,
    metrics: { accuracy: 0.832, f1: 0.814 },
    feature_importances: { Pclass: 0.32, Age: 0.28, PassengerId: 0.2, Name: 0.2 },
  },
  feature_importances: { Pclass: 0.32, Age: 0.28, PassengerId: 0.2, Name: 0.2 },
};

const EVAL_RESULT = {
  metrics: { accuracy: 0.81, precision: 0.79, recall: 0.77 },
  model: { task: "classification", target: "Survived", algorithm: "rf" },
  curves: {
    roc: { fpr: [0, 0.1, 0.2, 1], tpr: [0, 0.7, 0.85, 1] },
    pr: { precision: [1, 0.84, 0.78], recall: [0, 0.6, 1] },
  },
  feature_importances: TRAIN_RESULT.feature_importances,
};

async function waitForToast(page) {
  await page.waitForTimeout(300); // allow UI animations
}

test.describe("Enhanced Tabular ML", () => {
  test("loads Titanic, preprocesses, visualises, and trains", async ({ page }) => {
    await page.route("**/api/tabular_ml/system/config", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ success: true, data: CONFIG_RESPONSE }),
      });
    });

    await page.route("**/api/tabular_ml/datasets/list", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ success: true, data: DATASET_LIST }),
      });
    });

    await page.route("**/api/tabular_ml/datasets/load", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ success: true, data: DATASET_PREVIEW }),
      });
    });

    await page.route("**/api/tabular_ml/preprocess/fit_apply", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ success: true, data: PREPROCESS_SUMMARY }),
      });
    });

    await page.route("**/api/tabular_ml/outliers/compute", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ success: true, data: OUTLIER_REPORT }),
      });
    });

    await page.route("**/api/tabular_ml/viz/histogram", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ success: true, data: HISTOGRAM }),
      });
    });

    await page.route("**/api/tabular_ml/model/train", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ success: true, data: TRAIN_RESULT }),
      });
    });

    await page.route("**/api/tabular_ml/model/evaluate*", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ success: true, data: EVAL_RESULT }),
      });
    });

    await page.goto(`${STATIC_BASE}/`);
    await page.getByRole("link", { name: "Tabular ML studio" }).click();

    await expect(page.getByRole("heading", { name: "Dataset" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
    await expect(page.locator(".preview-table tbody tr").first()).toBeVisible();

    await page.getByRole("button", { name: "Fit preprocessing" }).click();
    await expect(page.getByText("Task", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Compute mask" }).click();
    await expect(page.getByRole("heading", { name: "Outliers" })).toBeVisible();

    const histogramForm = page.locator("form", { hasText: "Histogram" });
    await histogramForm.scrollIntoViewIfNeeded();
    await histogramForm.getByRole("combobox", { name: "Column" }).selectOption("Age");
    await histogramForm.getByRole("button", { name: "Render histogram" }).click();
    await expect(histogramForm.locator(".chart-panel")).toBeVisible();

    await page.getByRole("button", { name: "Train model" }).click();
    await expect(page.getByText("Model summary")).toBeVisible();

    await page.getByRole("button", { name: "Refresh metrics" }).click();
    await waitForToast(page);
    await expect(page.getByText("Evaluate")).toBeVisible();
    await expect(page.locator(".tabular-metrics dd").first()).toBeVisible();
  });
});
