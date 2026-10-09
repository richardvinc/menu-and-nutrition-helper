import type {
	AppData,
	Ingredient,
	Nutrition,
	ScheduledMeal,
} from "@piring-kita/shared";
import "./dashboard.css";

type DashboardData = Pick<
	AppData,
	"members" | "ingredients" | "scheduledMeals"
>;

export interface DashboardProps {
	data: DashboardData;
	today?: Date;
}

const dayKey = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const mondayOf = (date: Date) => {
	const monday = new Date(date);
	monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
	return monday;
};
const blankNutrition = (): Nutrition => ({
	calories: 0,
	protein: 0,
	carbs: 0,
	fat: 0,
	fiber: 0,
});
const fmt = (value: number) => Math.round(value).toLocaleString();
const weeklyEntries = (meals: ScheduledMeal[]) =>
	[
		{
			label: "[R]",
			names: meals
				.filter((meal) => meal.slot === "lunch" && meal.memberId === "richard")
				.map((meal) => meal.name),
		},
		{
			label: "[M]",
			names: meals
				.filter((meal) => meal.slot === "lunch" && meal.memberId === "michelle")
				.map((meal) => meal.name),
		},
		{
			label: "DINNER",
			names: meals
				.filter((meal) => meal.slot === "dinner")
				.map((meal) => meal.name),
		},
	].filter((entry) => entry.names.length > 0);

function mealNutrition(
	meal: ScheduledMeal,
	ingredients: Map<string, Ingredient>,
): Nutrition {
	return meal.ingredients.reduce((total, row) => {
		const ingredient = ingredients.get(row.ingredientId);
		if (!ingredient) return total;
		const factor = row.quantity / ingredient.basisAmount;
		total.calories += ingredient.nutrition.calories * factor;
		total.protein += ingredient.nutrition.protein * factor;
		total.carbs += ingredient.nutrition.carbs * factor;
		total.fat += ingredient.nutrition.fat * factor;
		total.fiber += ingredient.nutrition.fiber * factor;
		return total;
	}, blankNutrition());
}

export function Dashboard({ data, today = new Date() }: DashboardProps) {
	const ingredients = new Map(
		data.ingredients.map((ingredient) => [ingredient.id, ingredient]),
	);
	const weekDate = new Date(today);
	if (today.getDay() === 0) weekDate.setDate(today.getDate() + 1);
	const weekStart = dayKey(mondayOf(weekDate));
	const weekDays = Array.from({ length: 7 }, (_, offset) => {
		const day = new Date(`${weekStart}T12:00:00`);
		day.setDate(day.getDate() + offset);
		const key = dayKey(day);
		return {
			day,
			key,
			meals: data.scheduledMeals
				.filter((meal) => meal.date === key)
				.sort(
					(a, b) =>
						["lunch", "dinner", "snack"].indexOf(a.slot) -
						["lunch", "dinner", "snack"].indexOf(b.slot),
				),
		};
	});
	const mealCards = [
		{ label: "Richard’s lunch", memberId: "richard", slot: "lunch" },
		{ label: "Michelle’s lunch", memberId: "michelle", slot: "lunch" },
		{ label: "Our dinner", memberId: undefined, slot: "dinner" },
		{ label: "Richard’s snack", memberId: "richard", slot: "snack" },
		{ label: "Michelle’s snack", memberId: "michelle", slot: "snack" },
	] as const;

	return (
		<main className="pk-dashboard">
			{/* <header className="pk-dashboard__header">
				<p className="pk-eyebrow">PIRING KITA · PLANNING</p>
				<h1>Good food, ready when you are.</h1>
				<p className="pk-muted">Today and tomorrow at a glance.</p>
			</header> */}

			<div className="pk-dashboard__days">
				{[0, 1].map((offset) => {
					const day = new Date(today);
					day.setDate(today.getDate() + offset);
					const date = dayKey(day);
					const dayMeals = data.scheduledMeals.filter(
						(meal) => meal.date === date,
					);
					return (
						<section
							className="pk-day"
							key={date}
							aria-labelledby={`pk-day-${date}`}
						>
							<div className="pk-day__heading">
								<div>
									<p className="pk-eyebrow">
										{offset === 0 ? "TODAY" : "TOMORROW"}
									</p>
									<h2 id={`pk-day-${date}`}>
										{day.toLocaleDateString(undefined, {
											weekday: "long",
											month: "long",
											day: "numeric",
										})}
									</h2>
								</div>
							</div>
							<div className="pk-day__cards">
								{mealCards.map((card) => {
									const meal = dayMeals.find(
										(item) =>
											item.slot === card.slot &&
											(card.slot === "dinner" ||
												item.memberId === card.memberId),
									);
									return (
										<article
											className={`pk-meal-card pk-meal-card--${card.slot}`}
											key={card.label}
										>
											<p className="pk-meal-card__label">{card.label}</p>
											{meal ? (
												<>
													<h3>{meal.name}</h3>
													<p className="pk-meal-card__nutrition">
														{fmt(mealNutrition(meal, ingredients).calories)}{" "}
														kcal ·{" "}
														{fmt(mealNutrition(meal, ingredients).protein)} g
														protein
													</p>
													{meal.notes.trim() && (
														<p className="pk-meal-card__notes">
															<strong>Cooking note</strong>
															<span>{meal.notes}</span>
														</p>
													)}
													<ul>
														{meal.ingredients.map((row, index) => {
															const ingredient = ingredients.get(
																row.ingredientId,
															);
															return (
																<li key={`${row.ingredientId}-${index}`}>
																	<span>
																		{ingredient?.name ?? "Unknown ingredient"}
																		{ingredient?.unit !== "g" &&
																			ingredient?.equivalentGrams != null &&
																			` · 1 ${ingredient.unit} (${ingredient.equivalentGrams} g)`}
																	</span>
																	<strong>
																		{row.quantity} {ingredient?.unit ?? ""}
																	</strong>
																</li>
															);
														})}
													</ul>
												</>
											) : (
												<div className="pk-meal-card__empty">
													<strong>Nothing planned</strong>
													<p>No {card.slot} is scheduled.</p>
												</div>
											)}
										</article>
									);
								})}
							</div>
						</section>
					);
				})}
			</div>

			<section
				className="pk-panel pk-week-summary"
				aria-labelledby="pk-week-summary-heading"
			>
				<div className="pk-panel__heading">
					<div>
						<p className="pk-eyebrow">THIS WEEK</p>
						<h2 id="pk-week-summary-heading">Weekly menu</h2>
					</div>
				</div>
				<div className="pk-week-summary__scroll">
					<div className="pk-week-summary__grid">
						{weekDays.map(({ day, key, meals }) => (
							<section
								className={key === dayKey(today) ? "is-today" : ""}
								key={key}
							>
								<header>
									<span>
										{day.toLocaleDateString(undefined, { weekday: "short" })}
									</span>
									<strong>{day.getDate()}</strong>
								</header>
								{meals.length ? (
									<ul>
										{weeklyEntries(meals).map((entry) => (
											<li key={entry.label}>
												<small>{entry.label}</small>
												<span>{entry.names.join(" · ")}</span>
											</li>
										))}
									</ul>
								) : (
									<p>No meals</p>
								)}
							</section>
						))}
					</div>
				</div>
			</section>
		</main>
	);
}
