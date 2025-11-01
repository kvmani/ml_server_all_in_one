import { expect, test } from "@playwright/test";
import {
  STATIC_BASE,
  UNIT_CONVERT_RESPONSE,
  UNIT_EXPRESSION_RESPONSE,
  attachJSON,
} from "./support/testData";

test.describe("Unit converter", () => {
  test("runs direct conversions and evaluates expressions", async ({ page }, testInfo) => {
    await page.route("**/api/unit_converter/convert", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...UNIT_CONVERT_RESPONSE,
        }),
      });
    });

    await page.route("**/api/unit_converter/expressions", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...UNIT_EXPRESSION_RESPONSE,
        }),
      });
    });

    await page.goto(`${STATIC_BASE}/unit_converter/`);

    await page.fill("#value", "0");
    await page.selectOption("#from-unit", "degC");
    await page.selectOption("#to-unit", "K");
    await page.getByRole("button", { name: "Convert value" }).click();

    await expect(page.locator("#converter-output"))
      .toBeVisible();
    await expect(page.locator("#result")).toContainText("degC = 273.15 K");

    await page.fill("#expression", "8.314 J/mol*K to kJ/(kmol*K)");
    await page.getByRole("button", { name: "Evaluate expression" }).click();
    await expect(page.locator("#expression-result")).toContainText("8.314");

    const summary = {
      conversionStatus: await page.locator("#converter-form .status-text").first().textContent(),
      expressionStatus: await page.locator("#expression-form .status-text").first().textContent(),
      resultText: await page.locator("#result").textContent(),
      expressionText: await page.locator("#expression-result").textContent(),
    };
    await attachJSON(testInfo, "unit-converter-summary", summary);
  });
});
