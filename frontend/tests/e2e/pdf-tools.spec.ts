import { expect, test } from "@playwright/test";
import {
  PDF_METADATA,
  PDF_SPLIT_PAGES,
  SAMPLE_PDF_BUFFER,
  STATIC_BASE,
  attachJSON,
} from "./support/testData";

test.describe("PDF toolkit workflows", () => {
  test("queues files, merges them, and prepares split downloads", async ({ page }, testInfo) => {
    await page.route("**/pdf_tools/api/v1/metadata", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify(PDF_METADATA),
        headers: { "content-type": "application/json" },
      });
    });

    await page.route("**/pdf_tools/api/v1/merge", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": "attachment; filename=\"combined.pdf\"",
        },
        body: SAMPLE_PDF_BUFFER,
      });
    });

    await page.route("**/pdf_tools/api/v1/split", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pages: PDF_SPLIT_PAGES }),
      });
    });

    await page.goto(`${STATIC_BASE}/pdf_tools/`);

    await page.setInputFiles("#merge-picker", {
      name: "alpha.pdf",
      mimeType: "application/pdf",
      buffer: SAMPLE_PDF_BUFFER,
    });

    const entry = page.locator(".merge-entry");
    await expect(entry).toHaveCount(1);
    await expect(entry.getByText("alpha.pdf")).toBeVisible();
    await expect(entry.locator("[data-state='ready']")).toBeVisible();

    await entry.getByRole("button", { name: "Preview" }).click();
    await expect(entry.locator(".merge-entry__preview")).toBeVisible();

    const mergeDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Merge selected" }).click();
    const merged = await mergeDownload;
    await expect(merged.suggestedFilename()).toBe("combined.pdf");
    await merged.delete();

    await page.setInputFiles("#split-file", {
      name: "single.pdf",
      mimeType: "application/pdf",
      buffer: SAMPLE_PDF_BUFFER,
    });

    await page.locator("#split-form").evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(page.locator("#split-results")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download page 1" })).toBeVisible();

    const splitDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download page 1" }).click();
    const splitFile = await splitDownload;
    await expect(splitFile.suggestedFilename()).toContain("page-1");
    await splitFile.delete();

    const statusSummary = {
      mergeStatus: await page.locator("#merge-form .status-text").first().textContent(),
      splitStatus: await page.locator("#split-form .status-text").first().textContent(),
      queuedFiles: await entry.count(),
      splitDownloads: await page.locator("#split-results li").count(),
    };
    await attachJSON(testInfo, "pdf-workflow-summary", statusSummary);
  });
});
