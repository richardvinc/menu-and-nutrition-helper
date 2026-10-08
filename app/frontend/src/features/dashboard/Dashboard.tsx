import { useMemo, useState } from "react";
import type { AppData, Ingredient, MemberId, Nutrition, ScheduledMeal } from "@piring-kita/shared";
import "./dashboard.css";

type DashboardData = Pick<AppData, "members" | "ingredients" | "scheduledMeals">;

export interface DashboardProps {
  data: DashboardData;
  today?: Date;
  onOpenWeek: () => void;
  onEditMeal: (meal: ScheduledMeal) => void;
  onCreateMeal?: (date: string, slot: ScheduledMeal["slot"], memberId?: MemberId) => void;
}

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const mondayOf = (date: Date) => {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return monday;
};
const blankNutrition = (): Nutrition => ({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
const addNutrition = (to: Nutrition, value: Nutrition) => {
  to.calories += value.calories;
  to.protein += value.protein;
  to.carbs += value.carbs;
  to.fat += value.fat;
  to.fiber += value.fiber;
};
const fmt = (value: number) => Math.round(value).toLocaleString();
const dateLabel = (date: Date) => date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

function mealNutrition(meal: ScheduledMeal, ingredients: Map<string, Ingredient>): Nutrition {
  const total = blankNutrition();
  for (const row of meal.ingredients) {
    const ingredient = ingredients.get(row.ingredientId);
    if (!ingredient) continue;
    const factor = row.quantity / ingredient.basisAmount;
    addNutrition(total, {
      calories: ingredient.nutrition.calories * factor,
      protein: ingredient.nutrition.protein * factor,
      carbs: ingredient.nutrition.carbs * factor,
      fat: ingredient.nutrition.fat * factor,
      fiber: ingredient.nutrition.fiber * factor,
    });
  }
  return total;
}

export function Dashboard({ data, today = new Date(), onOpenWeek, onEditMeal, onCreateMeal }: DashboardProps) {
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const selectedDate = new Date(today);
  selectedDate.setDate(today.getDate() + selectedOffset);
  const date = dayKey(selectedDate);
  const members = new Map(data.members.map((member) => [member.id, member]));
  const ingredients = new Map(data.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const meals = data.scheduledMeals.filter((meal) => meal.date === date).sort((a, b) => ["lunch", "dinner", "snack"].indexOf(a.slot) - ["lunch", "dinner", "snack"].indexOf(b.slot));
  const aggregates = useMemo(() => {
    const combined = new Map<string, { ingredient: Ingredient; quantity: number }>();
    for (const meal of meals) for (const row of meal.ingredients) {
      const ingredient = ingredients.get(row.ingredientId);
      if (!ingredient) continue;
      const key = `${ingredient.id}:${ingredient.unit}:${ingredient.basisAmount}`;
      const current = combined.get(key);
      if (current) current.quantity += row.quantity;
      else combined.set(key, { ingredient, quantity: row.quantity });
    }
    return [...combined.entries()].map(([key, item]) => ({ ...item, key }));
  }, [date, data.scheduledMeals, data.ingredients]);
  const weekDate = new Date(today);
  if (today.getDay() === 0) weekDate.setDate(today.getDate() + 1);
  const weekStart = dayKey(mondayOf(weekDate));
  const weekDays = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(`${weekStart}T12:00:00`);
    day.setDate(day.getDate() + offset);
    const key = dayKey(day);
    return { day, key, meals: data.scheduledMeals.filter((meal) => meal.date === key).sort((a, b) => ["lunch", "dinner", "snack"].indexOf(a.slot) - ["lunch", "dinner", "snack"].indexOf(b.slot)) };
  });

  return <main className="pk-dashboard">
    <header className="pk-dashboard__header">
      <div><p className="pk-eyebrow">PIRING KITA · PLANNING</p><h1>Good food, ready when you are.</h1><p className="pk-muted">Your plan for today and tomorrow.</p></div>
      <button className="pk-button pk-button--primary" onClick={onOpenWeek}>Open weekly planner <span aria-hidden="true">↗</span></button>
    </header>

    <nav className="pk-day-switch" aria-label="Choose preparation day">
      {[0, 1].map((offset) => { const day = new Date(today); day.setDate(today.getDate() + offset); return <button key={offset} className={selectedOffset === offset ? "is-selected" : ""} aria-pressed={selectedOffset === offset} onClick={() => setSelectedOffset(offset)}><span>{offset === 0 ? "TODAY" : "TOMORROW"}</span><strong>{day.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</strong></button>; })}
    </nav>

    <div className="pk-dashboard__layout">
      <section className="pk-panel pk-meals" aria-labelledby="pk-meals-heading">
        <div className="pk-panel__heading"><div><p className="pk-eyebrow">{dateLabel(selectedDate)}</p><h2 id="pk-meals-heading">Meals on the plan</h2></div><span className="pk-count">{meals.length} planned</span></div>
      {meals.length ? <div className="pk-meals__list">{meals.map((meal) => {
          const memberLabel = meal.slot === "dinner" && !meal.memberId ? "Shared dinner" : members.get(meal.memberId ?? "richard")?.name ?? "Household";
          return <details className={`pk-meal pk-meal--${meal.slot}`} key={meal.id}>
            <summary><span className="pk-meal__icon" aria-hidden="true">{meal.slot === "dinner" ? "◒" : meal.slot === "snack" ? "✳" : "◉"}</span><span className="pk-meal__main"><span className="pk-meal__meta">{memberLabel} · {meal.slot}</span><strong>{meal.name}</strong><span className="pk-meal__calories">{fmt(mealNutrition(meal, ingredients).calories)} kcal planned</span></span><span className="pk-meal__chevron" aria-hidden="true">⌄</span></summary>
            <div className="pk-meal__detail"><ul>{meal.ingredients.map((row, index) => { const ingredient = ingredients.get(row.ingredientId); return <li key={`${row.ingredientId}-${index}`}><span>{ingredient?.name ?? "Unknown ingredient"}</span><span>{row.quantity} {ingredient?.unit ?? ""}</span></li>; })}</ul><button className="pk-text-button" onClick={() => onEditMeal(meal)}>Edit scheduled meal</button></div>
          </details>;
        })}</div> : <div className="pk-empty"><span aria-hidden="true">☼</span><strong>A little room in the plan.</strong><p>No meals are scheduled for this day yet.</p>{onCreateMeal && <button className="pk-text-button" onClick={() => onCreateMeal(date, "lunch", "richard")}>Add a meal</button>}</div>}
      </section>

      <aside className="pk-dashboard__side">
        <section className="pk-panel pk-prep" aria-labelledby="pk-prep-heading">
          <div className="pk-panel__heading"><div><p className="pk-eyebrow">READY TO PREP</p><h2 id="pk-prep-heading">Ingredient list</h2></div><span aria-hidden="true" className="pk-prep__spark">✳</span></div>
          {aggregates.length ? <ul>{aggregates.map(({ key, ingredient, quantity }) => <li key={key}><label><input type="checkbox" checked={Boolean(checked[`${date}:${key}`])} onChange={(event) => setChecked((current) => ({ ...current, [`${date}:${key}`]: event.target.checked }))} /><span className="pk-prep__name">{ingredient.name}<small>{ingredient.preparation || "For today’s meals"}</small></span><strong>{quantity} {ingredient.unit}</strong></label></li>)}</ul> : <p className="pk-muted">Add a scheduled meal and its ingredients will collect here.</p>}
          <p className="pk-prep__footnote">Combined by ingredient and nutrition basis.</p>
        </section>
      </aside>
    </div>

    <section className="pk-panel pk-week-summary" aria-labelledby="pk-week-summary-heading">
      <div className="pk-panel__heading"><div><p className="pk-eyebrow">THIS WEEK</p><h2 id="pk-week-summary-heading">Weekly menu</h2></div><button className="pk-text-button" onClick={onOpenWeek}>Edit weekly plan</button></div>
      <div className="pk-week-summary__scroll"><div className="pk-week-summary__grid">{weekDays.map(({ day, key, meals: dayMeals }) => <section className={key === dayKey(today) ? "is-today" : ""} key={key}>
        <header><span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span><strong>{day.getDate()}</strong></header>
        {dayMeals.length ? <ul>{dayMeals.map((meal) => <li key={meal.id}><button onClick={() => onEditMeal(meal)}><small>{meal.slot}</small><span>{meal.name}</span></button></li>)}</ul> : <p>No meals</p>}
      </section>)}</div></div>
    </section>
  </main>;
}
