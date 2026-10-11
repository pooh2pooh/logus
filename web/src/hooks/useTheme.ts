import { useCallback, useEffect, useState } from "react";
import { getStoredTheme, setStoredTheme, type ThemeName } from "../api/config.js";

const META_COLORS: Record<ThemeName, string> = { dark: "#0f1115", light: "#f3f5f9" };

function systemTheme(): ThemeName {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", META_COLORS[theme]);
}

/** Тема: сохранённый выбор пользователя, иначе — системная. */
export function useTheme(): { theme: ThemeName; toggle: () => void } {
  const [theme, setTheme] = useState<ThemeName>(() => getStoredTheme() ?? systemTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeName = prev === "dark" ? "light" : "dark";
      setStoredTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
