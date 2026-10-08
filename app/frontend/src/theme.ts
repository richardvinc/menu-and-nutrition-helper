export type AppTheme = "light" | "dark";

export function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#13121e" : "#eef1f8");
  return theme;
}

export function toggleTheme() {
  return applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}
