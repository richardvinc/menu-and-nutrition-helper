import { expect, test } from "@playwright/test";

test("calendar creates an all-day agenda and dashboard adapts to portrait layout", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(crypto, "randomUUID", { value: undefined });
	});
	await page.clock.install({ time: new Date(2026, 9, 12, 12) });
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("/");
	await page
		.getByRole("navigation", { name: "Primary navigation" })
		.first()
		.getByRole("button", { name: "Calendar" })
		.click();
	await expect(
		page.getByRole("heading", { name: "Calendar", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "October 2026" }),
	).toBeVisible();
	await expect(page.locator(".pk-calendar__day.is-today")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await page.getByRole("checkbox", { name: "Personal" }).check();

	const title = `All-day calendar ${Date.now()}`;
	await page.getByRole("button", { name: "+ Agenda" }).click();
	const editor = page.getByRole("dialog", { name: "Add agenda" });
	await editor.getByLabel("Title").fill(title);
	await editor.getByLabel("All day").check();
	await expect(editor.locator('input[type="date"]').nth(0)).toHaveValue(
		"2026-10-12",
	);
	await expect(editor.locator('input[type="date"]').nth(1)).toHaveValue(
		"2026-10-12",
	);
	const saveResponse = page.waitForResponse(
		(response) =>
			response.url().endsWith("/api/agendas") &&
			response.request().method() === "POST",
	);
	await editor.getByRole("button", { name: "Save" }).click();
	const savedResponse = await saveResponse;
	expect(savedResponse.status()).toBe(201);
	expect(await savedResponse.json()).toMatchObject({ title, start: "2026-10-12" });
	await expect(
		page
			.locator(".pk-calendar__agenda")
			.getByRole("button", { name: new RegExp(title) }),
	).toBeVisible();
	await page
		.locator(".pk-calendar__agenda")
		.getByRole("button", { name: new RegExp(title) })
		.click();
	page.once("dialog", (dialog) => dialog.accept());
	await page
		.getByRole("dialog", { name: "Edit agenda" })
		.getByRole("button", { name: "Delete" })
		.click();
	await expect(
		page.locator(".pk-calendar__agenda").getByText(title),
	).toHaveCount(0);

	await page
		.getByRole("navigation", { name: "Primary navigation" })
		.first()
		.getByRole("button", { name: "Today" })
		.click();
	await page.setViewportSize({ width: 1080, height: 2560 });
	const days = page.locator(".pk-dashboard__days");
	const todayBox = await days.locator(".pk-day").nth(0).boundingBox();
	const tomorrowBox = await days.locator(".pk-day").nth(1).boundingBox();
	expect(todayBox && tomorrowBox && tomorrowBox.y > todayBox.y).toBe(true);
	await expect(
		page.locator(".pk-dashboard-calendar__day.is-today"),
	).toBeVisible();
});
