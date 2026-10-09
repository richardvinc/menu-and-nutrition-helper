import type {
	Ingredient,
	MealSlot,
	MemberId,
	MenuIngredient,
	SavedMenu,
} from "@piring-kita/shared";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import "./library.css";

export type LibraryProps = {
	menus: SavedMenu[];
	ingredients: Ingredient[];
	onSaveMenu: (menu: SavedMenu) => Promise<void>;
	onDeleteMenu: (id: string) => Promise<void>;
	onSaveIngredient: (ingredient: Ingredient) => Promise<void>;
	onDeleteIngredient: (id: string) => Promise<void>;
};

type MenuDraft = {
	id: string;
	name: string;
	slot: MealSlot;
	memberId?: MemberId;
	ingredients: MenuIngredient[];
};
type IngredientDraft = {
	id: string;
	name: string;
	aliases: string;
	unit: Ingredient["unit"];
	basisAmount: string;
	equivalentGrams: string;
	preparation: string;
	source: string;
	suggestible: boolean;
	calories: string;
	protein: string;
	carbs: string;
	fat: string;
	fiber: string;
};

const blankMenu = (): MenuDraft => ({
	id: Date.now().toString(),
	name: "",
	slot: "lunch",
	memberId: "richard",
	ingredients: [],
});
const blankIngredient = (): IngredientDraft => ({
	id: Date.now().toString(),
	name: "",
	aliases: "",
	unit: "g",
	basisAmount: "100",
	equivalentGrams: "",
	preparation: "",
	source: "",
	suggestible: true,
	calories: "0",
	protein: "0",
	carbs: "0",
	fat: "0",
	fiber: "0",
});

function ingredientDraft(item?: Ingredient): IngredientDraft {
	if (!item) return blankIngredient();
	return {
		id: item.id,
		name: item.name,
		aliases: item.aliases.join(", "),
		unit: item.unit,
		basisAmount: String(item.basisAmount),
		equivalentGrams:
			item.equivalentGrams == null ? "" : String(item.equivalentGrams),
		preparation: item.preparation,
		source: item.source,
		suggestible: item.suggestible,
		calories: String(item.nutrition.calories),
		protein: String(item.nutrition.protein),
		carbs: String(item.nutrition.carbs),
		fat: String(item.nutrition.fat),
		fiber: String(item.nutrition.fiber),
	};
}
const menuKey = (menu: MenuDraft | SavedMenu) =>
	JSON.stringify([
		menu.name.trim(),
		menu.slot,
		menu.memberId ?? "",
		menu.ingredients
			.map((row) => [
				row.ingredientId,
				Number(row.quantity),
				row.memberId ?? "",
			])
			.sort(),
	]);
const ingredientKey = (draft: IngredientDraft) =>
	JSON.stringify([
		draft.name.trim(),
		draft.aliases
			.split(",")
			.map((x) => x.trim())
			.filter(Boolean)
			.map((x) => x.toLocaleLowerCase())
			.sort(),
		draft.unit,
		Number(draft.basisAmount),
		Number(draft.equivalentGrams) || "",
		draft.preparation.trim(),
		draft.source.trim(),
		draft.suggestible,
		Number(draft.calories),
		Number(draft.protein),
		Number(draft.carbs),
		Number(draft.fat),
		Number(draft.fiber),
	]);

