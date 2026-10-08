import { useEffect, useState } from "react";
import type { AppData, Ingredient, MemberId, SavedMenu, ScheduledMeal, TargetPreviewRequest } from "@piring-kita/shared";
import { api } from "./api";
import { Dashboard } from "./features/dashboard/Dashboard";
import { ScheduledMealEditor } from "./features/editor/ScheduledMealEditor";
import { Library } from "./features/library";
import { Targets } from "./features/targets";
import { WeeklyPlanner } from "./features/week/WeeklyPlanner";

type Page = "today" | "week" | "library" | "targets";
type EditorState = { meal?: ScheduledMeal; date: string; slot: ScheduledMeal["slot"]; memberId?: MemberId };

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const monday = (date: Date) => {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
};
const addDays = (date: Date, count: number) => { const result = new Date(date); result.setDate(result.getDate() + count); return result; };

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [page, setPage] = useState<Page>("today");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState("");

  const reload = async () => { setData(await api.data()); };
  useEffect(() => { reload().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load the meal plan.")); }, []);

  const run = async (action: () => Promise<unknown>) => {
    setError("");
    try { await action(); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The change could not be saved."); throw reason; }
  };

  const today = new Date();
  const weekDate = today.getDay() === 0 ? addDays(today, 1) : today;
  const weekStart = dateKey(monday(weekDate));
  const effectiveWeek = dateKey(addDays(monday(today), 7));
  const navigation: { id: Page; label: string }[] = [
    { id: "today", label: "Today" }, { id: "week", label: "Week" },
    { id: "library", label: "Library" }, { id: "targets", label: "Targets" },
  ];

  if (!data) return <main className="app-state"><div className="brand-mark">P</div><h1>Piring Kita</h1><p>{error || "Loading meal planner…"}</p>{error && <button onClick={() => reload().catch(() => undefined)}>Try again</button>}</main>;

  const openEditor = (date: string, slot: ScheduledMeal["slot"], memberId?: MemberId, meal?: ScheduledMeal) => setEditor({ meal, date, slot, memberId });
  const content = page === "today" ? <Dashboard data={data} today={today} onOpenWeek={() => setPage("week")} onEditMeal={(meal) => openEditor(meal.date, meal.slot, meal.memberId, meal)} onCreateMeal={(date, slot, memberId) => openEditor(date, slot, memberId)} />
    : page === "week" ? <WeeklyPlanner data={data} weekStart={weekStart} onEditMeal={(meal) => openEditor(meal.date, meal.slot, meal.memberId, meal)} onCreateMeal={(date, slot, memberId) => openEditor(date, slot, memberId)} onMoveMeal={(id, date) => run(() => api.moveMeal(id, date))} />
    : page === "library" ? <Library menus={data.savedMenus} ingredients={data.ingredients}
      onSaveMenu={(menu: SavedMenu) => run(() => api.saveMenu(menu, data.savedMenus.some((item) => item.id === menu.id)))}
      onDeleteMenu={(id) => run(() => api.deleteMenu(id))}
      onSaveIngredient={(ingredient: Ingredient) => run(() => api.saveIngredient(ingredient, data.ingredients.some((item) => item.id === ingredient.id)))}
      onDeleteIngredient={(id) => run(() => api.deleteIngredient(id))} />
    : <Targets members={data.members} targets={data.targets} effectiveWeek={effectiveWeek}
      onPreview={api.previewTarget}
      onApply={(request: TargetPreviewRequest) => run(() => api.applyTarget(request))} />;

  return <div className="app-shell">
    <header className="app-header"><button className="app-brand" onClick={() => setPage("today")}><span className="brand-mark">P</span><span><strong>Piring Kita</strong><small>Simple meal planning for the week</small></span></button><nav aria-label="Primary navigation">{navigation.map((item) => <button key={item.id} className={page === item.id ? "is-current" : ""} aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)}>{item.label}</button>)}</nav></header>
    {error && <div className="app-error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}
    {content}
    <nav className="app-mobile-nav" aria-label="Primary navigation">{navigation.map((item) => <button key={item.id} className={page === item.id ? "is-current" : ""} aria-current={page === item.id ? "page" : undefined} onClick={() => setPage(item.id)}>{item.label}</button>)}</nav>
    {editor && <ScheduledMealEditor data={data} initialMeal={editor.meal} date={editor.date} slot={editor.slot} memberId={editor.memberId} onCancel={() => setEditor(null)} onSave={async (meal) => { await run(() => api.saveMeal(meal, Boolean(editor.meal))); setEditor(null); }} />}
  </div>;
}
