import { expect, test, type APIRequestContext } from "@playwright/test";

const recommendation = {
	name: "Tofu and greens",
	origin: "new",
	savedMenuKey: "",
	justification: "A practical protein-focused meal, with a banana snack to help close the gap.",
	cookingNote: "",
	ingredients: [{ ingredientId: "tofu", quantity: 150 }],
	ingredientDetails: [{ ingredientId: "tofu", quantity: 150, name: "Tahu firm" }],
	removals: [],
	newIngredients: [],
	priorKey: ["tofu-snack-option"],
	nutrition: { calories: 216, protein: 26, carbs: 4, fat: 13, fiber: 3 },
	companionSnacks: [{
		memberId: "richard",
		name: "Banana",
		justification: "Adds practical calories and fiber.",
		ingredients: [{ ingredientId: "banana", quantity: 1 }],
		nutrition: { calories: 105, protein: 1, carbs: 27, fat: 0, fiber: 3 },
	}],
	deltas: [{
		member: "Richard",
		memberId: "richard",
		caloriesAfter: 505,
		calorieTarget: 960,
		overCaloriesBy: 0,
		proteinAfter: 35,
		proteinTarget: 60,
		carbsAfter: 44,
		carbsTarget: 108,
		fatAfter: 14,
		fatTarget: 32,
		fiberAfter: 7,
		fiberTarget: 15,
		proteinDelta: 27,
		carbsDelta: 31,
		fatDelta: 13,
		fiberDelta: 6,
	}],
};

async function createScheduledMeal(request: APIRequestContext) {
	const id = `ai-snack-meal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const meal = {
		id,
		date: "2026-10-06",
		slot: "lunch",
		memberId: "richard",
		name: `AI snack fixture ${id}`,
		notes: "",
		ingredients: [{ ingredientId: "tofu", quantity: 120 }],
	};
	expect((await request.post("/api/meals", { data: meal })).status()).toBe(201);
	return meal;
}

for (const choice of ["meal only", "meal + snack"] as const) {
	test(`AI companion snack can be applied as ${choice} and persists correctly`, async ({ page, request }) => {
		const meal = await createScheduledMeal(request);
		const before = await (await request.get("/api/data")).json();
		const previousMealIds = new Set(before.scheduledMeals.map((item: { id: string }) => item.id));
		const recommendationRequests: { companions: unknown[] }[] = [];
		try {
			await page.clock.install({ time: new Date(2026, 9, 6, 12) });
			await page.route("**/api/ai/status", (route) => route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ recommendations: true, ingredientLookup: true }),
			}));
			await page.route("**/api/ai/recommendations", (route) => {
				recommendationRequests.push(route.request().postDataJSON());
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ recommendations: Array.from({ length: 5 }, () => recommendation) }),
				});
			});
			await page.goto("/");
			await page.getByRole("button", { name: "Week", exact: true }).click();
			const scheduledMeal = page.locator(".pk-week-meal").filter({ hasText: meal.name });
			await scheduledMeal.getByRole("button", { name: "Edit", exact: true }).click();
			await page.getByRole("button", { name: "Adjust with AI" }).click();
			const card = page.locator(".pk-ai-card").first();
			await expect(card).toContainText("Planned totals · meal only: 400 / 960 kcal");
			await expect(card).toContainText("Planned totals · meal + snack: 505 / 960 kcal");
			await expect(card).toContainText("Protein 34 / 60 g");
			if (choice === "meal only") {
				await card.getByRole("button", { name: "Apply meal + snack" }).click();
				await page.getByRole("button", { name: "Adjust with AI" }).click();
				const previousRequests = recommendationRequests.length;
				await page.getByRole("button", { name: "↻ Refresh ideas" }).click();
				await expect.poll(() => recommendationRequests.length).toBe(previousRequests + 1);
				expect(recommendationRequests.at(-1)?.companions).toEqual([]);
				await page.getByRole("dialog", { name: "Improve this meal" }).locator(".pk-ai-card").first().getByRole("button", { name: "Apply meal only" }).click();
			} else {
				await card.getByRole("button", { name: "Apply meal + snack" }).click();
			}
			await expect(page.getByRole("dialog", { name: "Improve this meal" })).toHaveCount(0);
			await page.getByRole("button", { name: "Save scheduled meal" }).click();
			await expect(page.locator(".pk-editor-scrim")).toHaveCount(0);
			const saved = await (await request.get("/api/data")).json();
			const snacks = saved.scheduledMeals.filter((item: { date: string; slot: string; memberId?: string }) => item.date === meal.date && item.slot === "snack" && item.memberId === "richard");
			expect(snacks).toHaveLength(choice === "meal only" ? 0 : 1);
			if (choice === "meal + snack") expect(snacks[0].name).toBe("Banana");
		} finally {
			const saved = await (await request.get("/api/data")).json();
			for (const item of saved.scheduledMeals.filter((entry: { id: string }) => !previousMealIds.has(entry.id)))
				await request.delete(`/api/meals/${item.id}`);
			await request.delete(`/api/meals/${meal.id}`);
		}
	});
}