export function Library({
	menus,
	ingredients,
	onSaveMenu,
	onDeleteMenu,
	onSaveIngredient,
	onDeleteIngredient,
}: LibraryProps) {
	const [section, setSection] = useState<"menus" | "ingredients">("menus");
	const [menuSearch, setMenuSearch] = useState("");
	const [ingredientSearch, setIngredientSearch] = useState("");
	const [menuDraft, setMenuDraft] = useState<MenuDraft | null>(null);
	const [ingredientDraftState, setIngredientDraftState] =
		useState<IngredientDraft | null>(null);
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const [lookupBusy, setLookupBusy] = useState(false);
	const [lookupResult, setLookupResult] = useState<Awaited<
		ReturnType<typeof api.lookupIngredient>
	> | null>(null);
	const [lookupWarning, setLookupWarning] = useState("");
	const [lookupAvailable, setLookupAvailable] = useState<boolean | null>(null);
	const [menuPortalTarget, setMenuPortalTarget] =
		useState<HTMLDivElement | null>(null);
	const [ingredientPortalTarget, setIngredientPortalTarget] =
		useState<HTMLDivElement | null>(null);
	const lookupRequestId = useRef(0);
	const pageFocus = useRef({ active: true, since: 0 });
	useEffect(() => {
		const focused = () =>
			(pageFocus.current = { active: true, since: Date.now() });
		const blurred = () => (pageFocus.current.active = false);
		window.addEventListener("focus", focused);
		window.addEventListener("blur", blurred);
		return () => {
			window.removeEventListener("focus", focused);
			window.removeEventListener("blur", blurred);
		};
	}, []);
	useEffect(() => {
		api
			.aiStatus()
			.then((status) => setLookupAvailable(status.ingredientLookup))
			.catch(() => setLookupAvailable(false));
	}, []);
	const clearLookup = () => {
		lookupRequestId.current++;
		setLookupBusy(false);
		setLookupResult(null);
		setLookupWarning("");
	};
	const menuDirty = () => {
		if (!menuDraft) return false;
		const original =
			menus.find((item) => item.id === menuDraft.id) ?? blankMenu();
		return menuKey(menuDraft) !== menuKey(original);
	};
	const ingredientDirty = () => {
		if (!ingredientDraftState) return false;
		const original = ingredients.find(
			(item) => item.id === ingredientDraftState.id,
		);
		return (
			ingredientKey(ingredientDraftState) !==
			ingredientKey(original ? ingredientDraft(original) : blankIngredient())
		);
	};
	const confirmIngredientDiscard = () =>
		!ingredientDirty() ||
		(pageFocus.current.active &&
			Date.now() - pageFocus.current.since > 250 &&
			window.confirm("Discard changes to this ingredient?"));
	const openMenuDraft = (draft: MenuDraft) => {
		if (menuDirty() && !window.confirm("Discard changes to this saved menu?"))
			return;
		setIngredientDraftState(null);
		setMenuDraft(draft);
		setError("");
	};
	const openIngredientDraft = (draft: IngredientDraft) => {
		if (!confirmIngredientDiscard()) return;
		clearLookup();
		setMenuDraft(null);
		setIngredientDraftState(draft);
		setError("");
	};

	const visibleMenus = useMemo(
		() =>
			menus.filter(
				(menu) =>
					menuDraft?.id === menu.id ||
					menu.name
						.toLocaleLowerCase()
						.includes(menuSearch.trim().toLocaleLowerCase()),
			),
		[menus, menuSearch],
	);
	const visibleIngredients = useMemo(() => {
		const query = ingredientSearch.trim().toLocaleLowerCase();
		return ingredients.filter(
			(item) =>
				ingredientDraftState?.id === item.id ||
				!query ||
				[item.name, ...item.aliases].some((name) =>
					name.toLocaleLowerCase().includes(query),
				),
		);
	}, [ingredients, ingredientSearch]);

	async function saveMenu(event: FormEvent) {
		event.preventDefault();
		if (!menuDraft?.name.trim() || !menuDraft.ingredients.length) return;
		setSaving(true);
		setError("");
		try {
			await onSaveMenu({
				...menuDraft,
				name: menuDraft.name.trim(),
				...(menuDraft.slot === "dinner" ? { memberId: undefined } : {}),
			});
			setMenuDraft(null);
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Could not save the menu.",
			);
		} finally {
			setSaving(false);
		}
	}

	async function saveIngredient(event: FormEvent) {
		event.preventDefault();
		const draft = ingredientDraftState;
		if (!draft) return;
		const numbers = [
			draft.basisAmount,
			draft.calories,
			draft.protein,
			draft.carbs,
			draft.fat,
			draft.fiber,
		].map(Number);
		const equivalentGrams =
			draft.unit !== "g" && draft.equivalentGrams.trim()
				? Number(draft.equivalentGrams)
				: undefined;
		if (
			!draft.name.trim() ||
			numbers.some((value) => !Number.isFinite(value) || value < 0) ||
			numbers[0] === 0 ||
			(equivalentGrams !== undefined &&
				(!Number.isFinite(equivalentGrams) || equivalentGrams <= 0))
		) {
			setError(
				"Enter a name, a positive nutrition basis, and non-negative nutrition values.",
			);
			return;
		}
		const ingredient: Ingredient = {
			id: draft.id,
			name: draft.name,
			aliases: draft.aliases
				.split(",")
				.map((alias) => alias.trim())
				.filter(
					(alias) =>
						alias &&
						alias.toLocaleLowerCase() !== draft.name.trim().toLocaleLowerCase(),
				)
				.filter(
					(alias, index, list) =>
						list.findIndex(
							(item) => item.toLocaleLowerCase() === alias.toLocaleLowerCase(),
						) === index,
				),
			unit: draft.unit,
			basisAmount: numbers[0],
			...(equivalentGrams === undefined ? {} : { equivalentGrams }),
			preparation: draft.preparation.trim(),
			source: draft.source.trim(),
			suggestible: draft.suggestible,
			nutrition: {
				calories: numbers[1],
				protein: numbers[2],
				carbs: numbers[3],
				fat: numbers[4],
				fiber: numbers[5],
			},
		};
		setSaving(true);
		setError("");
		try {
			await onSaveIngredient(ingredient);
			setIngredientDraftState(null);
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "Could not save the ingredient.",
			);
		} finally {
			setSaving(false);
		}
	}

	async function findIngredientNutrition() {
		if (!ingredientDraftState?.name.trim()) return;
		const normalizedName = ingredientDraftState.name.trim().toLocaleLowerCase();
		const catalogMatch = ingredients.find((item) =>
			[item.name, ...item.aliases].some(
				(term) => term.trim().toLocaleLowerCase() === normalizedName,
			),
		);
		if (catalogMatch) {
			clearLookup();
			setLookupResult({
				query: ingredientDraftState.name.trim(),
				aliases: [],
				existing: catalogMatch.id,
				matches: [],
			});
			setLookupWarning(
				`This is already in the catalog as “${catalogMatch.name}”.`,
			);
			return;
		}
		const requestId = ++lookupRequestId.current;
		setLookupBusy(true);
		setLookupWarning("");
		setLookupResult(null);
		try {
			const result = await api.lookupIngredient(
				ingredientDraftState.name.trim(),
				ingredientDraftState.preparation.trim(),
			);
			if (lookupRequestId.current !== requestId) return;
			setLookupResult(result);
			if (result.existing) {
				const existing = ingredients.find(
					(item) => item.id === result.existing,
				);
				if (existing) {
					setLookupWarning(
						`This is already in the catalog as “${existing.name}”.`,
					);
					return;
				}
			}
			if (!result.aliases.length)
				setLookupWarning(
					"Nutrition lookup succeeded; AI aliases were unavailable.",
				);
			if (!result.matches.length)
				setLookupWarning(
					"No verified USDA match was found. Nutrition was not filled.",
				);
		} catch (reason) {
			if (lookupRequestId.current !== requestId) return;
			setLookupWarning(
				reason instanceof Error
					? reason.message
					: "USDA nutrition lookup failed.",
			);
		} finally {
			if (lookupRequestId.current === requestId) setLookupBusy(false);
		}
	}
	function selectUsdaMatch(
		match: NonNullable<typeof lookupResult>["matches"][number],
	) {
		if (!ingredientDraftState || !lookupResult) return;
		const aliases = [...lookupResult.aliases, lookupResult.query]
			.map((alias) => alias.trim())
			.filter(
				(alias) =>
					alias &&
					alias.toLocaleLowerCase() !==
						ingredientDraftState.name.trim().toLocaleLowerCase(),
			)
			.filter(
				(alias, index, list) =>
					list.findIndex(
						(item) => item.toLocaleLowerCase() === alias.toLocaleLowerCase(),
					) === index,
			);
		setIngredientDraftState({
			...ingredientDraftState,
			aliases: aliases.join(", "),
			unit: "g",
			basisAmount: "100",
			equivalentGrams: "",
			source: match.source,
			preparation: match.description,
			calories: String(match.nutrition.calories),
			protein: String(match.nutrition.protein),
			carbs: String(match.nutrition.carbs),
			fat: String(match.nutrition.fat),
			fiber: String(match.nutrition.fiber),
		});
		setLookupResult(null);
		setLookupWarning("");
	}

	return (
		<main className="library-page">
			<header className="feature-heading">
				<p className="feature-eyebrow">Reusable planning collection</p>
				<h1>Library</h1>
				<p>Keep saved menus and the canonical ingredient catalog here.</p>
			</header>
			<div
				className="library-tabs"
				role="tablist"
				aria-label="Library collections"
			>
				<button
					type="button"
					role="tab"
					aria-selected={section === "menus"}
					onClick={() => {
						if (section !== "menus") {
							if (!confirmIngredientDiscard()) return;
							setIngredientDraftState(null);
							clearLookup();
						}
						setSection("menus");
						setError("");
					}}
				>
					Saved menus
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={section === "ingredients"}
					onClick={() => {
						if (section !== "ingredients") {
							if (
								menuDirty() &&
								!window.confirm("Discard changes to this saved menu?")
							)
								return;
							setMenuDraft(null);
						}
						setSection("ingredients");
						setError("");
					}}
				>
					Ingredient catalog
				</button>
			</div>
			{error && (
				<p className="feature-error" role="alert">
					{error}
				</p>
			)}

			{section === "menus" && (
				<section role="tabpanel" aria-label="Saved menus">
					<div className="library-toolbar">
						<label>
							Search saved menus
							<input
								type="search"
								value={menuSearch}
								onChange={(event) => setMenuSearch(event.target.value)}
							/>
						</label>
						<button
							type="button"
							onClick={() => {
								openMenuDraft(blankMenu());
							}}
						>
							New saved menu
						</button>
					</div>
					{menuDraft &&
						(() => {
							const editor = (
								<form
									className="library-editor"
									onSubmit={saveMenu}
									aria-label={
										menuDraft.name ? "Edit saved menu" : "New saved menu"
									}
								>
									<h2>
										{menus.some((menu) => menu.id === menuDraft.id)
											? "Edit saved menu"
											: "New saved menu"}
									</h2>
									<label>
										Menu name
										<input
											required
											value={menuDraft.name}
											onChange={(event) =>
												setMenuDraft({ ...menuDraft, name: event.target.value })
											}
										/>
									</label>
									<div className="feature-form-grid">
										<label>
											Meal type
											<select
												value={menuDraft.slot}
												onChange={(event) => {
													const slot = event.target.value as MealSlot;
													setMenuDraft({
														...menuDraft,
														slot,
														...(slot === "dinner"
															? { memberId: undefined }
															: { memberId: menuDraft.memberId ?? "richard" }),
													});
												}}
											>
												<option value="lunch">Lunch</option>
												<option value="dinner">Dinner</option>
												<option value="snack">Snack</option>
											</select>
										</label>
										{menuDraft.slot !== "dinner" && (
											<label>
												Member indicator
												<select
													value={menuDraft.memberId ?? "richard"}
													onChange={(event) =>
														setMenuDraft({
															...menuDraft,
															memberId: event.target.value as MemberId,
														})
													}
												>
													<option value="richard">Richard</option>
													<option value="michelle">Michelle</option>
												</select>
											</label>
										)}
									</div>
									<fieldset>
										<legend>Ingredients</legend>
										{menuDraft.ingredients.map((row, index) => (
											<div
												className="library-row"
												key={`${row.ingredientId}-${index}`}
											>
												<label>
													Ingredient
													<select
														aria-label={`Ingredient ${index + 1}`}
														required
														value={row.ingredientId}
														onChange={(event) =>
															setMenuDraft({
																...menuDraft,
																ingredients: menuDraft.ingredients.map(
																	(item, i) =>
																		i === index
																			? {
																					...item,
																					ingredientId: event.target.value,
																				}
																			: item,
																),
															})
														}
													>
														<option value="">Choose ingredient</option>
														{ingredients.map((item) => (
															<option key={item.id} value={item.id}>
																{item.name}
															</option>
														))}
													</select>
												</label>
												<label>
													Quantity (
													{ingredients.find(
														(item) => item.id === row.ingredientId,
													)?.unit || "unit"}
													)
													<input
														aria-label={`Quantity ${index + 1}`}
														type="number"
														min="0.01"
														step="any"
														required
														value={row.quantity}
														onChange={(event) =>
															setMenuDraft({
																...menuDraft,
																ingredients: menuDraft.ingredients.map(
																	(item, i) =>
																		i === index
																			? {
																					...item,
																					quantity: Number(event.target.value),
																				}
																			: item,
																),
															})
														}
													/>
												</label>
												<button
													type="button"
													aria-label={`Remove ingredient ${index + 1}`}
													onClick={() => {
														if (
															!window.confirm(
																"Remove this ingredient from the menu?",
															)
														)
															return;
														setMenuDraft({
															...menuDraft,
															ingredients: menuDraft.ingredients.filter(
																(_, i) => i !== index,
															),
														});
													}}
												>
													Remove
												</button>
											</div>
										))}
										<button
											type="button"
											onClick={() =>
												setMenuDraft({
													...menuDraft,
													ingredients: [
														...menuDraft.ingredients,
														{ ingredientId: "", quantity: 100 },
													],
												})
											}
										>
											Add ingredient
										</button>
									</fieldset>
									{!menuDraft.ingredients.length && (
										<p className="feature-hint">
											Add at least one ingredient before saving.
										</p>
									)}
									<div className="feature-actions">
										<button
											type="button"
											className="secondary"
											onClick={() => {
												if (
													!menuDirty() ||
													window.confirm("Discard changes to this saved menu?")
												)
													setMenuDraft(null);
											}}
										>
											Cancel
										</button>
										<button
											type="submit"
											disabled={
												saving ||
												!menuDraft.name.trim() ||
												!menuDraft.ingredients.length
											}
										>
											{saving ? "Saving…" : "Save menu"}
										</button>
									</div>
								</form>
							);
							return menus.some((menu) => menu.id === menuDraft.id)
								? menuPortalTarget
									? createPortal(editor, menuPortalTarget)
									: null
								: editor;
						})()}
					<div className="library-card-list">
						{visibleMenus.map((menu) => (
							<article
								className={`library-card ${menuDraft?.id === menu.id ? "is-editing" : ""}`}
								key={menu.id}
							>
								<div>
									<h2>
										<span className="library-card__badge">{menu.slot}</span>
										{menu.memberId && (
											<span className="library-card__badge">
												{menu.memberId}
											</span>
										)}
										{menu.name}
									</h2>
									<ul>
										{menu.ingredients.map((row, index) => {
											const item = ingredients.find(
												(entry) => entry.id === row.ingredientId,
											);
											return (
												<li key={`${row.ingredientId}-${index}`}>
													{item?.name ?? "Unknown ingredient"} · {row.quantity}{" "}
													{item?.unit ?? "unit"}
												</li>
											);
										})}
									</ul>
								</div>
								<div className="feature-actions">
									<button
										type="button"
										className="secondary"
										onClick={() => {
											openMenuDraft({
												id: menu.id,
												name: menu.name,
												slot: menu.slot,
												memberId: menu.memberId,
												ingredients: menu.ingredients.map((row) => ({
													...row,
												})),
											});
										}}
									>
										Edit
									</button>
									<button
										type="button"
										className="danger"
										onClick={async () => {
											if (
												window.confirm(
													`Delete saved menu “${menu.name}”? Scheduled meals already copied from it stay unchanged.`,
												)
											) {
												try {
													await onDeleteMenu(menu.id);
												} catch (reason) {
													setError(
														reason instanceof Error
															? reason.message
															: "Could not delete the menu.",
													);
												}
											}
										}}
									>
										Delete
									</button>
								</div>
								{menuDraft?.id === menu.id && (
									<div
										className="library-card__editor-anchor"
										ref={setMenuPortalTarget}
									/>
								)}
							</article>
						))}
						{visibleMenus.length === 0 && (
							<p className="feature-hint">No saved menus match that search.</p>
						)}
					</div>
				</section>
			)}

			{section === "ingredients" && (
				<section role="tabpanel" aria-label="Ingredient catalog">
					<div className="library-toolbar">
						<label>
							Search ingredients and aliases
							<input
								type="search"
								value={ingredientSearch}
								onChange={(event) => setIngredientSearch(event.target.value)}
							/>
						</label>
						<button
							type="button"
							onClick={() => {
								openIngredientDraft(blankIngredient());
							}}
						>
							New ingredient
						</button>
					</div>
					<p className="feature-hint">
						Nutrition values use each ingredient’s listed basis. Equivalent
						grams affect quantity display only.
					</p>
					{ingredientDraftState &&
						(() => {
							const editor = (
								<form
									className="library-editor"
									onSubmit={saveIngredient}
									aria-label={
										ingredients.some(
											(item) => item.id === ingredientDraftState.id,
										)
											? "Edit ingredient"
											: "New ingredient"
									}
								>
									<h2>
										{ingredients.some(
											(item) => item.id === ingredientDraftState.id,
										)
											? "Edit ingredient"
											: "New ingredient"}
									</h2>
									<div className="feature-form-grid">
										<label>
											Primary ingredient name
											<input
												required
												value={ingredientDraftState.name}
												onChange={(event) =>
													setIngredientDraftState({
														...ingredientDraftState,
														name: event.target.value,
													})
												}
											/>
										</label>
										<div className="ingredient-lookup-panel">
											<button
												type="button"
												onClick={findIngredientNutrition}
												disabled={
													lookupBusy || !ingredientDraftState.name.trim()
												}
											>
												{lookupBusy ? "Looking up…" : "Find nutrition with AI"}
											</button>
											{lookupAvailable === false && (
												<p className="feature-hint">
													USDA nutrition lookup is unavailable: USDA_API_KEY is
													not configured.
												</p>
											)}
											{lookupWarning && (
												<p className="feature-hint" role="status">
													{lookupWarning}
												</p>
											)}
											{lookupResult?.existing && (() => {
												const existing = ingredients.find(
													(item) => item.id === lookupResult.existing,
												);
												return existing ? (
													<button
														type="button"
														className="secondary"
														onClick={() => {
															openIngredientDraft(ingredientDraft(existing));
															setIngredientSearch(existing.name);
														}}
													>
														Edit {existing.name}
													</button>
												) : null;
											})()}
											{lookupResult && !lookupResult.existing && (
												<div className="usda-matches">
													<p>
														USDA search: <strong>{lookupResult.query}</strong>
													</p>
													{lookupResult.similar?.length ? (
														<p>
															Similar catalog names:{" "}
															{lookupResult.similar.join(", ")}. No automatic
															merge.
														</p>
													) : null}
													{lookupResult.matches.map((match) => (
														<button
															type="button"
															className="secondary"
															key={match.fdcId}
															onClick={() => selectUsdaMatch(match)}
														>
															{match.description} · {match.dataType} · per 100
															g: {match.nutrition.calories} kcal, protein{" "}
															{match.nutrition.protein} g, carbs{" "}
															{match.nutrition.carbs} g, fat{" "}
															{match.nutrition.fat} g, fiber{" "}
															{match.nutrition.fiber} g
														</button>
													))}
												</div>
											)}
										</div>
										<label>
											Aliases, separated by commas
											<input
												value={ingredientDraftState.aliases}
												onChange={(event) =>
													setIngredientDraftState({
														...ingredientDraftState,
														aliases: event.target.value,
													})
												}
											/>
										</label>
										<label>
											Unit
											<select
												value={ingredientDraftState.unit}
												onChange={(event) => {
													const unit = event.target.value as Ingredient["unit"];
													setIngredientDraftState({
														...ingredientDraftState,
														unit,
														basisAmount: unit === "g" ? "100" : "1",
													});
												}}
											>
												<option value="g">g</option>
												<option value="piece">piece</option>
												<option value="tbsp">tbsp</option>
												<option value="package">package</option>
											</select>
										</label>
										<label>
											Nutrition basis amount ({ingredientDraftState.unit})
											<input
												type="number"
												min="0.001"
												step="any"
												required
												value={ingredientDraftState.basisAmount}
												onChange={(event) =>
													setIngredientDraftState({
														...ingredientDraftState,
														basisAmount: event.target.value,
													})
												}
											/>
										</label>
										{ingredientDraftState.unit !== "g" && (
											<label>
												Equivalent grams per unit (optional)
												<input
													type="number"
													min="0.001"
													step="any"
													value={ingredientDraftState.equivalentGrams}
													onChange={(event) =>
														setIngredientDraftState({
															...ingredientDraftState,
															equivalentGrams: event.target.value,
														})
													}
												/>
											</label>
										)}
										<label>
											Preparation state
											<input
												value={ingredientDraftState.preparation}
												onChange={(event) =>
													setIngredientDraftState({
														...ingredientDraftState,
														preparation: event.target.value,
													})
												}
											/>
										</label>
										<label>
											Nutrition source
											<input
												value={ingredientDraftState.source}
												onChange={(event) =>
													setIngredientDraftState({
														...ingredientDraftState,
														source: event.target.value,
													})
												}
											/>
										</label>
									</div>
									<fieldset>
										<legend>
											Nutrition per{" "}
											{ingredientDraftState.basisAmount || "basis"}{" "}
											{ingredientDraftState.unit}
										</legend>
										<div className="feature-form-grid">
											{(
												[
													"calories",
													"protein",
													"carbs",
													"fat",
													"fiber",
												] as const
											).map((key) => (
												<label key={key}>
													{key === "calories"
														? "Calories (kcal)"
														: `${key[0].toUpperCase()}${key.slice(1)} (g)`}
													<input
														type="number"
														min="0"
														step="any"
														required
														value={ingredientDraftState[key]}
														onChange={(event) =>
															setIngredientDraftState({
																...ingredientDraftState,
																[key]: event.target.value,
															})
														}
													/>
												</label>
											))}
										</div>
									</fieldset>
									<label className="feature-check">
										<input
											type="checkbox"
											checked={ingredientDraftState.suggestible}
											onChange={(event) =>
												setIngredientDraftState({
													...ingredientDraftState,
													suggestible: event.target.checked,
												})
											}
										/>
										Allow this ingredient in macro suggestions
									</label>
									<div className="feature-actions">
										<button
											type="button"
											className="secondary"
											onClick={() => {
												if (confirmIngredientDiscard())
													setIngredientDraftState(null);
											}}
										>
											Cancel
										</button>
										<button type="submit" disabled={saving}>
											{saving ? "Saving…" : "Save ingredient"}
										</button>
									</div>
								</form>
							);
							return ingredients.some(
								(item) => item.id === ingredientDraftState.id,
							)
								? ingredientPortalTarget
									? createPortal(editor, ingredientPortalTarget)
									: null
								: editor;
						})()}
					<div className="library-card-list">
						{visibleIngredients.map((item) => (
							<article
								className={`library-card ${ingredientDraftState?.id === item.id ? "is-editing" : ""}`}
								key={item.id}
							>
								<div>
									<h2>{item.name}</h2>
									<p>
										{item.aliases.length
											? `Also known as: ${item.aliases.join(", ")}`
											: "No aliases"}
									</p>
									<p>
										{item.preparation || "Preparation unspecified"} ·{" "}
										{item.source || "Source unspecified"}
									</p>
									<p>
										{item.nutrition.calories} kcal · P {item.nutrition.protein}{" "}
										g · C {item.nutrition.carbs} g · F {item.nutrition.fat} g ·
										Fiber {item.nutrition.fiber} g per {item.basisAmount}{" "}
										{item.unit}
									</p>
								</div>
								<div className="feature-actions">
									<button
										type="button"
										className="secondary"
										onClick={() => {
											openIngredientDraft(ingredientDraft(item));
											setError("");
										}}
									>
										Edit
									</button>
									<button
										type="button"
										className="danger"
										onClick={async () => {
											if (
												window.confirm(
													`Delete “${item.name}” from the ingredient catalog?`,
												)
											) {
												try {
													await onDeleteIngredient(item.id);
												} catch (reason) {
													setError(
														reason instanceof Error
															? reason.message
															: "Could not delete the ingredient.",
													);
												}
											}
										}}
									>
										Delete
									</button>
								</div>
								{ingredientDraftState?.id === item.id && (
									<div
										className="library-card__editor-anchor"
										ref={setIngredientPortalTarget}
									/>
								)}
							</article>
						))}
						{visibleIngredients.length === 0 && (
							<p className="feature-hint">
								No ingredients or aliases match that search.
							</p>
						)}
					</div>
				</section>
			)}
		</main>
	);
}
