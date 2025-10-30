import { expect, test } from "@playwright/test";
import { SEGMENTATION_RESPONSE, STATIC_BASE, TINY_PNG_BASE64, attachJSON } from "./support/testData";

test.describe("Hydride segmentation workstation", () => {
  test("accepts microscopy images, runs segmentation, and stores history", async ({ page }, testInfo) => {
    await page.route("**/hydride_segmentation/api/v1/segment", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(SEGMENTATION_RESPONSE),
      });
    });

    await page.goto(`${STATIC_BASE}/hydride_segmentation/`);

    await page.setInputFiles("#image", {
      name: "sample.png",
      mimeType: "image/png",
      buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
    });

    await page.selectOption("#model", "ml");
    await expect(page.locator("#crop-enabled")).toBeDisabled();
    await page.selectOption("#model", "conventional");
    await expect(page.locator("#crop-enabled")).toBeEnabled();

    const runSegmentation = async () => {
      const responsePromise = page.waitForResponse("**/hydride_segmentation/api/v1/segment");
      await page.getByRole("button", { name: "Run segmentation" }).click();
      await responsePromise;
      await expect(page.locator("#results")).toBeVisible();
      await expect(page.locator("#metric-count")).toHaveText("42");
    };

    await runSegmentation();
    await page.locator("#brightness").fill("10");
    await runSegmentation();

    await expect(page.locator("#history-status")).toContainText("Result 2 of 2");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download mask" }).click();
    const mask = await download;
    await expect(mask.suggestedFilename()).toContain("mask");
    await mask.delete();

    const summary = {
      statusText: await page.locator("#segment-form .status-text").first().textContent(),
      history: await page.locator("#history-status").textContent(),
      metrics: {
        fraction: await page.locator("#metric-area").textContent(),
        count: await page.locator("#metric-count").textContent(),
      },
    };
    await attachJSON(testInfo, "hydride-segmentation-summary", summary);
  });
});
