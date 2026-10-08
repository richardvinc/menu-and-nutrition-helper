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
import { ScheduledMealEditor } from "./features/editor/ScheduledMealEditor";
import { Library } from "./features/library";
import { Targets } from "./features/targets";
import { WeeklyPlanner } from "./features/week/WeeklyPlanner";
import { type AppTheme, toggleTheme } from "./theme";

type Page = "today" | "week" | "library" | "targets";
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
	const weekDate = today.getDay() === 0 ? addDays(today, 1) : today;
	const weekStart = dateKey(monday(weekDate));
	const effectiveWeek = dateKey(addDays(monday(today), 7));
	const navigation: { id: Page; label: string }[] = [
		{ id: "today", label: "Today" },
		{ id: "week", label: "Week" },
		{ id: "library", label: "Library" },
		{ id: "targets", label: "Targets" },
	];

	if (!data)
		return (
			<main className="grid min-h-screen place-content-center justify-items-center p-6 text-center">
				<span className="grid h-[46px] w-[46px] place-items-center overflow-hidden rounded-[14px] bg-white p-[5px] shadow-[0_8px_18px_rgba(85,66,204,0.18)]">
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
			<Dashboard data={data} today={today} />
		) : page === "week" ? (
			<WeeklyPlanner
				data={data}
				weekStart={weekStart}
				onEditMeal={(meal) =>
					openEditor(meal.date, meal.slot, meal.memberId, meal)
				}
				onCreateMeal={(date, slot, memberId) =>
					openEditor(date, slot, memberId)
				}
				onMoveMeal={(id, date) => run(() => api.moveMeal(id, date))}
				onSwapDays={(firstDate, secondDate) =>
					run(() => api.swapDays(firstDate, secondDate))
				}
			/>
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
			/>
		) : (
			<Targets
				members={data.members}
				targets={data.targets}
				effectiveWeek={effectiveWeek}
				onPreview={api.previewTarget}
				onApply={(request: TargetPreviewRequest) =>
					run(() => api.applyTarget(request))
				}
			/>
		);

	return (
		<div className="min-h-screen bg-[var(--app-canvas)] px-3 py-[14px] pb-[88px] text-[var(--app-ink)] sm:px-7 sm:py-[18px] sm:pb-10">
			<header className="mx-auto mb-[18px] flex max-w-[1500px] items-center justify-between gap-6 rounded-[22px] border border-[var(--app-line)] bg-[var(--app-surface)]/95 p-2.5 shadow-[var(--app-shadow)] sm:mb-6">
				<button className="flex items-center gap-3 border-0 bg-transparent text-left text-inherit" onClick={() => setPage("today")}>
					<span className="grid h-[46px] w-[46px] place-items-center overflow-hidden rounded-[14px] bg-white p-[5px] shadow-[0_8px_18px_rgba(85,66,204,0.18)]">
						<img src="/cooking.png" alt="" />
					</span>
					<span>
						<strong>Piring Kita</strong>
						<small>Simple meal planning for the week</small>
					</span>
				</button>
				<div className="ml-auto flex items-center gap-2">
					<nav aria-label="Primary navigation">
						{navigation.map((item) => (
							<button
								key={item.id}
								className={`rounded-[13px] border px-[18px] font-bold ${page === item.id ? "border-[var(--app-purple)] bg-[var(--app-purple)] text-white shadow-[0_8px_18px_rgba(85,66,204,0.2)]" : "border-transparent bg-transparent text-[var(--app-muted)]"}`}
								aria-current={page === item.id ? "page" : undefined}
								onClick={() => setPage(item.id)}
							>
								{item.label}
							</button>
						))}
					</nav>
					<button
						type="button"
						className="min-w-[92px] rounded-[13px] border border-[var(--app-line)] bg-[var(--app-surface)] px-3 font-bold text-[var(--app-ink)]"
						aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
						title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
						onClick={() => setTheme(toggleTheme())}
					>
						{theme === "dark" ? "☀ Light" : "◐ Dark"}
					</button>
				</div>
			</header>
			{error && (
				<div className="sticky top-2.5 z-20 mx-auto mb-[18px] flex max-w-[900px] justify-between gap-4 rounded-xl border border-[#efb3a6] bg-[#fff1ed] px-4 py-3" role="alert">
					{error}
					<button aria-label="Dismiss error" onClick={() => setError("")}>
						×
					</button>
				</div>
			)}
			{content}
			<nav className="fixed bottom-2 left-2 right-2 z-30 grid grid-cols-4 gap-1 rounded-[20px] border border-[var(--app-line)] bg-[var(--app-surface)]/95 p-1.5 shadow-[0_14px_42px_rgba(47,43,89,0.18)] sm:hidden" aria-label="Primary navigation">
				{navigation.map((item) => (
					<button
						key={item.id}
						className={`min-w-0 rounded-[13px] border px-1 text-[0.8rem] font-bold ${page === item.id ? "border-[var(--app-purple)] bg-[var(--app-purple)] text-white" : "border-transparent bg-transparent text-[var(--app-muted)]"}`}
						aria-current={page === item.id ? "page" : undefined}
						onClick={() => setPage(item.id)}
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
					onSaveMenu={(menu, exists) => run(() => api.saveMenu(menu, exists))}
					onSave={async (meal) => {
						await run(() => api.saveMeal(meal, Boolean(editor.meal)));
						setEditor(null);
					}}
				/>
			)}
		</div>
	);
}
