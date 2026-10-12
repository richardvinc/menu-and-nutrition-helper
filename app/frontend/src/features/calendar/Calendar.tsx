import type { AgendaItem, AppData } from "@piring-kita/shared";
import {
	useEffect,
	useMemo,
	useState,
	type CSSProperties,
	type FormEvent,
} from "react";
import { api, type CalendarOccurrence } from "../../api";
import "./calendar.css";

type CalendarProps = { data: Pick<AppData, "calendars" | "agendaItems"> };
type Frequency = "" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type RepeatEnd = "never" | "count" | "until";
type EventFormValues = {
	title: string;
	allDay: boolean;
	start: string;
	end: string;
	frequency: Frequency;
	interval: number;
	weekdays: string[];
	monthPattern: "date" | "weekday";
	repeatEnd: RepeatEnd;
	count: number;
	until: string;
};
type EventDialog = {
	item?: AgendaItem;
	occurrence?: CalendarOccurrence;
	series?: AgendaItem;
};

const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateKey = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = (key: string) => new Date(`${key}T12:00:00`);
const shiftDate = (date: Date, days: number) => {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
};
const shiftDateKey = (value: string, days: number) => {
	const date = parseDate(value);
	date.setDate(date.getDate() + days);
	return dateKey(date);
};
const monthGridStart = (month: Date) =>
	shiftDate(
		new Date(month.getFullYear(), month.getMonth(), 1, 12),
		-new Date(month.getFullYear(), month.getMonth(), 1).getDay(),
	);
const toLocalInput = (value: string) => {
	const date = new Date(value);
	return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};
const localDateTime = (value: string) => new Date(value).toISOString();
const occurrenceLabel = (event: CalendarOccurrence) => {
	if (event.allDay) return "All day";
	const start = new Date(event.start).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
	const end = new Date(event.end).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
	return `${start} – ${end}`;
};
const occursOn = (event: CalendarOccurrence, date: string) => {
	if (event.allDay)
		return date >= event.start.slice(0, 10) && date < event.end.slice(0, 10);
	const dayStart = new Date(`${date}T00:00:00`);
	const nextDay = shiftDate(dayStart, 1);
	return new Date(event.start) < nextDay && new Date(event.end) > dayStart;
};
const parseRule = (rule = "") =>
	Object.fromEntries(
		rule.split(";").map((part) => {
			const [key, ...value] = part.split("=");
			return [key, value.join("=")];
		}),
	);

function defaultValues(date: string): EventFormValues {
	return {
		title: "",
		allDay: false,
		start: `${date}T09:00`,
		end: `${date}T10:00`,
		frequency: "",
		interval: 1,
		weekdays: [],
		monthPattern: "date",
		repeatEnd: "never",
		count: 10,
		until: date,
	};
}

function valuesFor(dialog: EventDialog, date: string): EventFormValues {
	const values = defaultValues(date);
	const item = dialog.series ?? dialog.item;
	const displayed = dialog.occurrence;
	if (!item && !displayed) return values;
	const start = displayed?.start ?? item?.start ?? values.start;
	const end = displayed?.end ?? item?.end ?? values.end;
	values.title = displayed?.title ?? item?.title ?? "";
	values.allDay = displayed?.allDay ?? item?.allDay ?? false;
	values.start = values.allDay ? start.slice(0, 10) : toLocalInput(start);
	values.end = values.allDay
		? shiftDateKey(end.slice(0, 10), -1)
		: toLocalInput(end);
	if (item?.recurrenceRule) {
		const rule = parseRule(item.recurrenceRule);
		values.frequency = (rule.FREQ ?? "") as Frequency;
		values.interval = Math.max(1, Number(rule.INTERVAL ?? 1));
		values.weekdays = (rule.BYDAY ?? "")
			.split(",")
			.filter(Boolean)
			.map((day) => day.slice(-2));
		if (rule.BYDAY?.match(/^-?\d/)) values.monthPattern = "weekday";
		if (rule.COUNT) {
			values.repeatEnd = "count";
			values.count = Math.max(1, Number(rule.COUNT));
		}
		if (rule.UNTIL) {
			values.repeatEnd = "until";
			values.until = `${rule.UNTIL.slice(0, 4)}-${rule.UNTIL.slice(4, 6)}-${rule.UNTIL.slice(6, 8)}`;
		}
	}
	return values;
}

