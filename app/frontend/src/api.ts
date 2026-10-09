import type {
	AppData,
	Ingredient,
	SavedMenu,
	ScheduledMeal,
	TargetPreview,
	TargetPreviewRequest,
} from "@piring-kita/shared";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, {
		...init,
		headers: init?.body
			? { "Content-Type": "application/json", ...init.headers }
			: init?.headers,
	});
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(body?.error ?? `Request failed (${response.status})`);
	}
	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
}

export const api = {
	data: () => request<AppData>("/api/data"),
	aiStatus: () =>
		request<{ recommendations: boolean; ingredientLookup: boolean }>(
			"/api/ai/status",
		),
	saveMeal: (meal: ScheduledMeal, exists: boolean) =>
		request<ScheduledMeal>(`/api/meals${exists ? `/${meal.id}` : ""}`, {
			method: exists ? "PUT" : "POST",
			body: JSON.stringify(meal),
		}),
	saveMealAndMenu: (
		meal: ScheduledMeal,
		exists: boolean,
		saveMenu: boolean,
		pendingIngredients: Ingredient[],
		companions: ScheduledMeal[] = [],
	) =>
		request<ScheduledMeal>("/api/meals/save", {
			method: "POST",
			body: JSON.stringify({
				meal,
				exists,
				pendingIngredients,
				companions,
				menu: saveMenu
					? {
							id: `ai-menu-${Date.now()}`,
							name: meal.name,
							slot: meal.slot,
							...(meal.memberId ? { memberId: meal.memberId } : {}),
							ingredients: meal.ingredients,
						}
					: undefined,
			}),
		}),
	deleteMeal: (id: string) =>
		request<void>(`/api/meals/${id}`, { method: "DELETE" }),
	moveMeal: (id: string, date: string) =>
		request<{ moved: ScheduledMeal; swapped: ScheduledMeal | null }>(
			`/api/meals/${id}/move`,
			{
				method: "POST",
				body: JSON.stringify({ date }),
			},
		),
	swapDays: (firstDate: string, secondDate: string) =>
		request<ScheduledMeal[]>("/api/days/swap", {
			method: "POST",
			body: JSON.stringify({ firstDate, secondDate }),
		}),
	saveMenu: (menu: SavedMenu, exists: boolean) =>
		request<SavedMenu>(`/api/menus${exists ? `/${menu.id}` : ""}`, {
			method: exists ? "PUT" : "POST",
			body: JSON.stringify(menu),
		}),
	saveRecommendedMenus: (menus: SavedMenu[], pendingIngredients: Ingredient[]) =>
		request<SavedMenu[]>("/api/menus/recommendations", {
			method: "POST",
			body: JSON.stringify({ menus, pendingIngredients }),
		}),
	deleteMenu: (id: string) =>
		request<void>(`/api/menus/${id}`, { method: "DELETE" }),
	saveIngredient: (ingredient: Ingredient, exists: boolean) =>
		request<Ingredient>(
			`/api/ingredients${exists ? `/${ingredient.id}` : ""}`,
			{
				method: exists ? "PUT" : "POST",
				body: JSON.stringify(ingredient),
			},
		),
	deleteIngredient: (id: string) =>
		request<void>(`/api/ingredients/${id}`, { method: "DELETE" }),
	recommendMeals: (
		meal: ScheduledMeal,
		prior: string[][],
		pendingIngredients: Ingredient[],
		companions: ScheduledMeal[],
	) =>
		request<{
			recommendations: {
				name: string;
				origin: "saved" | "new";
				savedMenuKey: string;
				justification: string;
				cookingNote: string;
				ingredients: import("@piring-kita/shared").MenuIngredient[];
				removals: string[];
				nutrition: import("@piring-kita/shared").Nutrition;
				ingredientDetails: (import("@piring-kita/shared").MenuIngredient & {
					name?: string;
				})[];
				priorKey: string[];
				newIngredients: Ingredient[];
				companionSnacks: {
					memberId: import("@piring-kita/shared").MemberId;
					name: string;
					justification: string;
					ingredients: import("@piring-kita/shared").MenuIngredient[];
					nutrition: import("@piring-kita/shared").Nutrition;
				}[];
				deltas: {
					member: string;
					caloriesAfter: number;
					calorieTarget: number;
					overCaloriesBy: number;
					proteinAfter: number;
					proteinTarget: number;
					carbsAfter: number;
					carbsTarget: number;
					fatAfter: number;
					fatTarget: number;
					fiberAfter: number;
					fiberTarget: number;
					proteinDelta: number;
					carbsDelta: number;
					fatDelta: number;
					fiberDelta: number;
					sourceWarning?: string;
				}[];
			}[];
		}>("/api/ai/recommendations", {
			method: "POST",
			body: JSON.stringify({ meal, prior, pendingIngredients, companions }),
		}),
	lookupIngredient: (name: string, preparation = "", checkExisting = false) =>
		request<{
			query: string;
			aliases: string[];
			existing?: string;
			similar?: string[];
			matches: {
				fdcId: number;
				description: string;
				dataType: string;
				source: string;
				nutrition: import("@piring-kita/shared").Nutrition;
			}[];
		}>("/api/ai/ingredient-lookup", {
			method: "POST",
			body: JSON.stringify({ name, preparation, checkExisting }),
		}),
	previewTarget: (proposal: TargetPreviewRequest) =>
		request<TargetPreview>("/api/targets/preview", {
			method: "POST",
			body: JSON.stringify(proposal),
		}),
	applyTarget: (proposal: TargetPreviewRequest, startToday = false) =>
		request<void>(`/api/targets/apply${startToday ? "?start=today" : ""}`, {
			method: "POST",
			body: JSON.stringify(proposal),
		}),
};
