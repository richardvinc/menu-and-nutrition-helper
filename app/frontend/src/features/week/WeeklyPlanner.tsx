import type { AppData, MemberId, ScheduledMeal } from "@piring-kita/shared";
import { type PointerEvent, useEffect, useMemo, useState } from "react";
import "./week.css";

type PlannerData = Pick<
	AppData,
	"members" | "ingredients" | "scheduledMeals" | "targets"
>;
export interface WeeklyPlannerProps {
	data: PlannerData;
	weekStart: string;
	onEditMeal: (meal: ScheduledMeal) => void;
	onCreateMeal: (
		date: string,
		slot: ScheduledMeal["slot"],
		memberId?: MemberId,
	) => void;
	onMoveMeal: (mealId: string, destinationDate: string) => void | Promise<void>;
	onSwapDays: (firstDate: string, secondDate: string) => void | Promise<void>;
}

const isoDate = (date: Date) =>
	date.getFullYear() +
	"-" +
	String(date.getMonth() + 1).padStart(2, "0") +
	"-" +
	String(date.getDate()).padStart(2, "0");
const addDays = (value: string, days: number) => {
	const date = new Date(`${value}T12:00:00`);
	date.setDate(date.getDate() + days);
	return isoDate(date);
};
const shortDate = (value: string) =>
	new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
		weekday: "short",
		day: "numeric",
	});
const sameSlot = (a: ScheduledMeal, b: ScheduledMeal) =>
	a.slot === b.slot && a.memberId === b.memberId;

