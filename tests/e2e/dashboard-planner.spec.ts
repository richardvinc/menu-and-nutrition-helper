import { expect, test } from "@playwright/test";

const testMeals = [
	{
		id: "seed-1005-r-lunch",
		date: "2026-10-05",
		slot: "lunch",
		memberId: "richard",
		name: "Ginger chicken rice",
		notes: "",
		ingredients: [
			{ ingredientId: "chicken", quantity: 150 },
			{ ingredientId: "rice", quantity: 180 },
			{ ingredientId: "broccoli", quantity: 100 },
		],
	},
	{
		id: "seed-1008-r-lunch",
		date: "2026-10-08",
		slot: "lunch",
		memberId: "richard",
		name: "Sesame chicken bowl",
		notes: "",
		ingredients: [
			{ ingredientId: "chicken", quantity: 150 },
			{ ingredientId: "rice", quantity: 170 },
			{ ingredientId: "broccoli", quantity: 100 },
		],
	},
	{
		id: "seed-1008-m-lunch",
		date: "2026-10-08",
		slot: "lunch",
		memberId: "michelle",
		name: "Green tofu bowl",
		notes: "",
		ingredients: [
			{ ingredientId: "tofu", quantity: 160 },
			{ ingredientId: "rice", quantity: 120 },
			{ ingredientId: "avocado", quantity: 50 },
		],
	},
	{
		id: "seed-1008-dinner",
		date: "2026-10-08",
		slot: "dinner",
		name: "Egg fried rice",
		notes: "",
		ingredients: [
			{ ingredientId: "egg", quantity: 2 },
			{ ingredientId: "broccoli", quantity: 100 },
			{ ingredientId: "rice", quantity: 110, memberId: "richard" },
			{ ingredientId: "rice", quantity: 70, memberId: "michelle" },
		],
	},
	{
		id: "seed-1008-m-snack",
		date: "2026-10-08",
		slot: "snack",
		memberId: "michelle",
		name: "Banana snack",
		notes: "",
		ingredients: [{ ingredientId: "banana", quantity: 1 }],
	},
] as const;

test.beforeAll(async ({ request }) => {
	for (const meal of testMeals)
		expect((await request.post("/api/meals", { data: meal })).status()).toBe(
			201,
		);
});

test.afterAll(async ({ request }) => {
	for (const meal of testMeals) await request.delete(`/api/meals/${meal.id}`);
});

test("dashboard shows static today, tomorrow, and weekly meal cards", async ({
	page,
}) => {
	await page.clock.install({ time: new Date(2026, 9, 8, 12) });
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "Thursday, October 8" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Friday, October 9" }),
	).toBeVisible();
	await expect(
		page.locator(".pk-day").first().locator(".pk-meal-card"),
	).toHaveCount(5);
	await expect(
		page.locator(".pk-day").first().getByText("Richard’s lunch"),
	).toBeVisible();
	await expect(
		page.locator(".pk-day").first().getByText("Michelle’s lunch"),
	).toBeVisible();
	await expect(
		page.locator(".pk-day").first().getByText("Our dinner"),
	).toBeVisible();
	await expect(
		page.locator(".pk-day").first().getByText("Richard’s snack"),
	).toBeVisible();
	await expect(
		page.locator(".pk-day").first().getByText("Michelle’s snack"),
	).toBeVisible();
	await expect(page.locator(".pk-day__heading > span")).toHaveCount(0);
	await expect(page.getByText("Ingredient list")).toHaveCount(0);
	await expect(page.locator(".pk-dashboard button")).toHaveCount(0);
	await expect(
		page.getByRole("heading", { name: "Weekly menu" }),
	).toBeVisible();
	await expect(page.locator(".pk-week-summary__grid > section")).toHaveCount(7);
	const weekDays = page.locator(".pk-week-summary__grid > section");
	const firstDay = await weekDays.nth(0).boundingBox();
	const fourthDay = await weekDays.nth(3).boundingBox();
	const fifthDay = await weekDays.nth(4).boundingBox();
	expect(fourthDay?.y).toBe(firstDay?.y);
	expect(fifthDay && firstDay && fifthDay.y > firstDay.y).toBe(true);
	await expect(
		page.locator(".pk-week-summary__grid small", { hasText: "[R]" }).first(),
	).toBeVisible();
	await expect(
		page.locator(".pk-week-summary__grid small", { hasText: "[M]" }).first(),
	).toBeVisible();
	await expect(
		page.locator(".pk-week-summary__grid small", { hasText: /^LUNCH$/ }),
	).toHaveCount(0);
	expect(
		Number.parseFloat(
			await page
				.locator(".pk-week-summary__grid li span")
				.first()
				.evaluate((element) => getComputedStyle(element).fontSize),
		),
	).toBeGreaterThanOrEqual(14);
	expect(
		await page
			.locator(".pk-week-summary__grid li span")
			.first()
			.evaluate((element) => getComputedStyle(element).whiteSpace),
	).not.toBe("nowrap");
	const firstItem = page.locator(".pk-week-summary__grid li").first();
	const labelBox = await firstItem.locator("small").boundingBox();
	const nameBox = await firstItem.locator("span").boundingBox();
	expect(
		labelBox && nameBox && nameBox.y - labelBox.y - labelBox.height,
	).toBeGreaterThanOrEqual(4);
	expect(
		await page.evaluate(() => ({
			width: document.documentElement.scrollWidth <= innerWidth,
			height: document.documentElement.scrollHeight > innerHeight,
		})),
	).toEqual({ width: true, height: true });
});

