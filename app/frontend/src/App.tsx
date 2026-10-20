import type {
	AppData,
	Ingredient,
	MemberId,
	SavedMenu,
	ScheduledMeal,
	TargetPreviewRequest,
} from "@piring-kita/shared";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Calendar } from "./features/calendar/Calendar";
import { ScheduledMealEditor } from "./features/editor/ScheduledMealEditor";
import { Library } from "./features/library";
import { Targets } from "./features/targets";
import { WeeklyPlanner } from "./features/week/WeeklyPlanner";
import { type AppTheme, toggleTheme } from "./theme";

type Page = "today" | "week" | "calendar" | "library" | "targets";
type EditorState = {
	meal?: ScheduledMeal;
	date: string;
	slot: ScheduledMeal["slot"];
	memberId?: MemberId;
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const monday = (date: Date) => {
	const result = new Date(date);
	result.setHours(12, 0, 0, 0);
	result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
	return result;
};
const addDays = (date: Date, count: number) => {
	const result = new Date(date);
	result.setDate(result.getDate() + count);
	return result;
};

export function App() {
	const [data, setData] = useState<AppData | null>(null);
	const [page, setPage] = useState<Page>("today");
	const [editor, setEditor] = useState<EditorState | null>(null);
	const [error, setError] = useState("");
	const [theme, setTheme] = useState<AppTheme>("dark");
	const reload = async () => {
		setData(await api.data());
		setError("");
	};
	useEffect(() => {
		reload().catch((reason) =>
			setError(
				reason instanceof Error
					? reason.message
					: "Could not load the meal plan.",
			),
		);
	}, []);

	useEffect(() => {
		if (page !== "today" || editor) return;
		let timer: ReturnType<typeof setInterval> | undefined;
		let active = true;
		let refreshing = false;
		const startRefresh = (interval: number) => {
			if (active)
				timer = setInterval(() => {
					if (refreshing) return;
					refreshing = true;
					reload()
						.catch((reason) =>
							setError(
								reason instanceof Error
									? reason.message
									: "Could not refresh the meal plan.",
							),
						)
						.finally(() => {
							refreshing = false;
						});
				}, interval);
		};
		api.config()
			.then(({ dashboardRefreshIntervalMs }) =>
				startRefresh(dashboardRefreshIntervalMs),
			)
			.catch(() => startRefresh(60_000));
		return () => {
			active = false;
			if (timer) clearInterval(timer);
		};
	}, [page, editor]);

	const run = async (action: () => Promise<unknown>) => {
		setError("");
		try {
			await action();
			await reload();
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "The change could not be saved.",
			);
			throw reason;
		}
	};

	const today = new Date();
	const todayKey = dateKey(
		new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12),
	);
	const currentPlannerWeekStart = dateKey(monday(today));
	const [plannerWeekStart, setPlannerWeekStart] = useState(
		currentPlannerWeekStart,
	);
	const [plannerFocusDate, setPlannerFocusDate] = useState(todayKey);
	const effectiveWeek = dateKey(addDays(monday(today), 7));
	const navigate = (nextPage: Page) => {
		if (nextPage === "week") {
			setPlannerWeekStart(currentPlannerWeekStart);
			setPlannerFocusDate(todayKey);
		}
		setPage(nextPage);
	};
	const navigation: { id: Page; label: string }[] = [
		{ id: "today", label: "Today" },
		{ id: "week", label: "Week" },
		{ id: "calendar", label: "Calendar" },
		{ id: "library", label: "Library" },
		{ id: "targets", label: "Targets" },
	];

	if (!data)
		return (
			<main className="app-state">
				<span className="brand-mark">
					<img src="/cooking.png" alt="" />
				</span>
				<h1>Piring Kita</h1>
				<p>{error || "Loading meal planner…"}</p>
				{error && (
					<button onClick={() => reload().catch(() => undefined)}>
						Try again
					</button>
				)}
			</main>
		);

	const openEditor = (
		date: string,
		slot: ScheduledMeal["slot"],
		memberId?: MemberId,
		meal?: ScheduledMeal,
	) => setEditor({ meal, date, slot, memberId });
	const content =
		page === "today" ? (
			<Dashboard
				data={data}
				today={today}
				onEditMeal={(meal) => {
					setPlannerWeekStart(
						dateKey(monday(new Date(`${meal.date}T12:00:00`))),
					);
					setPlannerFocusDate(meal.date);
					setPage("week");
					openEditor(meal.date, meal.slot, meal.memberId, meal);
				}}
			/>
		) : page === "week" ? (
			<WeeklyPlanner
				data={data}
				weekStart={plannerWeekStart}
				initialSelectedDate={plannerFocusDate}
				currentWeekStart={currentPlannerWeekStart}
				onWeekChange={setPlannerWeekStart}
				onEditMeal={(meal) =>
					openEditor(meal.date, meal.slot, meal.memberId, meal)
				}
				onCreateMeal={(date, slot, memberId) =>
					openEditor(date, slot, memberId)
				}
				onMoveMeal={(id, date) => run(() => api.moveMeal(id, date))}
				onDeleteMeal={(id) => run(() => api.deleteMeal(id))}
				onSwapDays={(firstDate, secondDate) =>
					run(() => api.swapDays(firstDate, secondDate))
				}
			/>
		) : page === "calendar" ? (
			<Calendar data={data} onReload={reload} />
		) : page === "library" ? (
			<Library
				menus={data.savedMenus}
				ingredients={data.ingredients}
				onSaveMenu={(menu: SavedMenu) =>
					run(() =>
						api.saveMenu(
							menu,
							data.savedMenus.some((item) => item.id === menu.id),
						),
					)
				}
				onDeleteMenu={(id) => run(() => api.deleteMenu(id))}
				onSaveIngredient={(ingredient: Ingredient) =>
					run(() =>
						api.saveIngredient(
							ingredient,
							data.ingredients.some((item) => item.id === ingredient.id),
						),
					)
				}
				onDeleteIngredient={(id) => run(() => api.deleteIngredient(id))}
				onRestoreDatabase={async (file) => {
					await api.restoreDatabase(file);
					await reload();
				}}
			/>
		) : (
			<Targets
				members={data.members}
				targets={data.targets}
				effectiveWeek={effectiveWeek}
				onPreview={api.previewTarget}
				onApply={(request: TargetPreviewRequest, startToday?: boolean) =>
					run(() => api.applyTarget(request, startToday))
				}
			/>
		);

	return (
		<div className="app-shell">
			<header className="app-header">
				<button className="app-brand" onClick={() => setPage("today")}>
					<span className="brand-mark">
						<img src="/cooking.png" alt="" />
					</span>
					<span>
						<strong>Piring Kita</strong>
						<small>Simple meal planning for the week</small>
					</span>
				</button>
				<div className="app-header__actions">
					<nav aria-label="Primary navigation">
						{navigation.map((item) => (
							<button
								key={item.id}
								className={page === item.id ? "is-current" : ""}
								aria-current={page === item.id ? "page" : undefined}
								onClick={() => navigate(item.id)}
							>
								{item.label}
							</button>
						))}
					</nav>
					<button
						type="button"
						className="theme-toggle"
						aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
						title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
						onClick={() => setTheme(toggleTheme())}
					>
						{theme === "dark" ? "☀ Light" : "◐ Dark"}
					</button>
				</div>
			</header>
			{error && (
				<div className="app-error" role="alert">
					{error}
					<button aria-label="Dismiss error" onClick={() => setError("")}>
						×
					</button>
				</div>
			)}
			{content}
			<nav className="app-mobile-nav" aria-label="Primary navigation">
				{navigation.map((item) => (
					<button
						key={item.id}
						className={page === item.id ? "is-current" : ""}
						aria-current={page === item.id ? "page" : undefined}
						onClick={() => navigate(item.id)}
					>
						{item.label}
					</button>
				))}
			</nav>
			{editor && (
				<ScheduledMealEditor
					data={data}
					initialMeal={editor.meal}
					date={editor.date}
					slot={editor.slot}
					memberId={editor.memberId}
					onCancel={() => setEditor(null)}
					onSaveMenus={(menus, pendingIngredients) => run(() => api.saveRecommendedMenus(menus, pendingIngredients))}
					onSave={async (meal, saveMenu, menu, pendingIngredients, companions) => {
						await run(() =>
							api.saveMealAndMenu(
								meal,
								Boolean(editor.meal),
								Boolean(saveMenu),
								menu,
								pendingIngredients ?? [],
								companions ?? [],
							),
						);
						setEditor(null);
					}}
				/>
			)}
		</div>
	);
}
