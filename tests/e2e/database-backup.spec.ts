import { expect, test } from "@playwright/test";

test("downloads, confirms, restores, rejects, and cancels SQLite backups", async ({
	page,
}) => {
	await page.goto("/");
	await page.locator(".app-header").getByRole("button", { name: "Library" }).click();
	const downloadStarted = page.waitForEvent("download");
	await page.getByRole("link", { name: "Download database" }).click();
	const download = await downloadStarted;
	expect(download.suggestedFilename()).toBe("piring-kita.sqlite");
	const stream = await download.createReadStream();
	if (!stream) throw new Error("download stream unavailable");
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	const backup = Buffer.concat(chunks);
	expect(backup.subarray(0, 16).toString()).toBe("SQLite format 3\0");
	const chooser = page.locator('input[type="file"]');
	let restoreRequests = 0;
	page.on("request", (request) => {
		if (request.url().endsWith("/api/database.sqlite") && request.method() === "POST")
			restoreRequests++;
	});
	page.once("dialog", (dialog) => dialog.accept());
	const restored = page.waitForResponse((response) => response.url().endsWith("/api/database.sqlite") && response.request().method() === "POST");
	await chooser.setInputFiles({ name: "backup.sqlite", mimeType: "application/vnd.sqlite3", buffer: backup });
	expect((await restored).ok()).toBe(true);
	await expect(page.getByRole("status")).toHaveText("Database restored.");
	expect(restoreRequests).toBe(1);

	page.once("dialog", (dialog) => dialog.accept());
	const rejected = page.waitForResponse((response) => response.url().endsWith("/api/database.sqlite") && response.request().method() === "POST");
	await chooser.setInputFiles({ name: "invalid.sqlite", mimeType: "application/vnd.sqlite3", buffer: Buffer.from("invalid") });
	expect((await rejected).status()).toBe(400);
	await expect(page.getByRole("alert")).toContainText(/SQLite|database/i);
	expect(restoreRequests).toBe(2);

	page.once("dialog", (dialog) => dialog.dismiss());
	await chooser.setInputFiles({ name: "backup.sqlite", mimeType: "application/vnd.sqlite3", buffer: backup });
	await expect(page.getByRole("alert")).toBeVisible();
	expect(restoreRequests).toBe(2);
});
