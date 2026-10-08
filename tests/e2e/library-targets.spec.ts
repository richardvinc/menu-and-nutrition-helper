import { expect, test } from "@playwright/test";

test.describe("Library and next-week targets", () => {
  test("desktop: find an ingredient by alias and save a reusable menu", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.getByText("Library", { exact: true }).first().click();

    await page.getByRole("tab", { name: "Ingredient catalog" }).click();
    await expect(page.getByRole("tab", { name: "Ingredient catalog" })).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.getByRole("tab", { name: "Saved menus" })).toHaveCSS("color", "rgb(57, 42, 112)");
    await page.getByRole("searchbox", { name: "Search ingredients and aliases" }).fill("ayam");
    await expect(page.getByRole("heading", { name: /chicken/i })).toBeVisible();

    await page.getByRole("tab", { name: "Saved menus" }).click();
    await page.getByRole("button", { name: "New saved menu" }).click();
    await page.getByLabel("Menu name").fill("Test ayam lunch");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByLabel("Ingredient 1", { exact: true }).selectOption({ label: "Chicken breast" });
    await page.getByLabel("Quantity 1").fill("150");
    await page.getByRole("button", { name: "Save menu" }).click();
    const saved = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Test ayam lunch" }) }).first();
    await expect(saved).toBeVisible();
    await expect(saved.getByText("Chicken breast · 150 g")).toBeVisible();
  });

  test("desktop: target changes stay staged until the single Apply action", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.locator(".app-header").getByRole("button", { name: "Targets" }).click();

    const weight = page.getByLabel("Weight check-in for next Monday (kg)");
    const activity = page.getByLabel("Activity level");
    expect(await weight.evaluate(element => element.getBoundingClientRect().height)).toBe(await activity.evaluate(element => element.getBoundingClientRect().height));
    const startingWeight = Number(await weight.inputValue());
    await weight.fill(String(startingWeight + 1));
    await page.getByRole("button", { name: "Preview next week" }).click();
    await expect(page.getByRole("table", { name: "Current versus proposed next-week targets" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply next-week targets" })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: /week of/i })).toBeVisible();

    await page.getByRole("button", { name: "Close preview" }).click();
    await expect(page.getByRole("table", { name: "Current versus proposed next-week targets" })).toHaveCount(0);
    await expect(weight).toHaveValue(String(startingWeight));
  });

  test("390px: advanced settings disclose on demand and reviewed targets apply once", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.locator(".app-mobile-nav").getByRole("button", { name: "Targets" }).click();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const advanced = page.getByText("Advanced settings", { exact: true });
    await expect(advanced).toBeVisible();
    await page.getByText("Advanced settings", { exact: true }).click();
    await expect(page.getByLabel("Weekend reserve (kcal/week)")).toBeVisible();
    await page.getByLabel("Activity level").selectOption("custom");
    await expect(page.getByLabel("Custom activity factor")).toBeVisible();
    await page.getByLabel("Activity level").selectOption("active");
    await expect(page.getByLabel("Custom activity factor")).toHaveCount(0);

    await page.getByRole("button", { name: "Preview next week" }).click();
    await expect(page.getByRole("table", { name: "Current versus proposed next-week targets" })).toBeVisible();
    const apply = page.getByRole("button", { name: "Apply next-week targets" });
    await expect(apply).toBeVisible();
    await apply.click();
    await expect(page.getByRole("table", { name: "Current versus proposed next-week targets" })).toHaveCount(0);
  });
});