test("weekly summary keeps equal day cells and borders its empty grid slot", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1174, height: 700 });
	await page.goto("/");
	const grid = page.locator(".pk-week-summary__grid");
	await expect(grid.locator(":scope > section")).toHaveCount(7);
	const layout = await grid.evaluate((element) => {
		const days = element.querySelectorAll(":scope > section");
		const firstDay = days[0];
		const lastDay = days[6];
		return {
			firstWidth: firstDay.getBoundingClientRect().width,
			lastWidth: lastDay.getBoundingClientRect().width,
			emptySlotTopBorder: parseFloat(
				getComputedStyle(element, "::after").borderTopWidth,
			),
			emptySlotLeftBorder: parseFloat(
				getComputedStyle(element, "::after").borderLeftWidth,
			),
		};
	});
	expect(Math.abs(layout.firstWidth - layout.lastWidth)).toBeLessThanOrEqual(1);
	expect(layout.emptySlotTopBorder).toBeGreaterThan(0);
	expect(layout.emptySlotLeftBorder).toBeGreaterThan(0);
});

test("dark theme applies the nighttime surface palette", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
	await expect(page.locator("body")).toHaveCSS(
		"background-color",
		"rgb(19, 18, 30)",
	);
	await expect(page.locator(".app-header")).toHaveCSS(
		"background-color",
		"rgba(33, 31, 48, 0.96)",
	);
	await expect(
		page.getByRole("heading", { name: "Good food, ready when you are." }),
	).toBeVisible();
});

test("navbar shows the cooking icon and switches theme on demand", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
		"href",
		"/cooking.png",
	);
	await expect(page.locator(".app-brand img")).toHaveAttribute(
		"src",
		"/cooking.png",
	);
	const initial = await page.locator("html").getAttribute("data-theme");
	const next = initial === "dark" ? "light" : "dark";
	await page.getByRole("button", { name: `Switch to ${next} mode` }).click();
	await expect(page.locator("html")).toHaveAttribute("data-theme", next);
	await expect(
		page.getByRole("button", { name: `Switch to ${initial} mode` }),
	).toBeVisible();
});

