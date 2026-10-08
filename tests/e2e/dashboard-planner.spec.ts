import { expect, test } from "@playwright/test";

test("dashboard shows today's meals, preparation, and a weekly menu", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Meals on the plan" })).toBeVisible();
  await expect(page.locator(".pk-meals").getByText("Sesame chicken bowl")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ingredient list" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly menu" })).toBeVisible();
  await expect(page.locator(".pk-week-summary__grid > section")).toHaveCount(7);
});

test("meal quantity changes update nutrition before save", async ({ page }) => {
  await page.goto("/");
  await page.locator(".pk-meals").getByText("Sesame chicken bowl").click();
  await page.getByRole("button", { name: "Edit scheduled meal" }).click();
  await expect(page.getByRole("heading", { name: "Nutrition in this meal" })).toBeVisible();
  const quantity = page.getByRole("spinbutton", { name: "Ingredient quantity" }).first();
  const before = await page.locator(".pk-editor__calories strong").textContent();
  await quantity.fill("160");
  await expect(page.locator(".pk-editor__calories strong")).not.toHaveText(before ?? "");
  await page.getByRole("button", { name: /Cancel/ }).last().click();
});

test("390px weekly planner uses a selected-day agenda without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Weekly planning board" })).toBeVisible();
  await expect(page.locator(".pk-pocket")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator(".pk-week__day-strip button").nth(3).click();
  await expect(page.getByRole("heading", { name: /Thursday/ })).toBeVisible();
  await expect(page.locator(".pk-pocket").getByText("Sesame chicken bowl")).toBeVisible();
});