function recurrenceRule(values: EventFormValues) {
	if (!values.frequency) return undefined;
	const parts = [
		`FREQ=${values.frequency}`,
		`INTERVAL=${Math.max(1, values.interval)}`,
	];
	if (values.frequency === "WEEKLY") {
		const day = values.weekdays.length
			? values.weekdays
			: [weekdays[parseDate(values.start.slice(0, 10)).getDay()]];
		parts.push(`BYDAY=${day.join(",")}`);
	}
	if (values.frequency === "MONTHLY") {
		const start = parseDate(values.start.slice(0, 10));
		if (values.monthPattern === "weekday") {
			const monthEnd = new Date(
				start.getFullYear(),
				start.getMonth() + 1,
				0,
			).getDate();
			const nth =
				start.getDate() + 7 > monthEnd ? -1 : Math.ceil(start.getDate() / 7);
			parts.push(`BYDAY=${nth}${weekdays[start.getDay()]}`);
		} else parts.push(`BYMONTHDAY=${start.getDate()}`);
	}
	if (values.repeatEnd === "count")
		parts.push(`COUNT=${Math.max(1, values.count)}`);
	if (values.repeatEnd === "until") {
		const until = values.allDay
			? values.until.replaceAll("-", "")
			: `${new Date(`${values.until}T23:59:59`)
					.toISOString()
					.replace(/[-:]/g, "")
					.replace(/\.\d{3}/, "")}`;
		parts.push(`UNTIL=${until}`);
	}
	return parts.join(";");
}

