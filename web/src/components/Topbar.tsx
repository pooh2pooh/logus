import type { ThemeName } from "../api/config.js";
import { IconBell, IconLayers, IconLogout, IconMoon, IconSun, IconTruck } from "./icons.js";

interface Props {
  unread: number;
  theme: ThemeName;
  onToggleTheme: () => void;
  onOpenNotifications: () => void;
  onOpenPlatforms: () => void;
  onLogout: () => void;
  user: string | null;
}

export function Topbar({ unread, theme, onToggleTheme, onOpenNotifications, onOpenPlatforms, onLogout, user }: Props) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <div className="topbar__logo" aria-hidden="true">
          <IconTruck width={20} height={20} />
        </div>
        <div className="topbar__title">
          <strong>Logus Nova</strong>
          <span>{user ? `кабинет клиента · ${user}` : "кабинет клиента"}</span>
        </div>
      </div>

      <div className="topbar__actions">
        <button className="btn btn-icon" type="button" onClick={onOpenPlatforms} aria-label="Площадки" title="Площадки" data-tour="platforms">
          <IconLayers width={18} height={18} />
        </button>
        <button
          className="btn btn-icon"
          type="button"
          onClick={onOpenNotifications}
          aria-label={`Уведомления${unread > 0 ? `, новых: ${unread}` : ""}`}
          title="Уведомления"
          data-tour="notifications"
          style={{ position: "relative" }}
        >
          <IconBell width={18} height={18} />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                minWidth: 18,
                height: 18,
                padding: "0 4px",
                borderRadius: 9,
                background: "var(--danger)",
                color: "#fff",
                fontSize: 11,
                lineHeight: "18px",
                textAlign: "center",
              }}
            >
              {unread}
            </span>
          ) : null}
        </button>
        <button
          className="btn btn-icon"
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        >
          {theme === "dark" ? <IconSun width={18} height={18} /> : <IconMoon width={18} height={18} />}
        </button>
        <button className="btn btn-icon" type="button" onClick={onLogout} aria-label="Выйти" title="Выйти">
          <IconLogout width={18} height={18} />
        </button>
      </div>
    </header>
  );
}