test("meal quantity changes update nutrition before save", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Week", exact: true }).click();
	await page
		.locator(".pk-week-meal")
		.filter({ hasText: "Sesame chicken bowl" })
		.first()
		.getByRole("button", { name: "Edit", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "Nutrition in this meal" }),
	).toBeVisible();
	await expect(page.getByText("Start with a saved menu")).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Copy saved menu" }),
	).toHaveCount(0);
	const quantity = page
		.getByRole("spinbutton", { name: "Ingredient quantity" })
		.first();
	const ingredient = page
		.getByRole("textbox", { name: "Search ingredient catalog" })
		.first();
	const ingredientBox = await ingredient.boundingBox();
	const quantityBox = await quantity.boundingBox();
	expect(
		ingredientBox && quantityBox && Math.abs(ingredientBox.y - quantityBox.y),
	).toBeLessThanOrEqual(1);
	const before = await page
		.locator(".pk-editor__calories strong")
		.textContent();
	await quantity.fill("160");
	await expect(page.locator(".pk-editor__calories strong")).not.toHaveText(
		before ?? "",
	);
	await expect(page.getByText("OPTIONAL IDEAS", { exact: true })).toHaveCount(
		0,
	);
	page.once("dialog", (dialog) => dialog.accept());
	await page
		.getByRole("button", { name: /Cancel/ })
		.last()
		.click();
});

test("meal editor body contains its form at short desktop heights", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1235, height: 348 });
	await page.goto("/");
	await page.getByRole("button", { name: "Week", exact: true }).click();
	await page
		.locator(".pk-week-meal")
		.filter({ hasText: "Sesame chicken bowl" })
		.first()
		.getByRole("button", { name: "Edit", exact: true })
		.click();
	await page.locator(".pk-editor-scrim").evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	const [editor, body, notes, footer, bodyOverflow] = await Promise.all([
		page.locator(".pk-editor").boundingBox(),
		page.locator(".pk-editor__body").boundingBox(),
		page.locator(".pk-editor__notes").boundingBox(),
		page.locator(".pk-editor__footer").boundingBox(),
		page.locator(".pk-editor__body").evaluate((element) => ({
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight,
		})),
	]);
	expect(bodyOverflow.scrollHeight).toBe(bodyOverflow.clientHeight);
	expect(notes!.y + notes!.height).toBeLessThanOrEqual(body!.y + body!.height);
	expect(body!.y + body!.height).toBeLessThanOrEqual(footer!.y + 1);
	expect(footer!.y + footer!.height).toBeLessThanOrEqual(
		editor!.y + editor!.height,
	);
});

test("planned target progress combines lunch with half of shared dinner", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Week", exact: true }).click();
	await page
		.locator(".pk-week-meal")
		.filter({ hasText: "Egg fried rice" })
		.getByRole("button", { name: "Edit", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "Lunch + dinner" }),
	).toBeVisible();
	const progress = page.locator(".pk-editor__after");
	await expect(
		progress.locator(".pk-editor__member").filter({ hasText: "Richard" }),
	).toContainText("722 /");
	await expect(
		progress.locator(".pk-editor__member").filter({ hasText: "Richard" }),
	).toContainText(/Protein 66 \/ [\d,]+ g/);
	await expect(
		progress.locator(".pk-editor__member").filter({ hasText: "Richard" }),
	).toContainText(/Carbs 89 \/ [\d,]+ g/);
	await expect(
		progress.locator(".pk-editor__member").filter({ hasText: "Richard" }),
	).toContainText(/Fat 11 \/ [\d,]+ g/);
	await expect(
		progress.locator(".pk-editor__member").filter({ hasText: "Richard" }),
	).toContainText(/Fiber 5 \/ [\d,]+ g/);
	await expect(
		progress.locator(".pk-editor__member").filter({ hasText: "Michelle" }),
	).toContainText("646 /");
	await expect(
		progress.locator(".pk-editor__member").filter({ hasText: "Michelle" }),
	).toContainText(/Protein 41 \/ [\d,]+ g/);
});

test("weekly day progress includes snacks and shared dinner portions", async ({
	page,
}) => {
	await page.clock.install({ time: new Date(2026, 9, 8, 12) });
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("/");
	await page.getByRole("button", { name: "Week", exact: true }).click();
	const progress = page.locator(
		'.pk-week-day[data-date="2026-10-08"] .pk-pocket__targets',
	);
	await expect(progress).toContainText("Richard");
	await expect(progress).toContainText(/Calories 722 \/ [\d,]+ kcal/);
	await expect(progress).toContainText("Michelle");
	await expect(progress).toContainText(/Calories 751 \/ [\d,]+ kcal/);
	await expect(progress).toContainText(/Protein 66 \/ [\d,]+ g/);
	await expect(progress).toContainText(/Fiber \d+ \/ [\d,]+ g/);
});