export function WeeklyPlanner({
	data,
	weekStart,
	onEditMeal,
	onCreateMeal,
	onMoveMeal,
	onSwapDays,
}: WeeklyPlannerProps) {
	const [selectedDate, setSelectedDate] = useState(weekStart);
	const [movingMeal, setMovingMeal] = useState<ScheduledMeal | null>(null);
	const [destinationDate, setDestinationDate] = useState("");
	const [dayDrag, setDayDrag] = useState<{
		date: string;
		startX: number;
		startY: number;
		x: number;
		y: number;
		active: boolean;
	} | null>(null);
	const [dropDate, setDropDate] = useState("");
	useEffect(() => setSelectedDate(weekStart), [weekStart]);
	const dates = useMemo(
		() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
		[weekStart],
	);
	const selectedMeals = data.scheduledMeals.filter(
		(meal) => meal.date === selectedDate,
	);
	const destinationMeal =
		movingMeal && destinationDate
			? data.scheduledMeals.find(
					(meal) => meal.date === destinationDate && sameSlot(meal, movingMeal),
				)
			: undefined;
	const ingredientById = new Map(
		data.ingredients.map((ingredient) => [ingredient.id, ingredient]),
	);
	const plannedCalories = (memberId: MemberId) =>
		selectedMeals.reduce((total, meal) => {
			for (const row of meal.ingredients) {
				const ingredient = ingredientById.get(row.ingredientId);
				if (!ingredient) continue;
				const calories =
					(ingredient.nutrition.calories * row.quantity) /
					ingredient.basisAmount;
				if (meal.slot === "dinner" && !meal.memberId)
					total += row.memberId
						? row.memberId === memberId
							? calories
							: 0
						: calories / 2;
				else if (meal.memberId === memberId) total += calories;
			}
			return total;
		}, 0);
	const slots = [
		...data.members.map((member) => ({
			slot: "lunch" as const,
			memberId: member.id,
			label: `${member.name} lunch`,
		})),
		{ slot: "dinner" as const, memberId: undefined, label: "Shared dinner" },
		...data.members.map((member) => ({
			slot: "snack" as const,
			memberId: member.id,
			label: `${member.name} snack`,
		})),
	];
	const mealCard = (meal: ScheduledMeal) => (
		<article className="pk-week-meal" key={meal.id}>
			<div>
				<span className="pk-week-meal__type">
					{meal.slot === "dinner" && !meal.memberId
						? "SHARED DINNER"
						: (data.members.find((member) => member.id === meal.memberId)
								?.name ?? "Meal") +
							" · " +
							meal.slot}
				</span>
				<strong>{meal.name}</strong>
			</div>
			<div className="pk-week-meal__actions">
				<button onClick={() => onEditMeal(meal)}>Edit</button>
				<button
					onClick={() => {
						setMovingMeal(meal);
						setDestinationDate("");
					}}
				>
					Move / swap
				</button>
			</div>
		</article>
	);
	const startDayDrag = (event: PointerEvent<HTMLElement>, date: string) => {
		if ((event.target as HTMLElement).closest("button")) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		setDayDrag({
			date,
			startX: event.clientX,
			startY: event.clientY,
			x: event.clientX,
			y: event.clientY,
			active: false,
		});
	};
	const moveDayDrag = (event: PointerEvent<HTMLElement>) => {
		if (!dayDrag) return;
		if (event.clientY > window.innerHeight - 64)
			window.scrollBy({ top: 28, behavior: "auto" });
		else if (event.clientY < 64)
			window.scrollBy({ top: -28, behavior: "auto" });
		const active =
			dayDrag.active ||
			Math.hypot(
				event.clientX - dayDrag.startX,
				event.clientY - dayDrag.startY,
			) > 6;
		const target = active
			? ((
					document
						.elementFromPoint(event.clientX, event.clientY)
						?.closest(".pk-week-day") as HTMLElement | null
				)?.dataset.date ?? "")
			: "";
		setDropDate(target === dayDrag.date ? "" : target);
		setDayDrag({ ...dayDrag, x: event.clientX, y: event.clientY, active });
	};
	const finishDayDrag = (event: PointerEvent<HTMLElement>) => {
		if (!dayDrag) return;
		const destination =
			(
				document
					.elementFromPoint(event.clientX, event.clientY)
					?.closest(".pk-week-day") as HTMLElement | null
			)?.dataset.date ?? "";
		const source = dayDrag.date;
		setDayDrag(null);
		setDropDate("");
		if (dayDrag.active && destination && destination !== source)
			void Promise.resolve(onSwapDays(source, destination)).catch(
				() => undefined,
			);
	};
	const dayCard = (date: string) => (
		<section
			data-date={date}
			className={`pk-week-day${dayDrag?.date === date && dayDrag.active ? " is-dragging" : ""}${dropDate === date ? " is-drop-target" : ""}`}
			key={date}
			aria-label={shortDate(date)}
			onPointerDown={(event) => startDayDrag(event, date)}
			onPointerMove={moveDayDrag}
			onPointerUp={finishDayDrag}
			onPointerCancel={() => {
				setDayDrag(null);
				setDropDate("");
			}}
			title="Drag this day onto another day to swap their full menus"
		>
			<header>
				<strong>{shortDate(date)}</strong>
				<span>
					{data.scheduledMeals.filter((meal) => meal.date === date).length}{" "}
					meals
				</span>
			</header>
			{slots.map((slot) => {
				const matches = data.scheduledMeals.filter(
					(meal) =>
						meal.date === date &&
						meal.slot === slot.slot &&
						meal.memberId === slot.memberId,
				);
				return (
					<div className="pk-week-slot" key={`${slot.slot}-${slot.memberId}`}>
						<div className="pk-week-slot__label">{slot.label}</div>
						{matches.length ? (
							matches.map(mealCard)
						) : (
							<button
								className="pk-week-add"
								onClick={() => onCreateMeal(date, slot.slot, slot.memberId)}
							>
								＋ Add
							</button>
						)}
					</div>
				);
			})}
		</section>
	);

	return (
		<main className="pk-week">
			<header className="pk-week__heading">
				<div>
					<p className="pk-week__eyebrow">THE WEEK AHEAD</p>
					<h1>Weekly planning board</h1>
					<p>Drag one day onto another to swap their full menus.</p>
				</div>
				<span>
					{new Date(`${weekStart}T12:00:00`).toLocaleDateString(undefined, {
						month: "long",
						year: "numeric",
					})}
				</span>
			</header>
			<div className="pk-week__mobile">
				<nav className="pk-week__day-strip" aria-label="Choose a day">
					{dates.map((date, index) => {
						const count = data.scheduledMeals.filter(
							(meal) => meal.date === date,
						).length;
						return (
							<button
								key={date}
								className={selectedDate === date ? "is-selected" : ""}
								aria-pressed={selectedDate === date}
								onClick={() => setSelectedDate(date)}
							>
								<small>{["M", "T", "W", "T", "F", "S", "S"][index]}</small>
								<strong>{new Date(`${date}T12:00:00`).getDate()}</strong>
								<span aria-label={`${count} planned meals`}>
									{count ? "●" : "○"}
								</span>
							</button>
						);
					})}
				</nav>
				<section className="pk-pocket">
					<div className="pk-pocket__heading">
						<div>
							<p className="pk-week__eyebrow">SELECTED DAY</p>
							<h2>
								{new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
									undefined,
									{ weekday: "long", month: "long", day: "numeric" },
								)}
							</h2>
							{[0, 6].includes(
								new Date(`${selectedDate}T12:00:00`).getDay(),
							) && (
								<small>Self-managed weekend · targets are not evaluated</small>
							)}
						</div>
						<span>{selectedMeals.length} planned</span>
					</div>
					<div className="pk-pocket__slots">
						{slots.map((slot) => {
							const matches = selectedMeals.filter(
								(meal) =>
									meal.slot === slot.slot && meal.memberId === slot.memberId,
							);
							return (
								<section
									key={`${slot.slot}-${slot.memberId}`}
									className="pk-pocket-slot"
								>
									<h3>{slot.label}</h3>
									{matches.length ? (
										matches.map(mealCard)
									) : (
										<button
											className="pk-week-add"
											onClick={() =>
												onCreateMeal(selectedDate, slot.slot, slot.memberId)
											}
										>
											＋ Add {slot.slot}
										</button>
									)}
								</section>
							);
						})}
					</div>
					<div className="pk-pocket__targets">
						<strong>Planned target progress</strong>
						<span>Scheduled meals · not actual intake</span>
						{[0, 6].includes(new Date(`${selectedDate}T12:00:00`).getDay()) ? (
							<p>Weekend target evaluation is paused.</p>
						) : (
							data.members.map((member) => {
								const target = data.targets.find(
									(item) =>
										item.memberId === member.id && item.weekStart === weekStart,
								);
								return (
									<p key={member.id}>
										{member.name}
										<small>
											{target
												? Math.round(plannedCalories(member.id)) +
													" / " +
													Math.round(target.weekdayCalories) +
													" kcal"
												: "Target unavailable"}
										</small>
									</p>
								);
							})
						)}
					</div>
				</section>
			</div>
			<div className="pk-week__desktop" aria-label="Weekly schedule">
				{dates.map(dayCard)}
			</div>
			{dayDrag?.active && (
				<div
					className="pk-week-drag-preview"
					style={{ left: dayDrag.x + 14, top: dayDrag.y + 14 }}
					aria-hidden="true"
				>
					<strong>{shortDate(dayDrag.date)}</strong>
					<span>
						{
							data.scheduledMeals.filter((meal) => meal.date === dayDrag.date)
								.length
						}{" "}
						meals
					</span>
					{data.scheduledMeals
						.filter((meal) => meal.date === dayDrag.date)
						.slice(0, 3)
						.map((meal) => (
							<small key={meal.id}>{meal.name}</small>
						))}
				</div>
			)}
			{movingMeal && (
				<div className="pk-move-backdrop">
					<section
						className="pk-move-dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="pk-move-title"
					>
						<button
							className="pk-move-dialog__close"
							aria-label="Cancel move"
							onClick={() => setMovingMeal(null)}
						>
							×
						</button>
						<p className="pk-week__eyebrow">SCHEDULE CHANGE</p>
						<h2 id="pk-move-title">Move this meal</h2>
						<p>
							Choose another date for <strong>{movingMeal.name}</strong>. Only
							the same member and meal slot can move together.
						</p>
						<label htmlFor="pk-destination">Destination date</label>
						<select
							id="pk-destination"
							value={destinationDate}
							onChange={(event) => setDestinationDate(event.target.value)}
						>
							<option value="">Choose a day</option>
							{dates
								.filter((date) => date !== movingMeal.date)
								.map((date) => (
									<option key={date} value={date}>
										{new Date(`${date}T12:00:00`).toLocaleDateString(
											undefined,
											{ weekday: "long", month: "long", day: "numeric" },
										)}
									</option>
								))}
						</select>
						{destinationDate && (
							<p className="pk-move-dialog__preview">
								{destinationMeal ? (
									<>
										This will <strong>swap</strong> with {destinationMeal.name}.
									</>
								) : (
									<>
										This will <strong>move</strong> the meal; its current slot
										becomes empty.
									</>
								)}
							</p>
						)}
						<div className="pk-move-dialog__actions">
							<button onClick={() => setMovingMeal(null)}>Cancel</button>
							<button
								className="pk-week__confirm"
								disabled={!destinationDate}
								onClick={async () => {
									await onMoveMeal(movingMeal.id, destinationDate);
									setMovingMeal(null);
								}}
							>
								{destinationMeal ? "Confirm swap" : "Confirm move"}
							</button>
						</div>
					</section>
				</div>
			)}
		</main>
	);
}
