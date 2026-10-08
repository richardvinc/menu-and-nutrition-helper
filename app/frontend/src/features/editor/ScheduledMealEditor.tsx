import type {
	AppData,
	Ingredient,
	MemberId,
	MenuIngredient,
	Nutrition,
	SavedMenu,
	ScheduledMeal,
} from "@piring-kita/shared";
import { useEffect, useMemo, useState } from "react";


type EditorData = Pick<
	AppData,
	"members" | "ingredients" | "savedMenus" | "scheduledMeals" | "targets"
>;
export interface ScheduledMealEditorProps {
	data: EditorData;
	initialMeal?: ScheduledMeal;
	date: string;
	slot: ScheduledMeal["slot"];
	memberId?: MemberId;
	onSave: (meal: ScheduledMeal) => void | Promise<void>;
	onSaveMenu: (menu: SavedMenu, exists: boolean) => void | Promise<void>;
	onCancel: () => void;
}
const blank = (): Nutrition => ({
	calories: 0,
	protein: 0,
	carbs: 0,
	fat: 0,
	fiber: 0,
});
const plus = (a: Nutrition, b: Nutrition) => ({
	calories: a.calories + b.calories,
	protein: a.protein + b.protein,
	carbs: a.carbs + b.carbs,
	fat: a.fat + b.fat,
	fiber: a.fiber + b.fiber,
});
const scale = (value: Nutrition, amount: number): Nutrition => ({
	calories: value.calories * amount,
	protein: value.protein * amount,
	carbs: value.carbs * amount,
	fat: value.fat * amount,
	fiber: value.fiber * amount,
});
const pretty = (value: number) => Math.round(value).toLocaleString();
const nutrientProgress = (current: number, target?: number) =>
	`${pretty(current)}${target === undefined ? "" : ` / ${pretty(target)}`} g`;
const focusFirstSuggestion = (event: React.KeyboardEvent<HTMLInputElement>) => {
	if (event.key !== "ArrowDown") return;
	const option =
		event.currentTarget.parentElement?.querySelector<HTMLElement>(
			"[role=option]",
		);
	if (option) {
		event.preventDefault();
		option.focus();
	}
};
type CarbDraft = Record<MemberId, { ingredientId: string; quantity: string }>;

function totalsFor(
	meal: ScheduledMeal,
	catalog: Map<string, Ingredient>,
): Nutrition {
	return meal.ingredients.reduce((total, row) => {
		const ingredient = catalog.get(row.ingredientId);
		return ingredient
			? plus(
					total,
					scale(ingredient.nutrition, row.quantity / ingredient.basisAmount),
				)
			: total;
	}, blank());
}

function memberDayTotals(
	meals: ScheduledMeal[],
	memberId: MemberId,
	catalog: Map<string, Ingredient>,
) {
	return meals.reduce((total, meal) => {
		if (meal.slot === "dinner" && !meal.memberId)
			return plus(total, scale(totalsFor(meal, catalog), 0.5));
		return meal.memberId === memberId
			? plus(total, totalsFor(meal, catalog))
			: total;
	}, blank());
}

