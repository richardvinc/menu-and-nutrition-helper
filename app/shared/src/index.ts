export type MemberId = "richard" | "michelle";
export type MealSlot = "lunch" | "dinner" | "snack";
export type Unit = string;

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
	weightHistory?: WeightCheckIn[];
	activityLevel: "inactive" | "low" | "active" | "very" | "custom";
	activityFactor: number;
}

export interface WeightCheckIn {
	date: string;
	weightKg: number;
}

export interface WeeklyTarget {
	memberId: MemberId;
	weekStart: string;
	weightKg?: number;
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

export interface CalendarSource {
	id: string;
	name: string;
	color: string;
	visible: boolean;
	kind: "personal" | "ics";
	sourceFileName?: string;
	sourceUrl?: string;
	subscribed?: boolean;
	lastRefreshedAt?: string;
	lastRefreshAttemptAt?: string;
	refreshError?: string;
	timeZones?: Record<string, string>;
}

export interface AgendaItem {
	id: string;
	calendarId: string;
	title: string;
	description?: string;
	start: string;
	end: string;
	allDay: boolean;
	timeZone?: string;
	recurrenceRule?: string;
	recurrenceDates?: string[];
	excludedDates?: string[];
	exceptions?: Record<string, { cancel?: true; title?: string; description?: string; start?: string; end?: string; allDay?: boolean; timeZone?: string }>;
	sourceUid?: string;
}

export interface AppData {
	members: MemberProfile[];
	ingredients: Ingredient[];
	savedMenus: SavedMenu[];
	scheduledMeals: ScheduledMeal[];
	targets: WeeklyTarget[];
	calendars: CalendarSource[];
	agendaItems: AgendaItem[];
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
