export type MemberId = "richard" | "michelle";
export type MealSlot = "lunch" | "dinner" | "snack";
export type Unit = "g" | "piece" | "tbsp" | "package";

export interface Nutrition {
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
}

export interface Ingredient {
	id: string;
	name: string;
	aliases: string[];
	unit: Unit;
	basisAmount: number;
	equivalentGrams?: number;
	preparation: string;
	source: string;
	suggestible: boolean;
	nutrition: Nutrition;
}

export interface MenuIngredient {
	ingredientId: string;
	quantity: number;
	memberId?: MemberId;
	/** Immutable copy used by menus and scheduled meals after catalog changes. */
	ingredient?: Ingredient;
}

export interface SavedMenu {
	id: string;
	name: string;
	slot: MealSlot;
	memberId?: MemberId;
	ingredients: MenuIngredient[];
}

export interface ScheduledMeal {
	id: string;
	date: string;
	slot: MealSlot;
	memberId?: MemberId;
	name: string;
	notes: string;
	ingredients: MenuIngredient[];
}

export interface MemberProfile {
	id: MemberId;
	name: string;
	birthday: string;
	sex: "male" | "female" | "other";
	heightCm: number;
	currentWeightKg: number;
	activityLevel: "inactive" | "low" | "active" | "very" | "custom";
	activityFactor: number;
}

export interface WeeklyTarget {
	memberId: MemberId;
	weekStart: string;
	deficitPercent: number;
	weekendReserve: number;
	proteinPercent: number;
	carbsPercent: number;
	fatPercent: number;
	fiberGrams: number;
	weeklyCalories: number;
	weekdayCalories: number;
	macroGrams: Pick<Nutrition, "protein" | "carbs" | "fat">;
}

export interface AppData {
	members: MemberProfile[];
	ingredients: Ingredient[];
	savedMenus: SavedMenu[];
	scheduledMeals: ScheduledMeal[];
	targets: WeeklyTarget[];
}

export interface TargetPreviewRequest {
	memberId: MemberId;
	effectiveWeek: string;
	weightKg: number;
	heightCm: number;
	sex: MemberProfile["sex"];
	activityLevel: MemberProfile["activityLevel"];
	activityFactor: number;
	deficitPercent: number;
	weekendReserve: number;
	proteinPercent: number;
	carbsPercent: number;
	fatPercent: number;
	fiberGrams: number;
}

export interface TargetPreview {
	current: WeeklyTarget;
	proposed: WeeklyTarget;
	calculation: {
		age: number;
		bmrCalories: number;
		maintenanceCalories: number;
	};
	recommendation: string;
}