function IngredientRow({
	row,
	catalog,
	onChange,
	onRemove,
}: {
	row: MenuIngredient;
	catalog: Ingredient[];
	onChange: (value: MenuIngredient) => void;
	onRemove: () => void;
}) {
	const selected = catalog.find((item) => item.id === row.ingredientId);
	const [query, setQuery] = useState(selected?.name ?? "");
	const [focused, setFocused] = useState(false);
	const results = useMemo(
		() =>
			query.trim()
				? catalog
						.filter((item) =>
							[item.name, ...item.aliases].some((name) =>
								name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
							),
						)
						.slice(0, 5)
				: [],
		[catalog, query],
	);
	return (
		<div className="relative grid grid-cols-1 items-start gap-2.5 border-t border-[var(--app-line)] py-3 sm:grid-cols-[minmax(0,1fr)_145px_auto]">
			<div
				className="relative grid gap-1.5"
				onFocus={() => setFocused(true)}
				onBlur={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as Node))
						setFocused(false);
				}}
			>
				<label>Ingredient</label>
				<input
					aria-label="Search ingredient catalog"
					value={query}
					placeholder="Search ingredients…"
					onKeyDown={focusFirstSuggestion}
					onChange={(event) => {
						setQuery(event.target.value);
						setFocused(true);
					}}
				/>
				{focused && (
					<div
						className="absolute left-0 right-0 top-full z-10 grid max-h-[210px] overflow-auto rounded-lg border border-[var(--app-line)] bg-[var(--app-surface)] shadow-lg"
						role="listbox"
						aria-label="Ingredient suggestions"
					>
						{results.map((item) => (
							<button
								type="button"
								role="option"
								key={item.id}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => {
									onChange({ ...row, ingredientId: item.id });
									setQuery(item.name);
									setFocused(false);
								}}
							>
								<strong>{item.name}</strong>
								{item.aliases.length > 0 && (
									<small>{item.aliases.slice(0, 2).join(" · ")}</small>
								)}
							</button>
						))}
					</div>
				)}
				{selected && (
					<small className="text-[9px] text-[var(--app-muted)]">
						Per {selected.basisAmount} {selected.unit}
					</small>
				)}
			</div>
			<div className="relative grid grid-cols-[1fr_auto] gap-1.5">
				<label>Quantity</label>
				<input
					aria-label="Ingredient quantity"
					type="number"
					min="0"
					step="any"
					value={row.quantity}
					onChange={(event) =>
						onChange({ ...row, quantity: Number(event.target.value) })
					}
				/>
				<span>{selected?.unit ?? "unit"}</span>
			</div>
			<button
				type="button"
				className="mt-[15px] min-h-10 border-0 bg-transparent px-2 text-[10px] text-[#946557] underline"
				aria-label={`Remove ${selected?.name ?? "ingredient"}`}
				onClick={onRemove}
			>
				Remove
			</button>
		</div>
	);
}

