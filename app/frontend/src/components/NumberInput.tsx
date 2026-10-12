import type { ChangeEvent, InputHTMLAttributes } from "react";
import { useRef } from "react";

export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
	const input = useRef<HTMLInputElement>(null);
	const onChange = props.onChange;
	const normalize = (value: string) => value.replace(/^(-?)0+(?=\d)/, "$1");
	const decimals = (value: string) => (value.split(".")[1] ?? "").length;
	const precision = (element: HTMLInputElement, step: number) =>
		Math.max(decimals(element.value), element.step === "any" ? 0 : decimals(String(step)));
	const clamp = (value: number, element: HTMLInputElement) =>
		Math.max(
			element.min === "" ? -Infinity : Number(element.min),
			Math.min(element.max === "" ? Infinity : Number(element.max), value),
		);
	const change = (value: string) => {
		const element = input.current;
		if (!element || !onChange) return;
		element.value = value;
		onChange({ target: element, currentTarget: element } as ChangeEvent<HTMLInputElement>);
	};
	return (
		<div className="pk-number-stepper">
			<button
				type="button"
				aria-label={`Decrease ${props["aria-label"] ?? "value"}`}
				onClick={() => {
					const element = input.current;
					if (!element || element.value === "") return;
					const step = element.step === "any" ? 1 : Number(element.step) || 1;
					const next = clamp(
						Number((Number(element.value) - step).toFixed(precision(element, step))),
						element,
					);
					change(String(next));
				}}
			>
				−
			</button>
			<input
				{...props}
				ref={input}
				onChange={(event) => {
					const normalized = normalize(event.target.value);
					if (normalized !== event.target.value) event.target.value = normalized;
					onChange?.(event);
				}}
			/>
			<button
				type="button"
				aria-label={`Increase ${props["aria-label"] ?? "value"}`}
				onClick={() => {
					const element = input.current;
					if (!element) return;
					const step = element.step === "any" ? 1 : Number(element.step) || 1;
					const next = clamp(
						Number((Number(element.value || 0) + step).toFixed(precision(element, step))),
						element,
					);
					change(String(next));
				}}
			>
				+
			</button>
		</div>
	);
}