test("dinner uses two fixed optional carbohydrate portions", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Week", exact: true }).click();
	await page
		.locator(".pk-week-meal")
		.filter({ hasText: "Egg fried rice" })
		.getByRole("button", { name: "Edit", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "Carbohydrates" }),
	).toBeVisible();
	await expect(
		page.getByLabel("Richard carbohydrate", { exact: true }),
	).toHaveValue("rice");
	await expect(page.getByLabel("Richard carbohydrate quantity")).toHaveValue(
		"110",
	);
	await expect(
		page.getByLabel("Michelle carbohydrate", { exact: true }),
	).toHaveValue("rice");
	await expect(page.getByLabel("Michelle carbohydrate quantity")).toHaveValue(
		"70",
	);
	await expect(page.getByText("Carbohydrate portion")).toHaveCount(0);
	await expect(page.locator(".pk-editor-row__remove")).toHaveCount(2);
	const carbohydrates = await page
		.getByRole("heading", { name: "Carbohydrates" })
		.boundingBox();
	const ingredients = await page
		.getByRole("heading", { name: "Ingredients" })
		.boundingBox();
	expect(carbohydrates && ingredients && carbohydrates.y < ingredients.y).toBe(
		true,
	);
});

test("meal name recalls a saved menu and suggestions only show on focus", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Week", exact: true }).click();
	await page
		.locator(".pk-week-meal")
		.filter({ hasText: "Sesame chicken bowl" })
		.first()
		.getByRole("button", { name: "Edit", exact: true })
		.click();

	const name = page.getByLabel("Meal name");
	await name.fill("nasi telur miso");
	const menuOption = page
		.getByRole("listbox", { name: "Saved menu suggestions" })
		.getByRole("option", { name: /Nasi telur miso/ });
	await expect(menuOption).toBeVisible();
	await page.getByLabel("Meal slot").selectOption("dinner");
	await expect(menuOption).toHaveCount(0);
	await page.getByLabel("Meal slot").selectOption("lunch");
	await expect(menuOption).toBeVisible();
	await name.press("ArrowDown");
	await expect(menuOption).toBeFocused();
	await page.getByLabel("Date").focus();
	await expect(
		page.getByRole("listbox", { name: "Saved menu suggestions" }),
	).toHaveCount(0);

	await name.focus();
	await page
		.getByRole("listbox", { name: "Saved menu suggestions" })
		.getByRole("option", { name: /Nasi telur miso/ })
		.click();
	await expect(name).toHaveValue("Nasi telur miso");
	await expect(
		page.getByLabel("Search ingredient catalog").first(),
	).toHaveValue("Telur ayam besar");
	await expect(
		page.getByRole("listbox", { name: "Ingredient suggestions" }),
	).toHaveCount(0);
	await page.getByLabel("Search ingredient catalog").first().focus();
	const ingredientOption = page
		.getByRole("listbox", { name: "Ingredient suggestions" })
		.getByRole("option")
		.first();
	await expect(ingredientOption).toBeVisible();
	await page.getByLabel("Search ingredient catalog").first().press("ArrowDown");
	await expect(ingredientOption).toBeFocused();
	await page.getByLabel("Date").focus();
	await expect(
		page.getByRole("listbox", { name: "Ingredient suggestions" }),
	).toHaveCount(0);
});

test("meal editor closes with Escape and a backdrop click", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Week", exact: true }).click();
	const meal = page
		.locator(".pk-week-meal")
		.filter({ hasText: "Sesame chicken bowl" })
		.first();
	await meal.getByRole("button", { name: "Edit", exact: true }).click();
	await expect(page.locator(".pk-editor-scrim")).toBeVisible();
	await page.getByLabel("Meal name").fill("Unsaved escape test");
	let discardMessage = "";
	page.once("dialog", async (dialog) => {
		discardMessage = dialog.message();
		await dialog.accept();
	});
	await page.keyboard.press("Escape");
	expect(discardMessage).toContain("Discard changes");
	await expect(page.locator(".pk-editor-scrim")).toHaveCount(0);

	await meal.getByRole("button", { name: "Edit", exact: true }).click();
	page.once("dialog", (dialog) => dialog.accept());
	await page.locator(".pk-editor-scrim").click({ position: { x: 4, y: 4 } });
	await expect(page.locator(".pk-editor-scrim")).toHaveCount(0);
});

