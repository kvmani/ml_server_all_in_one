import { expect, test } from "@playwright/test";
import { STATIC_BASE, attachJSON } from "./support/testData";

test.describe("Home page discovery", () => {
  test("filters catalogue, updates preview, and keeps navigation accessible", async ({ page }, testInfo) => {
    await page.goto(`${STATIC_BASE}/`);

    await expect(page.getByRole("heading", { name: "Consistent offline ML experiences" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toContainText("PDF toolkit workspace");

    const cards = page.locator("[data-tool-card]");
    await expect(cards).toHaveCount(7);

    await page.locator("[data-tool-search]").fill("hydride");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Hydride segmentation workstation");

    await page.locator("[data-tool-search]").fill("");
    await page.locator("button[data-tool-category='Document Utilities']").click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("PDF toolkit workspace");

    await page.locator("button[data-tool-category='all']").click();
    await expect(cards).toHaveCount(7);

    await cards.filter({ hasText: "Tabular ML studio" }).getByRole("button", { name: "Quick view" }).click();
    const preview = page.locator("[data-tool-preview-title]");
    await expect(preview).toHaveText("Tabular ML studio");

    const attachData = {
      totalCards: await cards.count(),
      previewTitle: await preview.textContent(),
      activeCategory: await page.locator("[data-tool-category][aria-pressed='true']").getAttribute("data-tool-category"),
      searchValue: await page.locator("[data-tool-search]").inputValue(),
    };
    await attachJSON(testInfo, "home-discovery-summary", attachData);
  });
});
