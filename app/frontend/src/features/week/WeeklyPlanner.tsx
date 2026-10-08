import type { AppData, MemberId, ScheduledMeal } from "@piring-kita/shared";
import { type PointerEvent, useEffect, useMemo, useState } from "react";


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
		<article className="grid gap-3 rounded-[13px] border border-[var(--app-line)] bg-[#f7f6fc] p-3" key={meal.id}>
			<div>
				<span className="text-[10px] font-bold uppercase tracking-[0.6px] text-[var(--app-purple)]">
					{meal.slot === "dinner" && !meal.memberId
						? "SHARED DINNER"
						: (data.members.find((member) => member.id === meal.memberId)
								?.name ?? "Meal") +
							" · " +
							meal.slot}
				</span>
				<strong>{meal.name}</strong>
			</div>
			<div className="flex flex-wrap gap-1.5">
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
						?.closest("[data-date]") as HTMLElement | null
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
					?.closest("[data-date]") as HTMLElement | null
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
			className={`min-w-0 cursor-grab rounded-[20px] border border-[var(--app-line)] border-t-4 border-t-[var(--app-purple)] bg-[var(--app-surface)] p-4 shadow-[var(--app-shadow)] ${dayDrag?.date === date && dayDrag.active ? "opacity-45" : ""} ${dropDate === date ? "outline outline-3 outline-[var(--app-purple)] outline-offset-3" : ""}`}
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
					<div className="border-t border-[var(--app-line)] py-3" key={`${slot.slot}-${slot.memberId}`}>
						<div className="mb-2 text-[13px] font-semibold text-[var(--app-muted)]">{slot.label}</div>
						{matches.length ? (
							matches.map(mealCard)
						) : (
							<button
								className="min-h-[46px] w-full rounded-[11px] border border-dashed border-[#cfc9ee] bg-[#faf9ff] p-2 text-left text-[13px] text-[var(--app-purple)]"
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
		<main className="mx-auto max-w-[1600px] px-[15px] py-[22px] pb-9 text-[var(--app-ink)] sm:px-6 sm:py-8 sm:pb-[60px]">
			<header className="mb-6 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end sm:gap-5">
				<div>
					<p className="mb-2 text-[10px] font-bold uppercase tracking-[1.2px] text-[var(--app-purple)]">THE WEEK AHEAD</p>
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
			<div className="block lg:hidden">
				<nav className="mb-3.5 grid grid-cols-7 gap-1 rounded-[14px] border border-[var(--app-line)] bg-[#e9e7f4] p-1" aria-label="Choose a day">
					{dates.map((date, index) => {
						const count = data.scheduledMeals.filter(
							(meal) => meal.date === date,
						).length;
						return (
							<button
								key={date}
								className={`grid min-h-10 place-items-center rounded-lg px-1 text-xs ${selectedDate === date ? "bg-[#3a3552] text-[var(--app-ink)]" : "bg-transparent text-[var(--app-muted)]"}`}
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
				<section className="rounded-[18px] border border-[var(--app-line)] bg-[var(--app-surface)] p-4">
					<div className="mb-2 flex items-center justify-between">
						<div>
							<p className="mb-2 text-[10px] font-bold uppercase tracking-[1.2px] text-[var(--app-purple)]">SELECTED DAY</p>
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
					<div className="grid gap-2">
						{slots.map((slot) => {
							const matches = selectedMeals.filter(
								(meal) =>
									meal.slot === slot.slot && meal.memberId === slot.memberId,
							);
							return (
								<section
									key={`${slot.slot}-${slot.memberId}`}
									className="rounded-lg border border-[var(--app-line)] p-2"
								>
									<h3>{slot.label}</h3>
									{matches.length ? (
										matches.map(mealCard)
									) : (
										<button
											className="min-h-[46px] w-full rounded-[11px] border border-dashed border-[#cfc9ee] bg-[#faf9ff] p-2 text-left text-[13px] text-[var(--app-purple)]"
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
					<div className="rounded-lg bg-[#f5f4fa] p-2 text-xs">
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
			<div className="hidden gap-4 lg:grid lg:grid-cols-3 xl:grid-cols-4" aria-label="Weekly schedule">
				{dates.map(dayCard)}
			</div>
			{dayDrag?.active && (
				<div
					className="fixed z-50 grid w-[210px] gap-1 rounded-2xl border-2 border-[var(--app-purple)] bg-[var(--app-surface)] p-3.5 shadow-[0_20px_50px_rgba(29,22,75,0.28)]"
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
				<div className="fixed inset-0 z-10 grid place-items-center bg-[#211a5788] p-[18px]">
					<section
						className="relative w-full max-w-[440px] rounded-[22px] bg-[var(--app-surface)] p-6 shadow-[0_24px_70px_rgba(35,28,86,0.28)]"
						role="dialog"
						aria-modal="true"
						aria-labelledby="pk-move-title"
					>
						<button
							className="absolute right-3.5 top-3.5 h-9 w-9 rounded-full border-0 bg-[#f2f4ef] text-[23px]"
							aria-label="Cancel move"
							onClick={() => setMovingMeal(null)}
						>
							×
						</button>
						<p className="mb-2 text-[10px] font-bold uppercase tracking-[1.2px] text-[var(--app-purple)]">SCHEDULE CHANGE</p>
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
							<p className="rounded-lg bg-[#f5f7f2] p-2.5 text-xs text-[#4d5d52]">
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
						<div className="mt-5 flex justify-end gap-2">
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