test("AI recommendations open in a mobile-friendly modal with a cooking state", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.route("**/api/ai/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ recommendations: true, ingredientLookup: true }) }));
	let releaseRecommendations!: () => void;
	await page.route("**/api/ai/recommendations", async (route) => {
		await new Promise<void>((resolve) => { releaseRecommendations = resolve; });
		const recommendations = Array.from({ length: 5 }, (_, index) => ({
			name: `Balanced tofu idea ${index + 1}`,
			origin: index < 2 ? "saved" : "new",
			savedMenuKey: index < 2 ? `saved-${index + 1}` : "",
			justification: "Affordable protein with a practical portion and vegetables.",
			cookingNote: "Pan-fry gently.",
			ingredients: [{ ingredientId: "tofu", quantity: 150 }],
			ingredientDetails: [{ ingredientId: "tofu", quantity: 150, name: "Tahu firm" }],
			removals: [], newIngredients: [], companionSnacks: [], priorKey: [`idea-${index + 1}`],
			nutrition: { calories: 216, protein: 26, carbs: 4, fat: 13, fiber: 3 },
			deltas: [{ member: "Member A", caloriesAfter: 540, calorieTarget: 960, overCaloriesBy: 0, proteinAfter: 48, proteinTarget: 60, carbsAfter: 50, carbsTarget: 108, fatAfter: 20, fatTarget: 32, fiberAfter: 9, fiberTarget: 15, proteinDelta: 26, carbsDelta: 4, fatDelta: 13, fiberDelta: 3 }],
		}));
		await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ recommendations }) });
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Week", exact: true }).click();
	await page.locator(".pk-week__day-strip button").nth(3).click();
	await page.locator(".pk-week-meal").filter({ hasText: "Sesame chicken bowl" }).getByRole("button", { name: "Edit", exact: true }).click();
	await page.getByRole("button", { name: "Improve with AI" }).click();
	const dialog = page.getByRole("dialog", { name: "Improve this meal" });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("status")).toContainText("Building balanced meal ideas");
	await expect(dialog.locator('img[src="/ai-cooking.webp"]')).toBeVisible();
	releaseRecommendations();
	await expect(dialog.locator(".pk-ai-card")).toHaveCount(5);
	expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
	await dialog.getByRole("button", { name: "Apply this idea" }).first().click();
	await expect(dialog).toHaveCount(0);
});

test("scheduled meal can be saved to the master menu without closing", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Week", exact: true }).click();
	await page
		.locator(".pk-week-meal")
		.filter({ hasText: "Sesame chicken bowl" })
		.first()
		.getByRole("button", { name: "Edit", exact: true })
		.click();
	await page.getByLabel("Meal name").fill("Browser master bowl");
	await page
		.getByLabel("Cooking notes")
		.fill("Keep this only on the scheduled meal");
	const requestPromise = page.waitForRequest(
		(request) =>
			request.url().includes("/api/menus") &&
			["POST", "PUT"].includes(request.method()),
	);
	await page
		.getByRole("button", { name: "Save to master menu", exact: true })
		.click();
	const requestBody = (await requestPromise).postDataJSON();
	expect(requestBody).not.toHaveProperty("notes");
	expect(requestBody).toMatchObject({ slot: "lunch", memberId: "richard" });
	await expect(page.getByRole("status")).toHaveText(
		/^(Saved to master menu|Master menu updated)\.$/,
	);
	await expect(page.locator(".pk-editor-scrim")).toBeVisible();

	page.once("dialog", (dialog) => dialog.accept());
	await page.keyboard.press("Escape");
	await page
		.locator(".app-header")
		.getByRole("button", { name: "Library" })
		.click();
	await page
		.getByRole("searchbox", { name: "Search saved menus" })
		.fill("Browser master bowl");
	const menuCard = page
		.locator(".library-card")
		.filter({ hasText: "Browser master bowl" });
	await expect(menuCard.getByRole("heading")).toContainText(
		"Browser master bowl",
	);
	await expect(menuCard.locator(".library-card__badge")).toHaveText([
		"lunch",
		"richard",
	]);
});