function AgendaEditor({
	dialog,
	date,
	personalId,
	onClose,
	onSave,
	onDelete,
}: {
	dialog: EventDialog;
	date: string;
	personalId?: string;
	onClose: () => void;
	onSave: (
		values: EventFormValues,
		dialog: EventDialog,
		occurrenceOnly: boolean,
	) => Promise<void>;
	onDelete: (dialog: EventDialog, occurrenceOnly: boolean) => Promise<void>;
}) {
	const [values, setValues] = useState(() => valuesFor(dialog, date));
	const [occurrenceOnly, setOccurrenceOnly] = useState(
		Boolean(dialog.occurrence?.recurring && dialog.occurrence.recurrenceId),
	);
	const [saving, setSaving] = useState(false);
	const item = dialog.series ?? dialog.item;
	const isNewAgenda = !item && !dialog.occurrence;
	const canEdit = dialog.occurrence
		? dialog.occurrence.calendarId === personalId
		: !item || item.calendarId === personalId;
	const recurring = Boolean(item?.recurrenceRule);
	const update = <K extends keyof EventFormValues>(
		key: K,
		value: EventFormValues[K],
	) => setValues((current) => ({ ...current, [key]: value }));
	const updateStart = (start: string) =>
		setValues((current) => {
			if (!start) return { ...current, start };
			if (current.allDay)
				return {
					...current,
					start,
					end: isNewAgenda || current.end < start ? start : current.end,
				};
			if (isNewAgenda) {
				const endTime = current.end.slice(11) || "10:00";
				const sameDayEnd = `${start.slice(0, 10)}T${endTime}`;
				const end =
					Date.parse(sameDayEnd) > Date.parse(start)
						? sameDayEnd
						: toLocalInput(
								new Date(Date.parse(start) + 60 * 60_000).toISOString(),
							);
				return {
					...current,
					start,
					end,
				};
			}
			if (current.end >= start) return { ...current, start };
			const duration = Date.parse(current.end) - Date.parse(current.start);
			const end = new Date(
				Date.parse(start) + (duration > 0 ? duration : 60 * 60_000),
			);
			return { ...current, start, end: toLocalInput(end.toISOString()) };
		});
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setSaving(true);
		try {
			await onSave(values, dialog, occurrenceOnly);
		} catch {
		} finally {
			setSaving(false);
		}
	};
	const remove = async () => {
		if (
			!window.confirm(
				occurrenceOnly ? "Remove this occurrence?" : "Delete this agenda item?",
			)
		)
			return;
		setSaving(true);
		try {
			await onDelete(dialog, occurrenceOnly);
		} catch {
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className="pk-calendar__scrim"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<form
				className="pk-calendar__editor"
				onSubmit={submit}
				role="dialog"
				aria-modal="true"
				aria-labelledby="pk-agenda-editor-title"
			>
				<header>
					<div>
						<p className="pk-calendar__eyebrow">
							{item ? "AGENDA ITEM" : "PERSONAL CALENDAR"}
						</p>
						<h2 id="pk-agenda-editor-title">
							{item ? "Edit agenda" : "Add agenda"}
						</h2>
					</div>
					<button type="button" aria-label="Close" onClick={onClose}>
						×
					</button>
				</header>
				{!canEdit ? (
					<div className="pk-calendar__readonly">
						<strong>
							{dialog.occurrence?.title ?? item?.title ?? "Calendar event"}
						</strong>
						<span>
							{dialog.occurrence
								? `${occurrenceLabel(dialog.occurrence)} · ${dialog.occurrence.calendarName}`
								: "Imported calendar events are read-only."}
						</span>
					</div>
				) : (
					<>
						<label>
							Title
							<input
								autoFocus
								required
								maxLength={200}
								value={values.title}
								onChange={(event) => update("title", event.target.value)}
							/>
						</label>
						<label className="pk-calendar__check">
							<input
								type="checkbox"
								checked={values.allDay}
								onChange={(event) => {
									const allDay = event.target.checked;
									setValues((current) => {
										if (allDay) {
											const start = current.start.slice(0, 10);
											const endDate = current.end.slice(0, 10);
											return {
												...current,
												allDay,
												start,
												end: endDate < start ? start : endDate,
											};
										}
										return {
											...current,
											allDay,
											start: `${current.start.slice(0, 10)}T09:00`,
											end: `${current.end.slice(0, 10)}T10:00`,
										};
									});
								}}
							/>{" "}
							All day
						</label>
						<div className="pk-calendar__form-row">
							<label>
								Starts
								<input
									type={values.allDay ? "date" : "datetime-local"}
									required
									value={values.start}
									onChange={(event) => updateStart(event.target.value)}
								/>
							</label>
							<label>
								Ends
								<input
									type={values.allDay ? "date" : "datetime-local"}
									required
									min={values.start}
									value={values.end}
									onChange={(event) => update("end", event.target.value)}
								/>
							</label>
						</div>
						{!item?.recurrenceRule || !occurrenceOnly ? (
							<fieldset className="pk-calendar__repeat">
								<legend>Repeat</legend>
								<label>
									Frequency
									<select
										value={values.frequency}
										onChange={(event) =>
											update("frequency", event.target.value as Frequency)
										}
									>
										<option value="">Does not repeat</option>
										<option value="DAILY">Daily</option>
										<option value="WEEKLY">Weekly</option>
										<option value="MONTHLY">Monthly</option>
										<option value="YEARLY">Yearly</option>
									</select>
								</label>
								{values.frequency && (
									<>
										<label>
											Every
											<input
												type="number"
												min="1"
												max="99"
												value={values.interval}
												onChange={(event) =>
													update("interval", Number(event.target.value))
												}
											/>
										</label>
										{values.frequency === "WEEKLY" && (
											<div
												className="pk-calendar__weekdays"
												aria-label="Repeat on weekdays"
											>
												{weekdays.map((day, index) => (
													<label key={day}>
														<input
															type="checkbox"
															checked={values.weekdays.includes(day)}
															onChange={(event) =>
																update(
																	"weekdays",
																	event.target.checked
																		? [...values.weekdays, day]
																		: values.weekdays.filter(
																				(item) => item !== day,
																			),
																)
															}
														/>
														{weekdayLabels[index]}
													</label>
												))}
											</div>
										)}
										{values.frequency === "MONTHLY" && (
											<label>
												Monthly pattern
												<select
													value={values.monthPattern}
													onChange={(event) =>
														update(
															"monthPattern",
															event.target
																.value as EventFormValues["monthPattern"],
														)
													}
												>
													<option value="date">Same date each month</option>
													<option value="weekday">Same weekday pattern</option>
												</select>
											</label>
										)}
										<label>
											Ends
											<select
												value={values.repeatEnd}
												onChange={(event) =>
													update("repeatEnd", event.target.value as RepeatEnd)
												}
											>
												<option value="never">Never</option>
												<option value="count">After a number of times</option>
												<option value="until">On a date</option>
											</select>
										</label>
										{values.repeatEnd === "count" && (
											<label>
												Occurrences
												<input
													type="number"
													min="1"
													max="1000"
													value={values.count}
													onChange={(event) =>
														update("count", Number(event.target.value))
													}
												/>
											</label>
										)}
										{values.repeatEnd === "until" && (
											<label>
												Repeat through
												<input
													type="date"
													min={values.start.slice(0, 10)}
													value={values.until}
													onChange={(event) =>
														update("until", event.target.value)
													}
												/>
											</label>
										)}
									</>
								)}
							</fieldset>
						) : null}
						{recurring && dialog.occurrence && (
							<label className="pk-calendar__check">
								<input
									type="checkbox"
									checked={occurrenceOnly}
					onChange={(event) => {
						const occurrence = event.target.checked;
						setOccurrenceOnly(occurrence);
						setValues(
							valuesFor(
								occurrence
									? { series: item, occurrence: dialog.occurrence }
									: { series: item },
								date,
							),
						);
					}}
								/>{" "}
								Only this occurrence
							</label>
						)}
					</>
				)}
				<footer>
					{item && canEdit && (
						<button
							type="button"
							className="is-danger"
							disabled={saving}
							onClick={remove}
						>
							Delete
						</button>
					)}
					<span />
					{canEdit && (
						<button type="submit" className="is-primary" disabled={saving}>
							{saving ? "Saving…" : "Save"}
						</button>
					)}
					<button type="button" onClick={onClose}>
						Close
					</button>
				</footer>
			</form>
		</div>
	);
}

