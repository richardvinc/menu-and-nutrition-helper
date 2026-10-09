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
	saveMeal: (meal: ScheduledMeal, exists: boolean) =>
		request<ScheduledMeal>(`/api/meals${exists ? `/${meal.id}` : ""}`, {
			method: exists ? "PUT" : "POST",
			body: JSON.stringify(meal),
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
