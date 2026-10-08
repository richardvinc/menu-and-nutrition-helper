import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppData, TargetPreviewRequest } from "@piring-kita/shared";
import { createApp, createDatabase } from "./server";

describe("backend API", () => {
  let db: Database;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base: string;

  beforeEach(async () => {
    db = createDatabase(":memory:");
    server = createApp(db).listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind a TCP port");
    base = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
  });

  test("returns useful prototype data in the shared AppData shape", async () => {
    const data = await (await fetch(`${base}/api/data`)).json() as AppData;
    expect(data.members.map(x => x.id)).toEqual(["richard", "michelle"]);
    expect(data.ingredients.find(x => x.id === "rice")?.aliases).toContain("beras");
    expect(data.savedMenus).toHaveLength(2);
    expect(data.savedMenus.every(menu => menu.slot === "lunch")).toBe(true);
    expect(data.savedMenus.map(menu => menu.memberId)).toEqual(["richard", "michelle"]);
    expect(data.scheduledMeals.some(x => x.date === "2026-10-08" && x.slot === "dinner")).toBe(true);
    expect(data.targets.every(x => x.weekdayCalories > 0)).toBe(true);
  });

  test("returns JSON errors for unknown API routes", async () => {
    const response = await fetch(`${base}/api/missing`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "API route not found" });
  });

  test("moves to an empty slot and swaps with an occupied matching slot", async () => {
    const first = await fetch(`${base}/api/meals/seed-1008-r-lunch/move`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: "2026-10-10" }) });
    expect(first.status).toBe(200);
    expect((await first.json()).swapped).toBeNull();
    const second = await fetch(`${base}/api/meals/seed-1008-r-lunch/move`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: "2026-10-09" }) });
    expect(second.status).toBe(200);
    const data = await (await fetch(`${base}/api/data`)).json() as AppData;
    expect(data.scheduledMeals.find(x => x.id === "seed-1008-r-lunch")?.date).toBe("2026-10-09");
    expect(data.scheduledMeals.find(x => x.id === "seed-1009-r-lunch")?.date).toBe("2026-10-10");
  });

  test("swaps every scheduled meal between two days atomically", async () => {
    const response = await fetch(`${base}/api/days/swap`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firstDate: "2026-10-05", secondDate: "2026-10-07" }) });
    expect(response.status).toBe(200);
    const data = await (await fetch(`${base}/api/data`)).json() as AppData;
    expect(data.scheduledMeals.filter(meal => meal.date === "2026-10-05").map(meal => meal.id).sort()).toEqual(["seed-1007-dinner", "seed-1007-m-lunch", "seed-1007-r-lunch", "seed-1007-r-snack"]);
    expect(data.scheduledMeals.filter(meal => meal.date === "2026-10-07").map(meal => meal.id).sort()).toEqual(["seed-1005-dinner", "seed-1005-m-lunch", "seed-1005-r-lunch"]);
  });

  test("rejects invalid meals and leaves persisted data unchanged", async () => {
    const response = await fetch(`${base}/api/meals`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "bad", date: "2026-10-08", slot: "dinner", memberId: "richard", name: "Invalid shared dinner", ingredients: [] }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
    const data = await (await fetch(`${base}/api/data`)).json() as AppData;
    expect(data.scheduledMeals).toHaveLength(17);
  });

  test("only deletes ingredients that are not in use", async () => {
    const used = await fetch(`${base}/api/ingredients/rice`, { method: "DELETE" });
    expect(used.status).toBe(409);
    const create = await fetch(`${base}/api/ingredients`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "unused", name: "Unused", aliases: [], unit: "g", basisAmount: 100, preparation: "", source: "test", suggestible: false, nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 } }) });
    expect(create.status).toBe(201);
    const removed = await fetch(`${base}/api/ingredients/unused`, { method: "DELETE" });
    expect(removed.status).toBe(204);
  });

  test("previews targets without mutation and applies only the effective week", async () => {
    const request: TargetPreviewRequest = { memberId: "richard", effectiveWeek: "2026-10-12", weightKg: 77.5, activityLevel: "low", activityFactor: 1.6, deficitPercent: 20, weekendReserve: 400, proteinPercent: 25, carbsPercent: 45, fatPercent: 30, fiberGrams: 30 };
    const previewResponse = await fetch(`${base}/api/targets/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(preview.proposed.weekdayCalories * 7 + 400).toBeCloseTo(preview.proposed.weeklyCalories);
    expect(preview.recommendation).toContain("suggested starting point");
    let data = await (await fetch(`${base}/api/data`)).json() as AppData;
    expect(data.members.find(x => x.id === "richard")?.currentWeightKg).toBe(78);
    expect(data.targets.find(x => x.memberId === "richard" && x.weekStart === "2026-10-05")?.weekdayCalories).toBeGreaterThan(0);
    const apply = await fetch(`${base}/api/targets/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
    expect(apply.status).toBe(200);
    data = await (await fetch(`${base}/api/data`)).json() as AppData;
    expect(data.members.find(x => x.id === "richard")?.currentWeightKg).toBe(77.5);
    expect(data.targets).toHaveLength(3);
    expect(data.targets.find(x => x.memberId === "richard" && x.weekStart === "2026-10-05")?.weekdayCalories).toBeGreaterThan(0);
  });

  test("exports and validates backups before replacing data", async () => {
    const backup = await fetch(`${base}/api/backup.json`);
    const data = await backup.json() as AppData;
    expect(backup.headers.get("content-disposition")).toContain("piring-kita-backup.json");
    const invalid = await fetch(`${base}/api/restore`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, scheduledMeals: [{ id: "broken" }] }) });
    expect(invalid.status).toBe(400);
    expect((await (await fetch(`${base}/api/data`)).json() as AppData).scheduledMeals).toHaveLength(17);
    const legacy = { ...data, savedMenus: data.savedMenus.map(({ slot: _slot, ...menu }) => menu) };
    const restore = await fetch(`${base}/api/restore`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(legacy) });
    expect(restore.status).toBe(200);
    expect((await (await fetch(`${base}/api/data`)).json() as AppData).savedMenus.every(menu => menu.slot === "lunch")).toBe(true);
    const sqlite = await fetch(`${base}/api/database.sqlite`);
    expect(sqlite.headers.get("content-type")).toContain("application/vnd.sqlite3");
    expect((await sqlite.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  test("persists API writes across database reopen", async () => {
    const directory = mkdtempSync(join(tmpdir(), "piring-kita-test-"));
    const path = join(directory, "planner.sqlite");
    const persistent = createDatabase(path);
    const listener = createApp(persistent).listen(0);
    await new Promise<void>(resolve => listener.once("listening", resolve));
    const address = listener.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind a TCP port");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/menus`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "persist-me", name: "Stored menu", slot: "lunch", memberId: "richard", ingredients: [{ ingredientId: "rice", quantity: 100 }] }) });
      expect(response.status).toBe(201);
    } finally {
      await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
      persistent.close();
    }
    const reopened = createDatabase(path, false);
    expect(JSON.parse((reopened.query("SELECT data FROM saved_menus WHERE id = ?").get("persist-me") as { data: string }).data).name).toBe("Stored menu");
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  });

  test("migrates the old total-weekend allocation into an extra weekend reserve", () => {
    const directory = mkdtempSync(join(tmpdir(), "piring-kita-migrate-"));
    const path = join(directory, "planner.sqlite");
    const legacy = createDatabase(path);
    const target = { memberId: "richard", weekStart: "2026-10-05", deficitPercent: 20, weekendReserve: 4300, proteinPercent: 25, carbsPercent: 45, fatPercent: 30, fiberGrams: 30, weeklyCalories: 15030.4, weekdayCalories: 2146.08, macroGrams: { protein: 134.125, carbs: 241.425, fat: 71.53 } };
    legacy.query("UPDATE targets SET data = ? WHERE member_id = ?").run(JSON.stringify(target), "richard");
    legacy.close();
    const migrated = createDatabase(path, false);
    const stored = JSON.parse((migrated.query("SELECT data FROM targets WHERE member_id = ?").get("richard") as { data: string }).data) as typeof target;
    expect(stored.weekendReserve).toBeCloseTo(7.84);
    migrated.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
