const THEME_KEY = "logus_theme";
const PAGE_SIZE_KEY = "logus_page_size";

export type ThemeName = "dark" | "light";

export function getStoredTheme(): ThemeName | null {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

export function setStoredTheme(theme: ThemeName): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // localStorage недоступен — тема просто не сохранится
  }
}

/** Сколько заказов грузим за раз (сервер ограничивает сверху). */
export const PAGE_SIZE = 20;

export function getPageSize(): number {
  try {
    const value = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
    if (Number.isFinite(value) && value >= PAGE_SIZE && value <= 200) return value;
  } catch {
    // ignore
  }
  return PAGE_SIZE;
}