export function ScheduledMealEditor({
	data,
	initialMeal,
	date,
	slot,
	memberId,
	onSave,
	onSaveMenu,
	onCancel,
}: ScheduledMealEditorProps) {
	const [name, setName] = useState(initialMeal?.name ?? "");
	const [notes, setNotes] = useState(initialMeal?.notes ?? "");
	const [mealDate, setMealDate] = useState(initialMeal?.date ?? date);
	const [mealSlot, setMealSlot] = useState<ScheduledMeal["slot"]>(
		initialMeal?.slot ?? slot,
	);
	const [mealMember, setMealMember] = useState<MemberId | undefined>(
		initialMeal?.memberId ?? memberId,
	);
	const [rows, setRows] = useState<MenuIngredient[]>(
		initialMeal?.slot === "dinner"
			? initialMeal.ingredients.filter((row) => !row.memberId)
			: (initialMeal?.ingredients ?? []),
	);
	const [carbs, setCarbs] = useState<CarbDraft>(() => ({
		richard: (() => {
			const row =
				initialMeal?.slot === "dinner"
					? initialMeal.ingredients.find((item) => item.memberId === "richard")
					: undefined;
			return {
				ingredientId: row?.ingredientId ?? "",
				quantity: row ? String(row.quantity) : "",
			};
		})(),
		michelle: (() => {
			const row =
				initialMeal?.slot === "dinner"
					? initialMeal.ingredients.find((item) => item.memberId === "michelle")
					: undefined;
			return {
				ingredientId: row?.ingredientId ?? "",
				quantity: row ? String(row.quantity) : "",
			};
		})(),
	}));
	const [saving, setSaving] = useState(false);
	const [savingMenu, setSavingMenu] = useState(false);
	const [menuStatus, setMenuStatus] = useState<{
		fingerprint: string;
		message: string;
	} | null>(null);
	const [nameFocused, setNameFocused] = useState(false);
	useEffect(() => {
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") onCancel();
		};
		document.addEventListener("keydown", closeOnEscape);
		return () => document.removeEventListener("keydown", closeOnEscape);
	}, [onCancel]);
	const catalog = useMemo(
		() => new Map(data.ingredients.map((item) => [item.id, item])),
		[data.ingredients],
	);
	const menuResults = useMemo(
		() =>
			name.trim()
				? data.savedMenus
						.filter(
							(menu) =>
								menu.slot === mealSlot &&
								menu.name
									.toLocaleLowerCase()
									.includes(name.trim().toLocaleLowerCase()),
						)
						.slice(0, 5)
				: [],
		[data.savedMenus, mealSlot, name],
	);
	const carbohydrateIngredients = data.ingredients.filter(
		(item) => item.unit === "g" && item.nutrition.carbs > 0,
	);
	const weekend = [0, 6].includes(new Date(`${mealDate}T12:00:00`).getDay());
	const carbRows =
		mealSlot === "dinner"
			? data.members.flatMap((member) =>
					carbs[member.id].ingredientId && Number(carbs[member.id].quantity) > 0
						? [
								{
									ingredientId: carbs[member.id].ingredientId,
									quantity: Number(carbs[member.id].quantity),
									memberId: member.id,
								},
							]
						: [],
				)
			: [];
	const meal: ScheduledMeal = {
		id: initialMeal?.id ?? "draft",
		date: mealDate,
		slot: mealSlot,
		memberId: mealSlot === "dinner" ? undefined : mealMember,
		name,
		notes,
		ingredients: [...rows, ...carbRows],
	};
	const mealTotal = totalsFor(meal, catalog);
	const dayMeals = data.scheduledMeals.filter(
		(item) => item.date === mealDate && item.id !== initialMeal?.id,
	);
	const progressMeals = [
		...dayMeals.filter(
			(item) => item.slot === "lunch" || item.slot === "dinner",
		),
		...(meal.slot === "lunch" || meal.slot === "dinner" ? [meal] : []),
	];
	const memberTotals = data.members.map((member) => {
		const proposed = memberDayTotals(progressMeals, member.id, catalog);
		const target = weekend
			? undefined
			: data.targets
					.filter(
						(item) => item.memberId === member.id && item.weekStart <= mealDate,
					)
					.sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
		return {
			member,
			proposed,
			target,
			remaining: target
				? target.weekdayCalories - proposed.calories
				: undefined,
		};
	});
	const addRow = () =>
		setRows((current) => [...current, { ingredientId: "", quantity: 0 }]);
	const updateRow = (index: number, value: MenuIngredient) =>
		setRows((current) => current.map((row, i) => (i === index ? value : row)));
	const applySavedMenu = (menuId: string) => {
		const menu = data.savedMenus.find((item) => item.id === menuId);
		if (!menu) return;
		setName(menu.name);
		setRows(
			menu.ingredients
				.filter((row) => mealSlot !== "dinner" || !row.memberId)
				.map((row) => ({
					...row,
					...(mealSlot === "dinner" ? {} : { memberId: undefined }),
				})),
		);
		if (mealSlot === "dinner")
			setCarbs({
				richard: (() => {
					const row = menu.ingredients.find(
						(item) => item.memberId === "richard",
					);
					return {
						ingredientId: row?.ingredientId ?? "",
						quantity: row ? String(row.quantity) : "",
					};
				})(),
				michelle: (() => {
					const row = menu.ingredients.find(
						(item) => item.memberId === "michelle",
					);
					return {
						ingredientId: row?.ingredientId ?? "",
						quantity: row ? String(row.quantity) : "",
					};
				})(),
			});
	};
	const invalidCarbs =
		mealSlot === "dinner" &&
		data.members.some(
			(member) =>
				Boolean(carbs[member.id].ingredientId) !==
					Boolean(carbs[member.id].quantity) ||
				(Boolean(carbs[member.id].quantity) &&
					(!Number.isFinite(Number(carbs[member.id].quantity)) ||
						Number(carbs[member.id].quantity) <= 0)),
		);
	const invalidMeal =
		!name.trim() ||
		invalidCarbs ||
		rows.some(
			(row) =>
				!row.ingredientId ||
				!Number.isFinite(row.quantity) ||
				row.quantity <= 0,
		);
	const menuFingerprint = JSON.stringify([
		name.trim(),
		mealSlot,
		mealMember,
		meal.ingredients,
	]);
	const saveToMasterMenu = async () => {
		if (invalidMeal) return;
		const existing = data.savedMenus.find(
			(menu) =>
				menu.slot === mealSlot &&
				menu.name.trim().toLocaleLowerCase() ===
					name.trim().toLocaleLowerCase(),
		);
		const menu: SavedMenu = {
			id: existing?.id ?? Date.now().toString(),
			name: name.trim(),
			slot: mealSlot,
			...(mealSlot === "dinner" || !mealMember ? {} : { memberId: mealMember }),
			ingredients: meal.ingredients.map((row) => ({ ...row })),
		};
		setSavingMenu(true);
		try {
			await onSaveMenu(menu, Boolean(existing));
			setMenuStatus({
				fingerprint: menuFingerprint,
				message: existing ? "Master menu updated." : "Saved to master menu.",
			});
		} finally {
			setSavingMenu(false);
		}
	};
	const save = async (event: React.FormEvent) => {
		event.preventDefault();
		if (invalidMeal) return;
		setSaving(true);
		try {
			await onSave({
				...meal,
				id: initialMeal?.id ?? Date.now().toString(),
				name: name.trim(),
			});
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className="fixed inset-0 z-20 flex justify-center overflow-auto bg-[#211a578c] p-4"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onCancel();
			}}
		>
			<form
				className="relative flex min-h-[calc(100vh-32px)] w-full max-w-[1120px] flex-col rounded-[22px] bg-[var(--app-surface)] text-[var(--app-ink)] shadow-[0_28px_90px_rgba(35,28,86,.3)]"
				onSubmit={save}
				aria-labelledby="pk-editor-title"
			>
				<header className="grid grid-cols-1 items-center gap-[18px] rounded-t-[22px] border-b border-[var(--app-line)] bg-[var(--app-surface)] px-6 py-5 sm:grid-cols-[1fr_auto_1fr]">
					<button type="button" className="justify-self-start border-0 bg-transparent text-[13px] font-semibold text-[var(--app-purple)]" onClick={onCancel}>
						← <span>Cancel</span>
					</button>
					<div>
						<p className="mb-1.5 text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--app-purple)]">
							{initialMeal ? "SCHEDULED MEAL" : "NEW SCHEDULED MEAL"}
						</p>
						<h1 id="pk-editor-title">
							{initialMeal ? "Edit meal" : "Plan a meal"}
						</h1>
					</div>
					<span className="justify-self-end text-[11px] text-[var(--app-muted)]">
						A saved copy for this day
					</span>
				</header>
				<div className="grid flex-1 items-start gap-[22px] px-6 py-5 sm:grid-cols-[minmax(0,1.5fr)_minmax(290px,.8fr)]">
					<section className="grid content-start gap-[18px]">
						<div className="grid grid-cols-1 gap-3.5 rounded-[18px] border border-[var(--app-line)] bg-[var(--app-surface)] p-[18px] shadow-[0_10px_28px_rgba(47,43,89,.06)] sm:grid-cols-2">
							<div
								className="relative grid gap-1.5"
								onFocus={() => setNameFocused(true)}
								onBlur={(event) => {
									if (
										!event.currentTarget.contains(event.relatedTarget as Node)
									)
										setNameFocused(false);
								}}
							>
								<label htmlFor="pk-meal-name">Meal name</label>
								<input
									id="pk-meal-name"
									required
									value={name}
									onKeyDown={focusFirstSuggestion}
									onChange={(event) => {
										setName(event.target.value);
										setNameFocused(true);
									}}
									placeholder="Type to find a saved menu"
									autoComplete="off"
								/>
								{nameFocused && (
									<div
										className="absolute left-0 right-0 top-full z-10 grid max-h-[210px] overflow-auto rounded-lg border border-[var(--app-line)] bg-[var(--app-surface)] shadow-lg"
										role="listbox"
										aria-label="Saved menu suggestions"
									>
										{menuResults.map((menu) => (
											<button
												type="button"
												role="option"
												key={menu.id}
												onMouseDown={(event) => event.preventDefault()}
												onClick={() => {
													applySavedMenu(menu.id);
													setNameFocused(false);
												}}
											>
												<strong>{menu.name}</strong>
												<small>
													{menu.slot.toUpperCase()}
													{menu.memberId
														? ` · ${data.members.find((member) => member.id === menu.memberId)?.name ?? menu.memberId}`
														: ""}{" "}
													· {menu.ingredients.length} ingredients
												</small>
											</button>
										))}
									</div>
								)}
							</div>
							<label>
								Date
								<input
									type="date"
									required
									value={mealDate}
									onChange={(event) => setMealDate(event.target.value)}
								/>
							</label>
							<label>
								Meal slot
								<select
									value={mealSlot}
									onChange={(event) =>
										setMealSlot(event.target.value as ScheduledMeal["slot"])
									}
								>
									<option value="lunch">Lunch</option>
									<option value="dinner">Dinner</option>
									<option value="snack">Snack</option>
								</select>
							</label>
							{mealSlot !== "dinner" && (
								<label>
									For
									<select
										value={mealMember ?? ""}
										onChange={(event) =>
											setMealMember(event.target.value as MemberId)
										}
									>
										{data.members.map((member) => (
											<option key={member.id} value={member.id}>
												{member.name}
											</option>
										))}
									</select>
								</label>
							)}
						</div>
						<section className="rounded-[18px] border border-[var(--app-line)] bg-[var(--app-surface)] p-[18px] shadow-[0_10px_28px_rgba(47,43,89,.06)]">
							<p className="mb-1.5 text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--app-purple)]">THE DISH</p>
							{mealSlot === "dinner" && (
								<section
									className="my-2 rounded-[14px] border border-[var(--app-line)] bg-[#f7f5ff] p-4"
									aria-labelledby="pk-carbs-title"
								>
									<h2 id="pk-carbs-title">Carbohydrates</h2>
									<p>Optional portions for each person.</p>
									{data.members.map((member) => (
										<div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_150px]" key={member.id}>
											<label>
												{member.name}
												<select
													aria-label={`${member.name} carbohydrate`}
													value={carbs[member.id].ingredientId}
													onChange={(event) =>
														setCarbs((current) => ({
															...current,
															[member.id]: {
																...current[member.id],
																ingredientId: event.target.value,
															},
														}))
													}
												>
													<option value="">No carbohydrate</option>
													{carbohydrateIngredients.map((item) => (
														<option key={item.id} value={item.id}>
															{item.name}
														</option>
													))}
												</select>
											</label>
											<label>
												Quantity (g)
												<input
													aria-label={`${member.name} carbohydrate quantity`}
													type="number"
													min="0"
													step="any"
													value={carbs[member.id].quantity}
													onChange={(event) =>
														setCarbs((current) => ({
															...current,
															[member.id]: {
																...current[member.id],
																quantity: event.target.value,
															},
														}))
													}
												/>
											</label>
										</div>
									))}
								</section>
							)}
							<div className="mb-2.5 flex items-center justify-between gap-2.5">
								<h2>Ingredients</h2>
							</div>
							{rows.map((row, index) => (
								<div
									className="border-t border-[var(--app-line)]"
									key={`${index}-${row.ingredientId}`}
								>
									<IngredientRow
										row={row}
										catalog={data.ingredients}
										onChange={(value) => updateRow(index, value)}
										onRemove={() =>
											setRows((current) =>
												current.filter((_, i) => i !== index),
											)
										}
									/>
								</div>
							))}
							<button type="button" className="min-h-[42px] w-full rounded-lg border border-dashed border-[#d6ddd2] bg-[#fbfcf9] text-[11px] text-[var(--app-purple)]" onClick={addRow}>
								＋ Add ingredient
							</button>
						</section>
						<label className="grid gap-1.5 rounded-[18px] border border-[var(--app-line)] bg-[var(--app-surface)] p-[17px] text-[11px]">
							Cooking notes
							<textarea
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								rows={3}
								placeholder="Notes for this scheduled meal only"
							/>
						</label>
					</section>
					<aside className="grid content-start gap-[18px]">
						<section className="rounded-[18px] border border-[var(--app-line)] bg-[var(--app-surface)] p-[18px]">
							<p className="mb-1.5 text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--app-purple)]">LIVE MEAL TOTALS</p>
							<h2>Nutrition in this meal</h2>
							<div className="text-2xl font-bold">
								<strong>{pretty(mealTotal.calories)}</strong>
								<span>kcal</span>
							</div>
							<dl>
								{(
									[
										["Protein", mealTotal.protein],
										["Carbohydrate", mealTotal.carbs],
										["Fat", mealTotal.fat],
										["Fiber", mealTotal.fiber],
									] as [string, number][]
								).map(([label, value]) => (
									<div key={label}>
										<dt>{label}</dt>
										<dd>{pretty(value)} g</dd>
									</div>
								))}
							</dl>
						</section>
						<section className="rounded-[18px] border border-[var(--app-line)] bg-[var(--app-surface)] p-[18px]">
							<p className="mb-1.5 text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--app-purple)]">
								{weekend ? "WEEKEND PLAN" : "PLANNED TARGET PROGRESS"}
							</p>
							<h2>Lunch + dinner</h2>
							<p className="text-xs text-[var(--app-muted)]">
								Each member’s lunch and half of shared dinner are included.
								Planned nutrition is not actual intake.
								{weekend ? " Weekend targets are self-managed." : ""}
							</p>
							{memberTotals
								.filter(
									(entry) =>
										mealSlot === "dinner" || entry.member.id === mealMember,
								)
								.map(({ member, proposed, target, remaining }) => (
									<div className="text-sm" key={member.id}>
										<div>
											<strong>{member.name}</strong>
											<span>
												{target
													? pretty(proposed.calories) +
														" / " +
														pretty(target.weekdayCalories) +
														" kcal"
													: `${pretty(proposed.calories)} kcal planned`}
											</span>
										</div>
										{target && (
											<div className="flex items-center justify-between">
												<span
													style={{
														width: `${Math.min(
															100,
															(proposed.calories /
																Math.max(1, target.weekdayCalories)) *
																100,
														)}%`,
													}}
												/>
											</div>
										)}
										<div className="grid gap-1 text-sm">
											<span>
												Protein{" "}
												{nutrientProgress(
													proposed.protein,
													target?.macroGrams.protein,
												)}
											</span>
											<span>
												Carbs{" "}
												{nutrientProgress(
													proposed.carbs,
													target?.macroGrams.carbs,
												)}
											</span>
											<span>
												Fat{" "}
												{nutrientProgress(proposed.fat, target?.macroGrams.fat)}
											</span>
											<span>
												Fiber{" "}
												{nutrientProgress(proposed.fiber, target?.fiberGrams)}
											</span>
										</div>
										<small>
											{remaining !== undefined
												? `${pretty(remaining)} kcal remaining`
												: weekend
													? "Targets are not evaluated"
													: "No target for this week"}
										</small>
									</div>
								))}
						</section>
					</aside>
				</div>
				<footer className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--app-line)] bg-[var(--app-surface)] p-4">
					<div className="grid gap-2">
						<button
							type="button"
							onClick={saveToMasterMenu}
							disabled={savingMenu || invalidMeal}
						>
							{savingMenu ? "Saving to master…" : "Save to master menu"}
						</button>
						{menuStatus?.fingerprint === menuFingerprint && (
							<span role="status">{menuStatus.message}</span>
						)}
					</div>
					<button type="button" onClick={onCancel}>
						Cancel
					</button>
					<button type="submit" disabled={saving || invalidMeal}>
						{saving ? "Saving…" : "Save scheduled meal"}
					</button>
				</footer>
			</form>
		</div>
	);
}