test("dashboard shows cooking notes when a scheduled meal has them", async ({
	page,
}) => {
	await page.clock.install({ time: new Date(2026, 9, 8, 12) });
	const data = await (await page.request.get("/api/data")).json();
	const meal = data.scheduledMeals.find(
		(item: { id: string }) => item.id === "seed-1008-r-lunch",
	);
	if (!meal)
		throw new Error("seed lunch is required for cooking-note verification");
	try {
		await page.request.put(`/api/meals/${meal.id}`, {
			data: { ...meal, notes: "Marinate before cooking" },
		});
		await page.goto("/");
		const card = page
			.locator(".pk-meal-card")
			.filter({ hasText: "Sesame chicken bowl" });
		await expect(card.getByText("Cooking note", { exact: true })).toBeVisible();
		await expect(
			card.getByText("Marinate before cooking", { exact: true }),
		).toBeVisible();
	} finally {
		await page.request.put(`/api/meals/${meal.id}`, { data: meal });
	}
});

test("desktop weekly planner uses large multi-row day cards", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("/");
	await page.getByRole("button", { name: "Week", exact: true }).click();
	const days = page.locator(".pk-week-day");
	await expect(days).toHaveCount(7);
	const first = await days.nth(0).boundingBox();
	const fourth = await days.nth(3).boundingBox();
	const fifth = await days.nth(4).boundingBox();
	expect(first?.width).toBeGreaterThan(250);
	expect(fourth?.y).toBe(first?.y);
	expect(fifth && first && fifth.y > first.y).toBe(true);
	expect(
		Number.parseFloat(
			await page
				.locator(".pk-week-meal strong")
				.first()
				.evaluate((element) => getComputedStyle(element).fontSize),
		),
	).toBeGreaterThanOrEqual(15);
});

test("desktop day cards drag and drop their full menus", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("/");
	await page.getByRole("button", { name: "Week", exact: true }).click();
	const monday = page.locator(".pk-week-day").nth(0);
	const thursday = page.locator(".pk-week-day").nth(3);
	const movedMeal = await monday
		.locator(".pk-week-meal strong")
		.first()
		.textContent();
	const firstDate = await monday.getAttribute("data-date");
	const secondDate = await thursday.getAttribute("data-date");
	const from = await monday.boundingBox();
	const to = await thursday.boundingBox();
	if (!from || !to || !movedMeal || !firstDate || !secondDate)
		throw new Error("day cards need visible meals for drag verification");
	let swapped = false;
	try {
		await page.mouse.move(from.x + from.width / 2, from.y + 28);
		await page.mouse.down();
		await page.mouse.move(from.x + from.width / 2 + 12, from.y + 40);
		await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 8 });
		await expect(page.locator(".pk-week-drag-preview")).toBeVisible();
		page.once("dialog", (dialog) => dialog.accept());
		await page.mouse.up();
		await expect(thursday.getByText(movedMeal)).toBeVisible();
		swapped = true;
		await expect(monday.getByText(movedMeal)).toHaveCount(0);
	} finally {
		if (swapped)
			await page.request.post("/api/days/swap", {
				data: { firstDate, secondDate },
			});
	}
});

test("390px weekly planner uses a selected-day agenda without horizontal overflow", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(390);
	await expect(
		page.locator(".pk-day").first().locator(".pk-meal-card"),
	).toHaveCount(5);
	await page.getByRole("button", { name: "Week", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Weekly planning board" }),
	).toBeVisible();
	await expect(page.locator(".pk-pocket")).toBeVisible();
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(390);
	await page.locator(".pk-week__day-strip button").nth(3).click();
	await expect(page.getByRole("heading", { name: /Thursday/ })).toBeVisible();
	await expect(
		page.locator(".pk-pocket").getByText("Sesame chicken bowl"),
	).toBeVisible();
	await expect(page.locator(".pk-pocket .pk-pocket__targets")).toContainText("Fiber");
});
