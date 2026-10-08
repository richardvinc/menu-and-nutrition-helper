import { useMemo, useState } from "react";
import type { AppData, Ingredient, MemberId, MenuIngredient, Nutrition, ScheduledMeal } from "@piring-kita/shared";
import "./editor.css";
import { makeMacroRecommendation } from "./recommendation";

type EditorData = Pick<AppData, "members" | "ingredients" | "savedMenus" | "scheduledMeals" | "targets">;
export interface ScheduledMealEditorProps {
  data: EditorData;
  initialMeal?: ScheduledMeal;
  date: string;
  slot: ScheduledMeal["slot"];
  memberId?: MemberId;
  recommendation?: string;
  onSave: (meal: ScheduledMeal) => void | Promise<void>;
  onCancel: () => void;
}
const blank = (): Nutrition => ({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
const plus = (a: Nutrition, b: Nutrition) => ({ calories: a.calories + b.calories, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, fiber: a.fiber + b.fiber });
const scale = (value: Nutrition, amount: number): Nutrition => ({ calories: value.calories * amount, protein: value.protein * amount, carbs: value.carbs * amount, fat: value.fat * amount, fiber: value.fiber * amount });
const pretty = (value: number) => Math.round(value).toLocaleString();

function totalsFor(meal: ScheduledMeal, catalog: Map<string, Ingredient>): Nutrition {
  return meal.ingredients.reduce((total, row) => {
    const ingredient = catalog.get(row.ingredientId);
    return ingredient ? plus(total, scale(ingredient.nutrition, row.quantity / ingredient.basisAmount)) : total;
  }, blank());
}

function memberDayTotals(meals: ScheduledMeal[], memberId: MemberId, catalog: Map<string, Ingredient>) {
  return meals.reduce((total, meal) => {
    if (meal.slot === "dinner" && !meal.memberId) {
      const allocated = meal.ingredients.reduce((sum, row) => {
        const ingredient = catalog.get(row.ingredientId);
        if (!ingredient) return sum;
        const nutrition = scale(ingredient.nutrition, row.quantity / ingredient.basisAmount);
        const carbs = row.memberId ? (row.memberId === memberId ? nutrition.carbs : 0) : nutrition.carbs / 2;
        return plus(sum, { ...scale(nutrition, row.memberId ? 0 : .5), carbs });
      }, blank());
      return plus(total, allocated);
    }
    return meal.memberId === memberId ? plus(total, totalsFor(meal, catalog)) : total;
  }, blank());
}

function IngredientRow({ row, catalog, onChange, onRemove }: { row: MenuIngredient; catalog: Ingredient[]; onChange: (value: MenuIngredient) => void; onRemove: () => void }) {
  const selected = catalog.find((item) => item.id === row.ingredientId);
  const [query, setQuery] = useState(selected?.name ?? "");
  const results = useMemo(() => query.trim() ? catalog.filter((item) => [item.name, ...item.aliases].some((name) => name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))).slice(0, 5) : [], [catalog, query]);
  return <div className="pk-editor-row">
    <div className="pk-editor-row__ingredient"><label>Ingredient</label><input aria-label="Search ingredient catalog" value={query} placeholder="Search ingredients…" onChange={(event) => setQuery(event.target.value)} /><div className="pk-editor-row__results">{results.map((item) => <button type="button" key={item.id} onClick={() => { onChange({ ...row, ingredientId: item.id }); setQuery(item.name); }}><strong>{item.name}</strong>{item.aliases.length > 0 && <small>{item.aliases.slice(0, 2).join(" · ")}</small>}</button>)}</div>{selected && <small className="pk-editor-row__basis">Per {selected.basisAmount} {selected.unit}</small>}</div>
    <div className="pk-editor-row__quantity"><label>Quantity</label><input aria-label="Ingredient quantity" type="number" min="0" step="any" value={row.quantity} onChange={(event) => onChange({ ...row, quantity: Number(event.target.value) })} /><span>{selected?.unit ?? "unit"}</span></div>
    <button type="button" className="pk-editor-row__remove" aria-label={"Remove " + (selected?.name ?? "ingredient")} onClick={onRemove}>Remove</button>
  </div>;
}

export function ScheduledMealEditor({ data, initialMeal, date, slot, memberId, recommendation, onSave, onCancel }: ScheduledMealEditorProps) {
  const [name, setName] = useState(initialMeal?.name ?? "");
  const [notes, setNotes] = useState(initialMeal?.notes ?? "");
  const [mealDate, setMealDate] = useState(initialMeal?.date ?? date);
  const [mealSlot, setMealSlot] = useState<ScheduledMeal["slot"]>(initialMeal?.slot ?? slot);
  const [mealMember, setMealMember] = useState<MemberId | undefined>(initialMeal?.memberId ?? memberId);
  const [rows, setRows] = useState<MenuIngredient[]>(initialMeal?.ingredients ?? []);
  const [saving, setSaving] = useState(false);
  const [savedMenu, setSavedMenu] = useState("");
  const catalog = useMemo(() => new Map(data.ingredients.map((item) => [item.id, item])), [data.ingredients]);
  const weekend = [0, 6].includes(new Date(mealDate + "T12:00:00").getDay());
  const meal: ScheduledMeal = { id: initialMeal?.id ?? "draft", date: mealDate, slot: mealSlot, memberId: mealSlot === "dinner" ? undefined : mealMember, name, notes, ingredients: rows };
  const mealTotal = totalsFor(meal, catalog);
  const dayMeals = data.scheduledMeals.filter((item) => item.date === mealDate && item.id !== initialMeal?.id);
  const memberTotals = data.members.map((member) => {
    const proposed = memberDayTotals([...dayMeals, meal], member.id, catalog);
    const target = weekend ? undefined : data.targets.filter((item) => item.memberId === member.id && item.weekStart <= mealDate).sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
    return { member, proposed, target, remaining: target ? target.weekdayCalories - proposed.calories : undefined };
  });
  const automaticRecommendation = memberTotals
    .filter((entry) => mealSlot === "dinner" || entry.member.id === mealMember)
    .map((entry) => entry.target && makeMacroRecommendation(entry.member.name, entry.proposed, entry.target, data.ingredients))
    .find(Boolean);
  const addRow = () => setRows((current) => [...current, { ingredientId: "", quantity: 0 }]);
  const updateRow = (index: number, value: MenuIngredient) => setRows((current) => current.map((row, i) => i === index ? value : row));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || rows.some((row) => !row.ingredientId || !Number.isFinite(row.quantity) || row.quantity <= 0)) return;
    setSaving(true);
    try { await onSave({ ...meal, id: initialMeal?.id ?? crypto.randomUUID(), name: name.trim() }); } finally { setSaving(false); }
  };

  return <div className="pk-editor-scrim"><form className="pk-editor" onSubmit={save} aria-labelledby="pk-editor-title">
    <header className="pk-editor__header"><button type="button" className="pk-editor__back" onClick={onCancel}>← <span>Cancel</span></button><div><p className="pk-editor__eyebrow">{initialMeal ? "SCHEDULED MEAL" : "NEW SCHEDULED MEAL"}</p><h1 id="pk-editor-title">{initialMeal ? "Edit meal" : "Plan a meal"}</h1></div><span className="pk-editor__header-note">A saved copy for this day</span></header>
    <div className="pk-editor__body"><section className="pk-editor__form">
      <div className="pk-editor__fields"><label>Meal name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Name this meal" /></label><label>Date<input type="date" required value={mealDate} onChange={(event) => setMealDate(event.target.value)} /></label><label>Meal slot<select value={mealSlot} onChange={(event) => setMealSlot(event.target.value as ScheduledMeal["slot"])}><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option></select></label>{mealSlot !== "dinner" && <label>For<select value={mealMember ?? ""} onChange={(event) => setMealMember(event.target.value as MemberId)}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}</div>
      <section className="pk-editor__ingredients"><div className="pk-editor__section-heading"><div><p className="pk-editor__eyebrow">THE DISH</p><h2>Ingredients</h2></div><button type="button" onClick={() => setSavedMenu(savedMenu ? "" : "choose")}>＋ Copy saved menu</button></div>{savedMenu && <div className="pk-editor__copy"><label htmlFor="pk-menu-copy">Start with a saved menu</label><select id="pk-menu-copy" value={savedMenu === "choose" ? "" : savedMenu} onChange={(event) => { setSavedMenu(event.target.value); const menu = data.savedMenus.find((item) => item.id === event.target.value); if (menu) { setName(name || menu.name); setRows(menu.ingredients.map((row) => ({ ...row }))); } }}><option value="">Choose a saved menu</option>{data.savedMenus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}</select><button type="button" onClick={() => setSavedMenu("")}>Close</button></div>}
        {rows.map((row, index) => <div className="pk-editor__row-wrap" key={index}><IngredientRow row={row} catalog={data.ingredients} onChange={(value) => updateRow(index, value)} onRemove={() => setRows((current) => current.filter((_, i) => i !== index))} />{mealSlot === "dinner" && <label className="pk-editor__carb-owner">Carbohydrate portion<select aria-label="Ingredient carbohydrate allocation" value={row.memberId ?? ""} onChange={(event) => updateRow(index, { ...row, memberId: event.target.value ? event.target.value as MemberId : undefined })}><option value="">Split equally</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name} receives the carbohydrates</option>)}</select></label>}</div>)}<button type="button" className="pk-editor__add" onClick={addRow}>＋ Add ingredient</button>
      </section>
      <label className="pk-editor__notes">Cooking notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Notes for this scheduled meal only" /></label>
    </section>
    <aside className="pk-editor__summary"><section className="pk-editor__totals"><p className="pk-editor__eyebrow">LIVE MEAL TOTALS</p><h2>Nutrition in this meal</h2><div className="pk-editor__calories"><strong>{pretty(mealTotal.calories)}</strong><span>kcal</span></div><dl>{([["Protein", mealTotal.protein], ["Carbohydrate", mealTotal.carbs], ["Fat", mealTotal.fat], ["Fiber", mealTotal.fiber]] as [string, number][]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{pretty(value)} g</dd></div>)}</dl></section>
      <section className="pk-editor__after"><p className="pk-editor__eyebrow">{weekend ? "WEEKEND PLAN" : "PLANNED TARGET PROGRESS"}</p><h2>After this meal</h2><p className="pk-editor__caption">This day’s other scheduled meals are included. Planned nutrition is not actual intake.{weekend ? " Weekend targets are self-managed." : ""}</p>{memberTotals.filter((entry) => mealSlot === "dinner" || entry.member.id === mealMember).map(({ member, proposed, target, remaining }) => <div className="pk-editor__member" key={member.id}><div><strong>{member.name}</strong><span>{target ? pretty(proposed.calories) + " / " + pretty(target.weekdayCalories) + " kcal" : pretty(proposed.calories) + " kcal planned"}</span></div>{target && <div className="pk-editor__bar"><span style={{ width: Math.min(100, proposed.calories / Math.max(1, target.weekdayCalories) * 100) + "%" }} /></div>}<small>{pretty(proposed.protein)} g protein · {remaining !== undefined ? pretty(remaining) + " kcal remaining" : weekend ? "Targets are not evaluated" : "No target for this week"}</small></div>)}</section>
      {(recommendation || automaticRecommendation) && <section className="pk-editor__recommendation"><p className="pk-editor__eyebrow">ONE OPTIONAL IDEA</p><p>{recommendation || automaticRecommendation}</p></section>}
    </aside></div>
    <footer className="pk-editor__footer"><button type="button" onClick={onCancel}>Cancel</button><button type="submit" disabled={saving || !name.trim() || rows.some((row) => !row.ingredientId || row.quantity <= 0)}>{saving ? "Saving…" : "Save scheduled meal"}</button></footer>
  </form></div>;
}
