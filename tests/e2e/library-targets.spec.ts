import { expect, test } from "@playwright/test";

test.describe("Library and next-week targets", () => {
	test("deleting a used ingredient keeps menus and scheduled meals intact", async ({ page }) => {
		const data = await (await page.request.get("/api/data")).json();
		const rice = data.ingredients.find((item: { id: string }) => item.id === "rice");
		if (!rice) throw new Error("seed rice is required for snapshot deletion");
		const menu = {
			id: `snapshot-menu-${Date.now()}`,
			name: "Snapshot menu check",
			slot: "dinner",
			ingredients: [{ ingredientId: rice.id, quantity: 110 }],
		};
		const meal = {
			id: `snapshot-delete-${Date.now()}`,
			date: "2026-10-09",
			slot: "dinner",
			name: "Snapshot deletion check",
			notes: "",
			ingredients: [
				{ ingredientId: rice.id, quantity: 100, memberId: "michelle" },
				{ ingredientId: rice.id, quantity: 200, memberId: "richard" },
			],
		};
		expect((await page.request.post("/api/menus", { data: menu })).status()).toBe(201);
		expect((await page.request.post("/api/meals", { data: meal })).status()).toBe(201);
		try {
			await page.clock.install({ time: new Date(2026, 9, 9, 12) });
			await page.goto("/");
			await page.locator(".app-header").getByRole("button", { name: "Library" }).click();
			const menuCard = page.locator(".library-card").filter({ hasText: menu.name });
			await expect(menuCard).toContainText(`${rice.name} · 110 ${rice.unit}`);
			await page.getByRole("tab", { name: "Ingredient catalog" }).click();
			await page.getByRole("searchbox", { name: "Search ingredients and aliases" }).fill(rice.name);
			const card = page.locator(".library-card").filter({ hasText: rice.name });
			page.once("dialog", (dialog) => dialog.accept());
			await card.getByRole("button", { name: "Delete" }).click();
			await expect(card).toHaveCount(0);
			const afterDelete = await (await page.request.get("/api/data")).json();
			expect(afterDelete.ingredients.some((item: { id: string }) => item.id === rice.id)).toBe(false);
			expect(afterDelete.scheduledMeals.find((item: { id: string }) => item.id === meal.id).ingredients[0].ingredient).toMatchObject({
				id: rice.id,
				name: rice.name,
				unit: rice.unit,
				nutrition: rice.nutrition,
			});
			await page.locator(".app-header").getByRole("button", { name: "Today", exact: true }).click();
			const dashboardMeal = page.locator(".pk-meal-card--dinner").filter({ hasText: meal.name });
			await expect(dashboardMeal).toContainText(rice.name);
			await expect(dashboardMeal).toContainText("100 g");
			await expect(dashboardMeal).toContainText("390 kcal");
			await page.getByRole("button", { name: "Week", exact: true }).click();
			const mealCard = page.locator(".pk-week-meal").filter({ hasText: meal.name });
			await mealCard.getByRole("button", { name: "Edit", exact: true }).click();
			await expect(page.getByLabel("Michelle carbohydrate", { exact: true })).toHaveValue(rice.id);
			await expect(page.getByLabel("Michelle carbohydrate quantity")).toHaveValue("100");
			await page.getByRole("button", { name: "Save scheduled meal" }).click();
			const afterSave = await (await page.request.get("/api/data")).json();
			const savedMeal = afterSave.scheduledMeals.find((item: { id: string }) => item.id === meal.id);
			for (const row of meal.ingredients)
				expect(savedMeal.ingredients.find((item: { memberId: string }) => item.memberId === row.memberId)).toMatchObject({
					...row,
					ingredient: rice,
				});
		} finally {
			await page.request.delete(`/api/meals/${meal.id}`);
			await page.request.delete(`/api/menus/${menu.id}`);
			await page.request.post("/api/ingredients", { data: rice });
		}
	});

	test("non-editing library cards keep usable content width at 872px", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 872, height: 1300 });
		await page.goto("/");
		await page
			.locator(".app-header")
			.getByRole("button", { name: "Library" })
			.click();
		const card = page.locator(".library-card:not(.is-editing)").first();
		const contentWidth = await card
			.locator(":scope > div")
			.first()
			.evaluate((element) => element.getBoundingClientRect().width);
		expect(contentWidth).toBeGreaterThan(250);
	});

	test("USDA ingredient choices show per-100g nutrition before selection", async ({
		page,
	}) => {
		await page.route("**/api/ai/status", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					recommendations: false,
					ingredientLookup: true,
				}),
			}),
		);
		await page.route("**/api/ai/ingredient-lookup", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					query: "rice white long grain regular cooked",
					aliases: ["nasi"],
					matches: [
						{
							fdcId: 168878,
							description: "Rice, white, long-grain, regular, cooked",
							dataType: "SR Legacy",
							source:
								"USDA FoodData Central SR Legacy, FDC 168878 (https://fdc.nal.usda.gov/food-details/168878/nutrients)",
							nutrition: {
								calories: 130,
								protein: 2.69,
								carbs: 28.17,
								fat: 0.28,
								fiber: 0.4,
							},
						},
					],
				}),
			}),
		);
		await page.goto("/");
		await page
			.locator(".app-header")
			.getByRole("button", { name: "Library" })
			.click();
		await page.getByRole("tab", { name: "Ingredient catalog" }).click();
		await page.getByRole("button", { name: "New ingredient" }).click();
		await page.getByLabel("Primary ingredient name").fill("jasmine rice");
		await page.getByRole("button", { name: "Find nutrition with AI" }).click();
		await expect(
			page.getByRole("button", {
				name: /Rice, white, long-grain, regular, cooked · SR Legacy · per 100 g: 130 kcal, protein 2.69 g, carbs 28.17 g, fat 0.28 g, fiber 0.4 g/,
			}),
		).toBeVisible();
	});

	test("new ingredient checks local names and aliases before AI", async ({
		page,
	}) => {
		let lookupCalls = 0;
		let lookupBody: Record<string, unknown> | undefined;
		await page.route("**/api/ai/status", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					recommendations: false,
					ingredientLookup: true,
				}),
			}),
		);
		await page.route("**/api/ai/ingredient-lookup", (route) => {
			lookupCalls++;
			lookupBody = route.request().postDataJSON();
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					query: "tofu",
					aliases: ["tofu"],
					existing: "tofu",
					matches: [
						{
							fdcId: 999,
							description: "Tofu, raw",
							dataType: "Foundation",
							source: "USDA FoodData Central, FDC 999",
							nutrition: {
								calories: 85,
								protein: 9,
								carbs: 2,
								fat: 5,
								fiber: 1,
							},
						},
					],
				}),
			});
		});
		await page.goto("/");
		await page
			.locator(".app-header")
			.getByRole("button", { name: "Library" })
			.click();
		await page.getByRole("tab", { name: "Ingredient catalog" }).click();
		await page.getByRole("button", { name: "New ingredient" }).click();
		await expect(
			page.getByRole("checkbox", {
				name: "Allow this ingredient in macro suggestions",
			}),
		).toBeChecked();
		const name = page.getByLabel("Primary ingredient name");
		const lookup = page.getByRole("button", { name: "Find nutrition with AI" });
		await name.fill("tahu");
		const [nameBox, lookupBox] = await Promise.all([
			name.boundingBox(),
			lookup.boundingBox(),
		]);
		expect(Math.abs(nameBox!.y - lookupBox!.y)).toBeLessThan(10);
		await lookup.click();
		await expect(page.getByRole("status")).toContainText(
			"already in the catalog as “Tahu firm”",
		);
		await expect(
			page.getByRole("button", { name: "Edit Tahu firm" }),
		).toBeVisible();
		const check = page.getByRole("button", { name: "Check with AI" });
		await expect(check).toBeVisible();
		expect(lookupCalls).toBe(0);
		await check.click();
		await expect(page.getByLabel("Nutrition comparison")).toContainText(
			"Current catalog: Tahu firm",
		);
		await expect(page.getByLabel("Nutrition comparison")).toContainText(
			"Tofu, raw",
		);
		await expect(name).toHaveValue("tahu");
		await expect(page.getByLabel("Calories (kcal)")).toHaveValue("0");
		expect(lookupBody).toMatchObject({ name: "tahu", checkExisting: true });
		expect(lookupCalls).toBe(1);
	});

	test("USDA replacement updates the open draft and preserves its quantity basis", async ({
		page,
	}) => {
		const savedIngredients: Record<string, any>[] = [];
		await page.route("**/api/ai/status", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					recommendations: false,
					ingredientLookup: true,
				}),
			}),
		);
		await page.route("**/api/ai/ingredient-lookup", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					query: "pisang",
					aliases: [],
					existing: "banana",
					matches: [
						{
							fdcId: 999,
							description: "Banana, raw",
							dataType: "Foundation",
							source:
								"USDA FoodData Central Foundation, FDC 999 (https://fdc.nal.usda.gov/food-details/999/nutrients)",
							nutrition: {
								calories: 89,
								protein: 1.1,
								carbs: 22.8,
								fat: 0.3,
								fiber: 2.6,
							},
						},
					],
				}),
			}),
		);
		await page.route("**/api/ingredients/banana", async (route) => {
			savedIngredients.push(route.request().postDataJSON());
			await route.continue();
		});
		await page.goto("/");
		await page
			.locator(".app-header")
			.getByRole("button", { name: "Library" })
			.click();
		await page.getByRole("tab", { name: "Ingredient catalog" }).click();
		const banana = page
			.locator(".library-card")
			.filter({ hasText: "Pisang sedang" })
			.first();
		await banana.getByRole("button", { name: "Edit" }).click();
		const editor = page.getByRole("form", { name: "Edit ingredient" });
		await editor.getByLabel("Nutrition basis amount (piece)").fill("2");
		await expect(
			editor.getByLabel("Nutrition basis amount (piece)"),
		).toHaveValue("2");
		await page.getByRole("button", { name: "Find nutrition with AI" }).click();
		await page.getByRole("button", { name: "Check with AI" }).click();
		await page.getByRole("button", { name: "   Use this instead" }).click();
		await expect(page.getByRole("status")).toContainText(
			"Updated Pisang sedang from USDA",
		);
		await expect(editor.getByLabel("Calories (kcal)")).toHaveValue("210.04");
		await expect(editor.getByLabel("Protein (g)")).toHaveValue("2.596");
		await expect(
			editor.getByLabel("Nutrition basis amount (piece)"),
		).toHaveValue("2");
		await expect(editor.getByLabel("Primary ingredient name")).toHaveValue(
			"Pisang sedang",
		);
		expect(savedIngredients[0]).toMatchObject({
			basisAmount: 1,
			nutrition: {
				calories: 105.02,
				protein: 1.298,
				carbs: 26.904,
				fat: 0.354,
				fiber: 3.068,
			},
		});
		await editor.getByRole("button", { name: "Save ingredient" }).click();
		expect(savedIngredients).toHaveLength(2);
		expect(savedIngredients[1]).toMatchObject({
			id: "banana",
			name: "Pisang sedang",
			aliases: ["pisang", "banana"],
			unit: "piece",
			basisAmount: 2,
			equivalentGrams: 118,
			preparation: "Banana, raw",
			source:
				"USDA FoodData Central Foundation, FDC 999 (https://fdc.nal.usda.gov/food-details/999/nutrients)",
			nutrition: {
				calories: 210.04,
				protein: 2.596,
				carbs: 53.808,
				fat: 0.708,
				fiber: 6.136,
			},
		});
		await expect(
			page
				.locator(".library-card")
				.filter({ hasText: "Pisang sedang" })
				.first(),
		).toContainText("210.04 kcal");
	});

	test("USDA portions map to a piece unit and keep its native nutrition basis", async ({
		page,
	}) => {
		await page.route("**/api/ai/status", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					recommendations: false,
					ingredientLookup: true,
				}),
			}),
		);
		await page.route("**/api/data", async (route) => {
			const response = await route.fetch();
			const data = await response.json();
			const banana = data.ingredients.find(
				(item: { id: string }) => item.id === "banana",
			);
			banana.basisAmount = 1;
			delete banana.equivalentGrams;
			await route.fulfill({ response, json: data });
		});
		await page.route("**/api/ai/ingredient-lookup", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					query: "pisang",
					aliases: [],
					existing: "banana",
					matches: [
						{
							fdcId: 999,
							description: "Banana, raw",
							dataType: "Foundation",
							source: "USDA FoodData Central, FDC 999",
							nutrition: {
								calories: 89,
								protein: 1.1,
								carbs: 22.8,
								fat: 0.3,
								fiber: 2.6,
							},
						},
					],
				}),
			}),
		);
		await page.route("**/api/ai/ingredient-portions/999", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					portions: [{ label: "medium banana", amount: 2, gramWeight: 270 }],
				}),
			}),
		);
		const savedIngredients: Record<string, any>[] = [];
		await page.route("**/api/ingredients/banana", async (route) => {
			savedIngredients.push(route.request().postDataJSON());
			await route.continue();
		});
		await page.goto("/");
		await page
			.locator(".app-header")
			.getByRole("button", { name: "Library" })
			.click();
		await page.getByRole("tab", { name: "Ingredient catalog" }).click();
		const banana = page
			.locator(".library-card")
			.filter({ hasText: "Pisang sedang" })
			.first();
		await banana.getByRole("button", { name: "Edit" }).click();
		await page.getByRole("button", { name: "Find nutrition with AI" }).click();
		await page.getByRole("button", { name: "Check with AI" }).click();
		await page.getByRole("button", { name: "Show USDA serving sizes" }).click();
		await page.getByRole("button", { name: "Use USDA weight for 1 piece (135 g)" }).click();
		await expect(page.getByRole("status")).toContainText("Updated Pisang sedang from USDA");
		const editor = page.getByRole("form", { name: "Edit ingredient" });
		await expect(editor.getByLabel("Nutrition basis amount (piece)")).toHaveValue("1");
		await expect(editor.getByLabel("Calories (kcal)")).toHaveValue("120.15");
		await editor.getByRole("button", { name: "Save ingredient" }).click();
		expect(savedIngredients.at(-1)).toMatchObject({
			unit: "piece",
			basisAmount: 1,
			equivalentGrams: 135,
			nutrition: { calories: 120.15 },
		});
		await expect(
			page.locator(".library-card").filter({ hasText: "Pisang sedang" }).first(),
		).toContainText("1 piece (135 g)");
	});

	test("blurred library actions preserve an ingredient draft without prompting", async ({
		page,
	}) => {
		let dialogs = 0;
		page.on("dialog", async (dialog) => {
			dialogs++;
			await dialog.dismiss();
		});
		await page.goto("/");
		await page
			.locator(".app-header")
			.getByRole("button", { name: "Library" })
			.click();
		await page.getByRole("tab", { name: "Ingredient catalog" }).click();
		const ingredient = page.locator(".library-card").first();
		await ingredient.getByRole("button", { name: "Edit" }).click();
		await ingredient
			.getByLabel("Primary ingredient name")
			.fill("Unsaved ingredient name");
		await page.evaluate(() => {
			window.dispatchEvent(new Event("blur"));
			window.dispatchEvent(new Event("focus"));
			(
				document.querySelector(
					'[role="tab"][aria-selected="false"]',
				) as HTMLElement
			).click();
		});
		expect(dialogs).toBe(0);
		await expect(
			page.getByRole("tab", { name: "Ingredient catalog" }),
		).toHaveAttribute("aria-selected", "true");
		await expect(ingredient.getByLabel("Primary ingredient name")).toHaveValue(
			"Unsaved ingredient name",
		);
	});

	test("existing library edits expand in place and untouched cancel is immediate", async ({
		page,
	}) => {
		let dialogs = 0;
		let discardAction: "accept" | "dismiss" = "accept";
		page.on("dialog", async (dialog) => {
			dialogs++;
			if (discardAction === "dismiss") await dialog.dismiss();
			else await dialog.accept();
		});
		await page.goto("/");
		await page
			.locator(".app-header")
			.getByRole("button", { name: "Library" })
			.click();
		const menu = page.locator(".library-card").first();
		await menu.getByRole("button", { name: "Edit" }).click();
		await expect(menu.locator("form.library-editor")).toBeVisible();
		await page
			.getByRole("searchbox", { name: "Search saved menus" })
			.fill("no such menu");
		await expect(menu).toBeVisible();
		await menu.locator("form").getByRole("button", { name: "Cancel" }).click();
		await expect(menu.locator("form")).toHaveCount(0);
		await page.getByRole("searchbox", { name: "Search saved menus" }).fill("");
		await menu.getByRole("button", { name: "Edit" }).click();
		await menu.getByLabel("Menu name").fill("Unsaved tab-switch edit");
		discardAction = "dismiss";
		await page.getByRole("tab", { name: "Ingredient catalog" }).click();
		await expect(
			page.getByRole("tab", { name: "Saved menus" }),
		).toHaveAttribute("aria-selected", "true");
		await expect(menu.locator("form.library-editor")).toBeVisible();
		discardAction = "accept";
		await page.getByRole("tab", { name: "Ingredient catalog" }).click();
		await expect(
			page.getByRole("tab", { name: "Ingredient catalog" }),
		).toHaveAttribute("aria-selected", "true");
		await expect(menu.locator("form")).toHaveCount(0);
		await page.getByRole("tab", { name: "Saved menus" }).click();
		await page.getByRole("searchbox", { name: "Search saved menus" }).fill("");
		await expect(menu.locator("form")).toHaveCount(0);
		const ingredient = page.locator(".library-card").first();
		await ingredient.getByRole("button", { name: "Edit" }).click();
		await expect(ingredient.locator("form.library-editor")).toBeVisible();
		await ingredient
			.locator("form")
			.getByRole("button", { name: "Cancel" })
			.click();
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
		await expect(
			saved.getByText("Dada ayam tanpa kulit · 150 g"),
		).toBeVisible();
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
		await expect(
			page.getByRole("row", { name: /Estimated BMR/ }),
		).not.toHaveText(initialBmr);
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

	test("next-week advanced settings persist independently for both members", async ({
		page,
	}) => {
		await page.clock.install({ time: new Date(2026, 9, 9, 12) });
		await page.goto("/");
		await page
			.locator(".app-header")
			.getByRole("button", { name: "Targets" })
			.click();

		const cases = [
			{
				member: "Richard",
				deficit: "15",
				protein: "30",
				carbs: "40",
				fat: "30",
				fiber: "35",
				reserve: "600",
			},
			{
				member: "Michelle",
				deficit: "10",
				protein: "35",
				carbs: "35",
				fat: "30",
				fiber: "0",
				reserve: "0",
			},
		];
		for (const item of cases) {
			await page.getByLabel("Member").selectOption({ label: item.member });
			await page.getByLabel("Deficit target (%)").fill(item.deficit);
			await page.getByLabel("Protein (%)").fill(item.protein);
			await page.getByLabel("Carbohydrate (%)").fill(item.carbs);
			await page.getByLabel("Fat (%)").fill(item.fat);
			await page.getByLabel("Fiber target (g/day)").fill(item.fiber);
			await page.getByLabel("Weekend reserve (kcal/week)").fill(item.reserve);
			const apply = page.getByRole("button", {
				name: "Apply next-week targets",
			});
			await expect(apply).toBeEnabled();
			await apply.click();
			await expect(page.getByLabel("Deficit target (%)")).toHaveValue(
				item.deficit,
			);
			await expect(page.getByLabel("Protein (%)")).toHaveValue(item.protein);
			await expect(page.getByLabel("Carbohydrate (%)")).toHaveValue(
				item.carbs,
			);
			await expect(page.getByLabel("Fat (%)")).toHaveValue(item.fat);
			await expect(page.getByLabel("Fiber target (g/day)")).toHaveValue(
				item.fiber,
			);
			await expect(page.getByLabel("Weekend reserve (kcal/week)")).toHaveValue(
				item.reserve,
			);
		}

		await page.reload();
		await page
			.locator(".app-header")
			.getByRole("button", { name: "Targets" })
			.click();
		for (const item of cases) {
			await page.getByLabel("Member").selectOption({ label: item.member });
			await expect(page.getByLabel("Deficit target (%)")).toHaveValue(
				item.deficit,
			);
			await expect(page.getByLabel("Protein (%)")).toHaveValue(item.protein);
			await expect(page.getByLabel("Carbohydrate (%)")).toHaveValue(
				item.carbs,
			);
			await expect(page.getByLabel("Fat (%)")).toHaveValue(item.fat);
			await expect(page.getByLabel("Fiber target (g/day)")).toHaveValue(
				item.fiber,
			);
			await expect(page.getByLabel("Weekend reserve (kcal/week)")).toHaveValue(
				item.reserve,
			);
		}
	});
});
