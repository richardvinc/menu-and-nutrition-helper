import type {
	AppData,
	Ingredient,
	Nutrition,
	ScheduledMeal,
} from "@piring-kita/shared";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { api, type CalendarOccurrence } from "../../api";
import "./dashboard.css";

type DashboardData = Pick<
	AppData,
	"members" | "ingredients" | "scheduledMeals" | "calendars"
>;

export interface DashboardProps {
	data: DashboardData;
	today?: Date;
	onEditMeal: (meal: ScheduledMeal) => void;
}

const dayKey = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthCalendar = (today: Date) => {
	const first = new Date(today.getFullYear(), today.getMonth(), 1, 12);
	first.setDate(first.getDate() - first.getDay());
	return Array.from({ length: 42 }, (_, index) => {
		const day = new Date(first);
		day.setDate(first.getDate() + index);
		return day;
	});
};
const agendaOnDate = (event: CalendarOccurrence, date: string) => {
	if (event.allDay)
		return date >= event.start.slice(0, 10) && date < event.end.slice(0, 10);
	const start = new Date(`${date}T00:00:00`);
	const end = new Date(start);
	end.setDate(end.getDate() + 1);
	return new Date(event.start) < end && new Date(event.end) > start;
};
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
			meals: meals.filter(
				(meal) => meal.slot === "lunch" && meal.memberId === "richard",
			),
		},
		{
			label: "[M]",
			meals: meals.filter(
				(meal) => meal.slot === "lunch" && meal.memberId === "michelle",
			),
		},
		{
			label: "[Dinner]",
			meals: meals.filter((meal) => meal.slot === "dinner"),
		},
	].filter((entry) => entry.meals.length > 0);

