import { expect, test } from "@playwright/test";
import {
  BATCH_PREVIEW,
  DATASET_PROFILE,
  INFERENCE_RESULT,
  SAMPLE_CSV_BUFFER,
  SCATTER_DATA,
  STATIC_BASE,
  TRAINING_RESULT,
  attachJSON,
} from "./support/testData";


test.describe("Tabular ML studio", () => {
  test("profiles datasets, trains models, and exports predictions", async ({ page }, testInfo) => {
    await page.route("**/api/tabular_ml/datasets", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(DATASET_PROFILE),
      });
    });

    const datasetId = DATASET_PROFILE.dataset_id;

    await page.route(`**/api/tabular_ml/datasets/${datasetId}/scatter`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(SCATTER_DATA),
      });
    });

    await page.route(`**/api/tabular_ml/datasets/${datasetId}/train`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(TRAINING_RESULT),
      });
    });

    const predictionsPattern = new RegExp(
      String.raw`\/api\/tabular_ml\/datasets\/${datasetId}\/predictions(?:\?.*)?$`,
    );
    await page.route(predictionsPattern, async (route) => {
      const url = route.request().url();
      if (url.includes("format=json")) {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rows: TRAINING_RESULT.preview }),
        });
      } else {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "text/csv" },
          body: "temperature,prediction\n350,120.1\n340,118.7\n",
        });
      }
    });

    await page.route(`**/api/tabular_ml/datasets/${datasetId}/predict`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(INFERENCE_RESULT),
      });
    });

    const batchPattern = new RegExp(
      String.raw`\/api\/tabular_ml\/datasets\/${datasetId}\/predict\/batch(?:\?.*)?$`,
    );
    await page.route(batchPattern, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(BATCH_PREVIEW),
        });
      } else {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "text/csv" },
          body: "temperature,prediction\n330,117.9\n360,121.4\n",
        });
      }
    });

    await page.goto(`${STATIC_BASE}/tabular_ml/`);

    await page.setInputFiles("#dataset", {
      name: "microstructure.csv",
      mimeType: "text/csv",
      buffer: SAMPLE_CSV_BUFFER,
    });
    await page.getByRole("button", { name: "Load dataset" }).click();

    await expect(page.locator("#dataset-overview")).toBeVisible();
    await expect(page.locator("#dataset-shape")).toContainText("2 rows");

    await page.selectOption("#scatter-x", "temperature");
    await page.selectOption("#scatter-y", "hardness");
    await page.getByRole("button", { name: "Render scatter" }).click();
    await expect(page.locator("#scatter-caption")).toContainText("temperature vs hardness");

    await page.fill("#target", "hardness");
    await page.getByRole("button", { name: "Train model" }).click();
    await expect(page.locator("#train-results")).toBeVisible();

    await page.locator("#download-predictions").click();
    await expect(page.locator("#train-form .status-text").first()).toContainText("Predictions exported");

    await page.locator("#download-json").click();
    await expect(page.locator("#train-form .status-text").first()).toContainText("Predictions exported");

    await page.fill("#inference-fields input[name='temperature']", "345");
    await page.getByRole("button", { name: "Predict", exact: true }).click();
    await expect(page.locator("#inference-output")).toBeVisible();

    await page.setInputFiles("#batch-file", {
      name: "batch.csv",
      mimeType: "text/csv",
      buffer: SAMPLE_CSV_BUFFER,
    });
    await page.getByRole("button", { name: "Run batch predictions" }).click();
    await expect(page.locator("#batch-results")).toBeVisible();

    await page.locator("#batch-download").click();
    await expect(page.locator("#batch-form .status-text").first()).toContainText("Batch predictions downloaded");

    const summary = {
      datasetStatus: await page.locator("#dataset-form .status-text").first().textContent(),
      scatterStatus: await page.locator("#scatter-form .status-text").first().textContent(),
      trainStatus: await page.locator("#train-form .status-text").first().textContent(),
      inferenceStatus: await page.locator("#inference-form .status-text").first().textContent(),
      batchStatus: await page.locator("#batch-form .status-text").first().textContent(),
      inferenceValue: await page.locator("#inference-value").textContent(),
    };
    await attachJSON(testInfo, "tabular-ml-summary", summary);
  });
});
