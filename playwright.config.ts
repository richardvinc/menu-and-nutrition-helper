import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "tests/e2e",
	timeout: 30_000,
	workers: 1, // Tests share one backend database.
	use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
	webServer: [
		{
			command: "bun run dev:backend",
			url: "http://127.0.0.1:3001/api/health",
			reuseExistingServer: true,
			env: { DB_PATH: ":memory:" },
		},
		{
			command: "bun run dev:frontend",
			url: "http://127.0.0.1:5173",
			reuseExistingServer: true,
		},
	],
});