export function Calendar({
	data,
	onReload,
}: CalendarProps & { onReload: () => Promise<void> }) {
	const today = dateKey(new Date());
	const [month, setMonth] = useState(
		() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12),
	);
	const [selected, setSelected] = useState(today);
	const [occurrences, setOccurrences] = useState<CalendarOccurrence[]>([]);
	const [dialog, setDialog] = useState<EventDialog | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [calendarUrl, setCalendarUrl] = useState("");
	const gridStart = useMemo(() => monthGridStart(month), [month]);
	const gridDates = useMemo(
		() =>
			Array.from({ length: 42 }, (_, index) =>
				dateKey(shiftDate(gridStart, index)),
			),
		[gridStart],
	);
	const personal = data.calendars.find(
		(calendar) => calendar.kind === "personal",
	);
	const visibleEvents = useMemo(
		() =>
			occurrences.filter(
				(event) =>
					data.calendars.find((calendar) => calendar.id === event.calendarId)
						?.visible,
			),
		[occurrences, data.calendars],
	);
	const selectedEvents = visibleEvents
		.filter((event) => occursOn(event, selected))
		.sort(
			(a, b) =>
				Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start),
		);
	const seriesFor = (event: CalendarOccurrence) =>
		data.agendaItems.find((item) => item.id === event.id);

	useEffect(() => {
		let active = true;
		api
			.calendarOccurrences(gridDates[0], gridDates[41])
			.then(({ occurrences: next }) => {
				if (active) {
					setOccurrences(next);
					setError("");
				}
			})
			.catch((reason) => {
				if (active)
					setError(
						reason instanceof Error
							? reason.message
							: "Could not load calendar events.",
					);
			});
		return () => {
			active = false;
		};
	}, [gridDates[0], gridDates[41], data.calendars]);
	useEffect(() => {
		const interval = window.setInterval(() => {
			void api
				.calendarOccurrences(gridDates[0], gridDates[41])
				.then(async ({ occurrences: next }) => {
					setOccurrences(next);
					setError("");
					await onReload();
				})
				.catch((reason) =>
					setError(reason instanceof Error ? reason.message : "Could not load calendar events."),
				);
		}, 60 * 60 * 1000);
		return () => window.clearInterval(interval);
	}, [gridDates[0], gridDates[41], onReload]);

	const refresh = async () => {
		const { occurrences: next } = await api.calendarOccurrences(
			gridDates[0],
			gridDates[41],
		);
		setOccurrences(next);
	};
	const mutate = async (action: () => Promise<unknown>) => {
		setBusy(true);
		setError("");
		try {
			await action();
			await onReload();
			await refresh();
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Calendar change failed.",
			);
			throw reason;
		} finally {
			setBusy(false);
		}
	};
	const save = async (
		values: EventFormValues,
		target: EventDialog,
		occurrenceOnly: boolean,
	) => {
		const title = values.title.trim();
		if (!title) throw new Error("Enter a title.");
		const start = values.allDay ? values.start : localDateTime(values.start);
		const end = values.allDay ? values.end : localDateTime(values.end);
		if (end < start) throw new Error("The end must be after the start.");
		const storedEnd = values.allDay ? shiftDateKey(end, 1) : end;
		const series = target.series ?? target.item;
		if (
			target.occurrence?.recurring &&
			target.occurrence.recurrenceId &&
			occurrenceOnly &&
			series
		) {
			await mutate(() =>
				api.updateAgendaOccurrence(
					series.id,
					target.occurrence!.recurrenceId!,
					{ title, start, end: storedEnd, allDay: values.allDay },
				),
			);
		} else {
			const item: AgendaItem = {
				...series,
				id: series?.id ?? crypto.randomUUID(),
				calendarId: personal?.id ?? "",
				title,
				start,
				end: storedEnd,
				allDay: values.allDay,
				recurrenceRule: recurrenceRule(values),
			};
			await mutate(() => api.saveAgenda(item, Boolean(series)));
		}
		setDialog(null);
	};
	const remove = async (target: EventDialog, occurrenceOnly: boolean) => {
		const series =
			target.series ??
			target.item ??
			(target.occurrence && seriesFor(target.occurrence));
		if (!series) return;
		await mutate(() =>
			api.deleteAgenda(
				series.id,
				occurrenceOnly && target.occurrence?.recurring
					? target.occurrence.recurrenceId
					: undefined,
			),
		);
		setDialog(null);
	};
	const importFile = async (file?: File) => {
		if (!file) return;
		if (file.size > 10 * 1024 * 1024) {
			setError("Calendar files must be 10 MB or smaller.");
			return;
		}
		await mutate(() => api.importCalendar(file));
	};
	const subscribeCalendar = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		await mutate(() => api.subscribeCalendar(calendarUrl.trim()));
		setCalendarUrl("");
	};

	return (
		<main className="pk-calendar">
			<header className="pk-calendar__header">
				<div>
					<p className="pk-calendar__eyebrow">YOUR SCHEDULE</p>
					<h1>Calendar</h1>
					<p>Plan what’s ahead, one day at a time.</p>
				</div>
				<div className="pk-calendar__toolbar">
					<button
						type="button"
						onClick={() => {
							const now = new Date();
							setMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12));
							setSelected(today);
						}}
					>
						Today
					</button>
					<button
						aria-label="Previous month"
						type="button"
						onClick={() =>
							setMonth(
								(value) =>
									new Date(value.getFullYear(), value.getMonth() - 1, 1, 12),
							)
						}
					>
						‹
					</button>
					<h2>
						{month.toLocaleDateString(undefined, {
							month: "long",
							year: "numeric",
						})}
					</h2>
					<button
						aria-label="Next month"
						type="button"
						onClick={() =>
							setMonth(
								(value) =>
									new Date(value.getFullYear(), value.getMonth() + 1, 1, 12),
							)
						}
					>
						›
					</button>
					<button
						type="button"
						className="is-primary"
						onClick={() => setDialog({})}
					>
						+ Agenda
					</button>
				</div>
			</header>
			{error && (
				<p className="pk-calendar__error" role="alert">
					{error}
				</p>
			)}
			<div className="pk-calendar__layout">
				<section className="pk-calendar__month" aria-label="Month calendar">
					<div className="pk-calendar__weekdays">
						{weekdayLabels.map((day) => (
							<span key={day}>{day}</span>
						))}
					</div>
					<div className="pk-calendar__grid">
						{gridDates.map((date) => {
							const inMonth = parseDate(date).getMonth() === month.getMonth();
							const dayEvents = visibleEvents.filter((event) =>
								occursOn(event, date),
							);
							return (
								<button
									type="button"
									key={date}
									className={`pk-calendar__day${inMonth ? "" : " is-outside"}${date === today ? " is-today" : ""}${date === selected ? " is-selected" : ""}`}
									onClick={() => setSelected(date)}
									aria-pressed={date === selected}
								>
									<span className="pk-calendar__day-number">
										{parseDate(date).getDate()}
									</span>
									<span className="pk-calendar__day-events">
										{dayEvents.slice(0, 3).map((event) => (
											<span
												key={`${event.id}-${event.recurrenceId ?? event.start}`}
												style={
													{ "--event-color": event.color } as CSSProperties
												}
												title={event.title}
											>
												{event.recurring && (
													<span aria-label="Repeating">↻ </span>
												)}
												{event.title}
											</span>
										))}
										{dayEvents.length > 3 && (
											<small>+{dayEvents.length - 3} more</small>
										)}
									</span>
								</button>
							);
						})}
					</div>
				</section>
				<aside className="pk-calendar__side">
					<section className="pk-calendar__agenda">
						<header>
							<div>
								<p className="pk-calendar__eyebrow">DAILY AGENDA</p>
								<h2>
									{parseDate(selected).toLocaleDateString(undefined, {
										weekday: "long",
										month: "long",
										day: "numeric",
									})}
								</h2>
							</div>
							<button
								type="button"
								className="is-primary"
								onClick={() => setDialog({})}
							>
								+ Add
							</button>
						</header>
						{selectedEvents.length ? (
							<ul>
								{selectedEvents.map((event) => (
									<li key={`${event.id}-${event.recurrenceId ?? event.start}`}>
										<button
											className="pk-calendar__event"
											type="button"
											style={{ "--event-color": event.color } as CSSProperties}
											onClick={() =>
												setDialog({
													occurrence: event,
													series: seriesFor(event),
												})
											}
										>
											<strong>
												{event.title}
												{event.recurring && <span title="Repeating"> ↻</span>}
											</strong>
											<span>{occurrenceLabel(event)}</span>
											<small>{event.calendarName}</small>
										</button>
									</li>
								))}
							</ul>
						) : (
							<div className="pk-calendar__empty">
								<strong>No agenda yet</strong>
								<span>Add an event or import an .ics calendar.</span>
							</div>
						)}
					</section>
					<section className="pk-calendar__calendars">
						<header>
							<h2>Calendars</h2>
							<label className="pk-calendar__upload">
								Import .ics
								<input
									type="file"
									accept=".ics,text/calendar"
									onChange={(event) => {
										const input = event.currentTarget;
										const file = input.files?.[0];
										void importFile(file)
											.catch(() => {})
											.finally(() => {
												input.value = "";
											});
									}}
								/>
							</label>
							<form className="pk-calendar__subscribe" onSubmit={(event) => void subscribeCalendar(event).catch(() => {})}>
								<label htmlFor="calendar-subscription-url">Subscribe by URL</label>
								<input
									id="calendar-subscription-url"
									name="calendarUrl"
									type="url"
									value={calendarUrl}
									required
									placeholder="https://example.com/calendar.ics"
									onChange={(event) => setCalendarUrl(event.target.value)}
								/>
								<button type="submit" disabled={busy || !calendarUrl.trim()}>
									Subscribe
								</button>
								<small>Subscriptions check for updates weekly.</small>
							</form>
						</header>
						<ul>
							{data.calendars.map((calendar) => (
								<li key={calendar.id}>
									<label>
										<input
											type="checkbox"
											checked={calendar.visible}
											onChange={(event) =>
												void mutate(() =>
													api.setCalendarVisibility(
														calendar.id,
														event.target.checked,
													),
												).catch(() => {})
											}
										/>
										<span
											className="pk-calendar__legend"
											style={{ background: calendar.color }}
										/>
										{calendar.name}
											{calendar.subscribed && (
											<small>
												Subscribed
												{calendar.refreshError && (
													<span role="status"> · Update failed: {calendar.refreshError}</span>
												)}
											</small>
										)}
									</label>
									{calendar.kind === "ics" && (
										<button
											type="button"
											aria-label={`Remove ${calendar.name}`}
											onClick={() => {
												if (window.confirm(`Remove ${calendar.name}?`))
													void mutate(() =>
														api.removeCalendar(calendar.id),
													).catch(() => {});
											}}
										>
											×
										</button>
									)}
								</li>
							))}
						</ul>
					</section>
				</aside>
			</div>
			{busy && (
				<span className="pk-calendar__busy" role="status">
					Saving calendar…
				</span>
			)}
			{dialog && (
				<AgendaEditor
					dialog={dialog}
					date={selected}
					personalId={personal?.id}
					onClose={() => setDialog(null)}
					onSave={save}
					onDelete={remove}
				/>
			)}
		</main>
	);
}
