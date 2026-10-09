import { expect, test } from "@playwright/test";

test.describe("Library and next-week targets", () => {
	test("non-editing library cards keep usable content width at 872px", async ({ page }) => {
		await page.setViewportSize({ width: 872, height: 1300 });
		await page.goto("/");
		await page.locator(".app-header").getByRole("button", { name: "Library" }).click();
		const card = page.locator(".library-card:not(.is-editing)").first();
		const contentWidth = await card.locator(":scope > div").first().evaluate((element) => element.getBoundingClientRect().width);
		expect(contentWidth).toBeGreaterThan(250);
	});

	test("USDA ingredient choices show per-100g nutrition before selection", async ({ page }) => {
		await page.route("**/api/ai/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ recommendations: false, ingredientLookup: true }) }));
		await page.route("**/api/ai/ingredient-lookup", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ query: "rice white long grain regular cooked", aliases: ["nasi"], matches: [{ fdcId: 168878, description: "Rice, white, long-grain, regular, cooked", dataType: "SR Legacy", source: "USDA FoodData Central SR Legacy, FDC 168878 (https://fdc.nal.usda.gov/food-details/168878/nutrients)", nutrition: { calories: 130, protein: 2.69, carbs: 28.17, fat: 0.28, fiber: 0.4 } }] }) }));
		await page.goto("/");
		await page.locator(".app-header").getByRole("button", { name: "Library" }).click();
		await page.getByRole("tab", { name: "Ingredient catalog" }).click();
		await page.getByRole("button", { name: "New ingredient" }).click();
		await page.getByLabel("Primary ingredient name").fill("jasmine rice");
		await page.getByRole("button", { name: "Find nutrition with AI" }).click();
		await expect(page.getByRole("button", { name: /Rice, white, long-grain, regular, cooked · SR Legacy · per 100 g: 130 kcal, protein 2.69 g, carbs 28.17 g, fat 0.28 g, fiber 0.4 g/ })).toBeVisible();
	});

	test("existing library edits expand in place and untouched cancel is immediate", async ({ page }) => {
		let dialogs = 0;
		let discardAction: "accept" | "dismiss" = "accept";
		page.on("dialog", async (dialog) => { dialogs++; if (discardAction === "dismiss") await dialog.dismiss(); else await dialog.accept(); });
		await page.goto("/");
		await page.locator(".app-header").getByRole("button", { name: "Library" }).click();
		const menu = page.locator(".library-card").first();
		await menu.getByRole("button", { name: "Edit" }).click();
		await expect(menu.locator("form.library-editor")).toBeVisible();
		await page.getByRole("searchbox", { name: "Search saved menus" }).fill("no such menu");
		await expect(menu).toBeVisible();
		await menu.locator("form").getByRole("button", { name: "Cancel" }).click();
		await expect(menu.locator("form")).toHaveCount(0);
		await page.getByRole("searchbox", { name: "Search saved menus" }).fill("");
		await menu.getByRole("button", { name: "Edit" }).click();
		await menu.getByLabel("Menu name").fill("Unsaved tab-switch edit");
		discardAction = "dismiss";
		await page.getByRole("tab", { name: "Ingredient catalog" }).click();
		await expect(page.getByRole("tab", { name: "Saved menus" })).toHaveAttribute("aria-selected", "true");
		await expect(menu.locator("form.library-editor")).toBeVisible();
		discardAction = "accept";
		await page.getByRole("tab", { name: "Ingredient catalog" }).click();
		await expect(page.getByRole("tab", { name: "Ingredient catalog" })).toHaveAttribute("aria-selected", "true");
		await expect(menu.locator("form")).toHaveCount(0);
		await page.getByRole("tab", { name: "Saved menus" }).click();
		await page.getByRole("searchbox", { name: "Search saved menus" }).fill("");
		await expect(menu.locator("form")).toHaveCount(0);
		const ingredient = page.locator(".library-card").first();
		await ingredient.getByRole("button", { name: "Edit" }).click();
		await expect(ingredient.locator("form.library-editor")).toBeVisible();
		await ingredient.locator("form").getByRole("button", { name: "Cancel" }).click();
		await expect(ingredient.locator("form")).toHaveCount(0);
		expect(dialogs).toBe(2);
	});

	test("desktop: find an ingredient by alias and save a reusable menu", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto("/");
		await page.getByText("Library", { exact: true }).first().click();

		await page.getByRole("tab", { name: "Ingredient catalog" }).click();
		await expect(
			page.getByRole("tab", { name: "Ingredient catalog" }),
		).toHaveCSS("color", "rgb(255, 255, 255)");
		const activeColor = await page
			.getByRole("tab", { name: "Ingredient catalog" })
			.evaluate((element) => getComputedStyle(element).color);
		const inactiveColor = await page
			.getByRole("tab", { name: "Saved menus" })
			.evaluate((element) => getComputedStyle(element).color);
		expect(inactiveColor).not.toBe(activeColor);
		await page
			.getByRole("searchbox", { name: "Search ingredients and aliases" })
			.fill("ayam");
		await expect(
			page.getByRole("heading", { name: "Dada ayam tanpa kulit" }),
		).toBeVisible();

		await page.getByRole("tab", { name: "Saved menus" }).click();
		await page.getByRole("button", { name: "New saved menu" }).click();
		await page.getByLabel("Menu name").fill("Test ayam lunch");
		await page.getByRole("button", { name: "Add ingredient" }).click();
		await page
			.getByLabel("Ingredient 1", { exact: true })
			.selectOption({ label: "Dada ayam tanpa kulit" });
		await page.getByLabel("Quantity 1").fill("150");
		const menuRequest = page.waitForRequest(
			(request) =>
				request.url().endsWith("/api/menus") && request.method() === "POST",
		);
		await page.getByRole("button", { name: "Save menu" }).click();
		expect((await menuRequest).postDataJSON()).toMatchObject({
			slot: "lunch",
			memberId: "richard",
		});
		const saved = page
			.getByRole("article")
			.filter({ has: page.getByRole("heading", { name: "Test ayam lunch" }) })
			.first();
		await expect(saved).toBeVisible();
		await expect(saved.locator(".library-card__badge").first()).toHaveText(
			"lunch",
		);
		await expect(saved.getByText("Dada ayam tanpa kulit · 150 g")).toBeVisible();
	});

	test("desktop: target changes stay staged until the single Apply action", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto("/");
		await page
			.locator(".app-header")
			.getByRole("button", { name: "Targets" })
			.click();

		await expect(
			page.getByText("Profile, calculation, guidance, and history"),
		).toHaveCount(0);
		await expect(
			page.getByText("20% deficit · 25% protein · 45% carbohydrate · 30% fat"),
		).toBeVisible();
		await page.getByLabel("Deficit target (%)").fill("10");
		await page.getByRole("button", { name: "Use suggestion" }).click();
		await expect(page.getByLabel("Deficit target (%)")).toHaveValue("20");

		const weight = page.getByLabel("Weight check-in for next Monday (kg)");
		const activity = page.getByLabel("Activity level");
		await expect(
			activity.getByRole("option", { name: "Low active (×1.6)" }),
		).toHaveCount(1);
		expect(
			await weight.evaluate(
				(element) => element.getBoundingClientRect().height,
			),
		).toBe(
			await activity.evaluate(
				(element) => element.getBoundingClientRect().height,
			),
		);
		expect(
			Math.abs(
				(await weight.evaluate(
					(element) => element.getBoundingClientRect().y,
				)) -
					(await activity.evaluate(
						(element) => element.getBoundingClientRect().y,
					)),
			),
		).toBeLessThanOrEqual(1);
		const startingWeight = Number(await weight.inputValue());
		await expect(page.getByLabel("Height (cm)")).toBeVisible();
		await expect(page.getByLabel("Sex used for BMR equation")).toBeVisible();
		await expect(
			page.getByRole("table", { name: "Proposed calorie calculation" }),
		).toBeVisible();
		const initialBmr = await page
			.getByRole("row", { name: /Estimated BMR/ })
			.innerText();
		await weight.fill(String(startingWeight + 1));
		await expect(
			page.getByRole("table", {
				name: "Current versus proposed next-week targets",
			}),
		).toBeVisible();
		await expect(page.getByRole("row", { name: /Estimated BMR/ })).not.toHaveText(
			initialBmr,
		);
		await expect(
			page.getByRole("button", { name: "Apply next-week targets" }),
		).toHaveCount(1);
		const applyToday = page.getByRole("button", {
			name: "Apply starting today",
		});
		await expect(applyToday).toHaveClass(/secondary/);
		page.once("dialog", async (dialog) => {
			expect(dialog.message()).toContain("current week");
			await dialog.dismiss();
		});
		await applyToday.click();
		await expect(page.getByRole("heading", { name: /week of/i })).toBeVisible();

		page.once("dialog", (dialog) => dialog.accept());
		await page.getByRole("button", { name: "Discard changes" }).click();
		await expect(weight).toHaveValue(String(startingWeight));
	});

	test("390px: advanced settings disclose on demand and reviewed targets apply once", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await page
			.locator(".app-mobile-nav")
			.getByRole("button", { name: "Targets" })
			.click();

		expect(
			await page.evaluate(() => document.documentElement.scrollWidth),
		).toBeLessThanOrEqual(390);
		const advanced = page.getByText("Advanced settings", { exact: true });
		await expect(advanced).toBeVisible();
		await expect(page.getByLabel("Weekend reserve (kcal/week)")).toBeVisible();
		await expect(
			page.getByText(
				"A 400 kcal reserve adds 200 kcal to each day when split evenly.",
			),
		).toBeVisible();
		await page.getByLabel("Activity level").selectOption("custom");
		await expect(page.getByLabel("Custom activity factor")).toBeVisible();
		await page.getByLabel("Activity level").selectOption("active");
		await expect(page.getByLabel("Custom activity factor")).toHaveCount(0);

		await expect(
			page.getByRole("table", {
				name: "Current versus proposed next-week targets",
			}),
		).toBeVisible();
		const apply = page.getByRole("button", { name: "Apply next-week targets" });
		await expect(apply).toBeVisible();
		await apply.click();
		await expect(
			page.getByRole("table", {
				name: "Current versus proposed next-week targets",
			}),
		).toHaveCount(0);
	});
});
