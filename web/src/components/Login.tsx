import { useState, type FormEvent } from "react";
import { useLogin } from "../hooks/queries.js";
import { ApiError } from "../api/client.js";
import { IconTruck } from "./icons.js";

export function Login() {
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (login.isPending) return;
    login.mutate({ username: username.trim(), password });
  };

  const error = login.error;
  const message =
    error instanceof ApiError
      ? error.code === "BAD_CREDENTIALS"
        ? "Неверный логин или пароль"
        : error.message
      : error
        ? "Не удалось войти"
        : null;

  return (
    <div className="login">
      <form className="login__card" onSubmit={onSubmit}>
        <div className="login__logo">
          <IconTruck width={40} height={40} />
        </div>
        <h1>Кабинет клиента</h1>
        <p className="sub">Все заказы с электронных площадок — в одном месте.</p>

        {message ? <p className="login__error" role="alert">{message}</p> : null}

        <div className="field">
          <label htmlFor="username" style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
            Логин
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password" style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
            Пароль
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button className="btn btn--accent btn--block" type="submit" disabled={login.isPending} aria-busy={login.isPending}>
          {login.isPending ? "Входим…" : "Войти"}
        </button>

        <p className="login__hint">Демо-доступ: <b>demo</b> / <b>logus2026</b></p>
      </form>
    </div>
  );
}