function mealNutrition(
	meal: ScheduledMeal,
	ingredients: Map<string, Ingredient>,
): Nutrition {
	return meal.ingredients.reduce((total, row) => {
		const ingredient = row.ingredient ?? ingredients.get(row.ingredientId);
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

function ingredientRow(
	row: ScheduledMeal["ingredients"][number],
	index: number,
	ingredients: Map<string, Ingredient>,
	group = "",
) {
	const ingredient = row.ingredient ?? ingredients.get(row.ingredientId);
	return (
		<li key={`${group}-${row.ingredientId}-${index}`}>
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
}

function dinnerIngredientRows(
	meal: ScheduledMeal,
	ingredients: Map<string, Ingredient>,
) {
	return (
		[
			{ label: "[R]", memberId: "richard" },
			{ label: "[M]", memberId: "michelle" },
			{ label: "[Shared]", memberId: undefined },
		] as const
	).flatMap((group) => {
		const rows = meal.ingredients
			.map((row, index) => ({ row, index }))
			.filter(({ row }) => row.memberId === group.memberId);
		return rows.length
			? [
					<li className="pk-meal-card__group" key={group.label}>
						{group.label}
					</li>,
					...rows.map(({ row, index }) =>
						ingredientRow(row, index, ingredients, group.label),
					),
				]
			: [];
	});
}

function DashboardCalendar({
	today,
	calendars,
}: {
	today: Date;
	calendars: DashboardData["calendars"];
}) {
	const days = useMemo(
		() => monthCalendar(today),
		[today.getFullYear(), today.getMonth()],
	);
	const start = dayKey(days[0]);
	const end = dayKey(days[days.length - 1]);
	const [events, setEvents] = useState<CalendarOccurrence[]>([]);
	const visibleEvents = events.filter(
		(event) =>
			calendars.find((calendar) => calendar.id === event.calendarId)?.visible,
	);
	useEffect(() => {
		let active = true;
		api
			.calendarOccurrences(start, end)
			.then(({ occurrences }) => {
				if (active) setEvents(occurrences);
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, [start, end, calendars]);
	const eventsFor = (date: string) =>
		visibleEvents.filter((event) => agendaOnDate(event, date));
	const sortedEventsFor = (date: string) =>
		eventsFor(date).sort((a, b) => a.start.localeCompare(b.start));
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);
	const tomorrowKey = dayKey(tomorrow);
	const thisWeekStart = mondayOf(today);
	const thisWeekDays = Array.from({ length: 7 }, (_, offset) => {
		const day = new Date(thisWeekStart);
		day.setDate(day.getDate() + offset);
		return { day, key: dayKey(day) };
	}).filter(({ key }) => key > tomorrowKey);
	const agendaItem = (event: CalendarOccurrence, date?: Date) => ({
		event,
		date,
	});
	const agendaGroups = [
		{
			label: "Today",
			showDate: false,
			events: sortedEventsFor(dayKey(today)).map((event) => agendaItem(event)),
		},
		{
			label: "Tomorrow",
			showDate: false,
			events: sortedEventsFor(dayKey(tomorrow)).map((event) =>
				agendaItem(event),
			),
		},
		{
			label: "Later this week",
			showDate: true,
			events: thisWeekDays.flatMap(({ day, key }) =>
				sortedEventsFor(key).map((event) => agendaItem(event, day)),
			),
		},
	];
	return (
		<section
			className="pk-panel pk-dashboard-calendar"
			aria-labelledby="pk-dashboard-calendar-heading"
		>
			<div className="pk-panel__heading">
				<div>
					<p className="pk-eyebrow">PLAN AHEAD</p>
					<h2 id="pk-dashboard-calendar-heading">
						{today.toLocaleDateString(undefined, {
							month: "long",
							year: "numeric",
						})}
					</h2>
				</div>
			</div>
			<div className="pk-dashboard-calendar__weekdays">
				{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
					<span key={day}>{day}</span>
				))}
			</div>
			<div className="pk-dashboard-calendar__grid">
				{days.map((day) => {
					const key = dayKey(day);
					const dayEvents = eventsFor(key);
					return (
						<div
							className={`pk-dashboard-calendar__day${day.getMonth() === today.getMonth() ? "" : " is-outside"}${key === dayKey(today) ? " is-today" : ""}`}
							key={key}
							aria-label={`${day.toLocaleDateString(undefined, { month: "long", day: "numeric" })}${dayEvents.length ? `, ${dayEvents.length} agendas` : ""}`}
						>
							<strong>{day.getDate()}</strong>
							<div>
								{dayEvents.slice(0, 3).map((event) => (
									<span
										className="pk-dashboard-calendar__event"
										key={`${event.id}-${event.recurrenceId ?? event.start}`}
										style={{ "--event-color": event.color } as CSSProperties}
										title={event.title}
									>
										{event.recurring && <b aria-label="Repeating">↻ </b>}
										{event.title}
									</span>
								))}
								{dayEvents.length > 3 && (
									<small>+{dayEvents.length - 3} more</small>
								)}
								{dayEvents.length > 1 && (
									<small className="pk-dashboard-calendar__portrait-more">
										+{dayEvents.length - 1} more
									</small>
								)}
							</div>
						</div>
					);
				})}
			</div>
			<div className="pk-dashboard-calendar__agenda">
				{agendaGroups.map((group) => (
					<section
						className="pk-dashboard-calendar__agenda-group"
						key={group.label}
					>
						<h3>{group.label}</h3>
						{group.events.length ? (
							<ul>
								{group.events.map(({ event, date }) => (
									<li
										className="pk-dashboard-calendar__agenda-item"
										key={`${event.id}-${event.recurrenceId ?? event.start}-${date ? dayKey(date) : ""}`}
									>
										<span
											className="pk-dashboard-calendar__legend"
											style={{ background: event.color }}
										/>
										{group.showDate && date ? (
											<span className="pk-dashboard-calendar__agenda-date">
												{date.toLocaleDateString(undefined, { weekday: "short" })}
												{!event.allDay &&
													` · ${new Date(event.start).toLocaleTimeString([], {
														hour: "numeric",
														minute: "2-digit",
													})}`}
											</span>
										) : (
											!event.allDay && (
												<time dateTime={event.start}>
													{new Date(event.start).toLocaleTimeString([], {
														hour: "numeric",
														minute: "2-digit",
													})}
												</time>
											)
										)}
										<strong>
											{event.title}
											{event.recurring && <span title="Repeating"> ↻</span>}
										</strong>
										<small>{event.calendarName}</small>
									</li>
								))}
							</ul>
						) : (
							<p>No events.</p>
						)}
					</section>
				))}
			</div>
		</section>
	);
}

export function Dashboard({
	data,
	today = new Date(),
	onEditMeal,
}: DashboardProps) {
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
													<h3>
														<button
															className="pk-dashboard__meal-link"
															type="button"
															onClick={() => onEditMeal(meal)}
														>
															{meal.name}
														</button>
													</h3>
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
														{card.slot === "dinner"
															? dinnerIngredientRows(meal, ingredients)
															: meal.ingredients.map((row, index) =>
																	ingredientRow(row, index, ingredients),
																)}
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
												<span>
													{entry.meals.map((meal) => (
														<button
															className="pk-dashboard__meal-link"
															type="button"
															key={meal.id}
															onClick={() => onEditMeal(meal)}
														>
															{meal.name}
														</button>
													))}
												</span>
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
			<DashboardCalendar
				today={today}
				calendars={data.calendars}
			/>
		</main>
	);
}
