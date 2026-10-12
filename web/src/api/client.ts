import type {
  AuthResult,
  NotificationItem,
  NotificationsResult,
  Order,
  OrderActionInput,
  OrderActionResult,
  OrdersPage,
  Platform,
  SessionState,
  SyncResult,
  TrainingResult,
} from "./types.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorShape {
  code?: string;
  message?: string;
  details?: unknown;
}

type ResponseShape<T> = T & { error?: ErrorShape };

interface RequestInit {
  method?: "GET" | "POST";
  params?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs?: number;
}

const BASE = "./api.php";
const REQUEST_TIMEOUT_MS = 10000;
const ACTION_TIMEOUT_MS = 15000;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === "AbortError" : false;
}

function loader(): ShellLoader | undefined {
  return window.__LOGUS_LOADER__;
}

function now(): number {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

async function api<T>(action: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  const started = now();
  loader()?.net(`→ ${method} ${action}`);

  const url = new URL(`${BASE}?action=${encodeURIComponent(action)}`, window.location.href);
  for (const [key, value] of Object.entries(init.params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), init.timeoutMs ?? REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    const ms = Math.round(now() - started);
    window.clearTimeout(timer);
    if (isAbortError(error)) {
      loader()?.error(`✖ ${action} TIMEOUT ${ms}мс`);
      throw new ApiError(0, "TIMEOUT", "Сервер не ответил вовремя", error);
    }
    loader()?.error(`✖ ${action} NETWORK ${ms}мс`);
    throw new ApiError(0, "NETWORK", "Не удалось связаться с сервером", error);
  } finally {
    window.clearTimeout(timer);
  }

  let raw = "";
  try {
    raw = await response.text();
  } catch {
    // тело не читается — оставляем пустым
  }

  let data: ResponseShape<T> | undefined;
  if (raw !== "") {
    try {
      data = JSON.parse(raw) as ResponseShape<T>;
    } catch {
      data = undefined;
    }
  }

  const ms = Math.round(now() - started);
  const err = data?.error;
  if (!response.ok || err) {
    const code = err?.code ?? `HTTP_${response.status}`;
    loader()?.error(`← ${action} ${response.status} ${ms}мс — ${code}`);
    throw new ApiError(response.status, code, err?.message ?? `Ошибка HTTP ${response.status}`, err?.details);
  }
  if (data === undefined) {
    const preview = raw.slice(0, 300);
    loader()?.error(`← ${action} ${response.status} ${ms}мс — BAD_RESPONSE ${preview}`);
    throw new ApiError(response.status, "BAD_RESPONSE", "Сервер вернул некорректный ответ", { preview });
  }
  loader()?.ok(`← ${action} ${response.status} ${ms}мс`);
  return data as T;
}

export const checkSession = (): Promise<SessionState> => api("session");

export const login = (username: string, password: string): Promise<AuthResult> =>
  api("login", { method: "POST", body: { username, password } });

export const logout = (): Promise<AuthResult> => api("logout", { method: "POST" });

export interface OrdersQuery {
  platform?: string;
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export const fetchOrders = (query: OrdersQuery): Promise<OrdersPage> =>
  api<OrdersPage>("orders", { params: { ...query } });

export const fetchOrder = (id: string): Promise<{ order: Order }> =>
  api<{ order: Order }>("order", { params: { id } });

export const runOrderAction = (input: OrderActionInput): Promise<OrderActionResult> =>
  api<OrderActionResult>("order_action", { method: "POST", body: input, timeoutMs: ACTION_TIMEOUT_MS });

export const fetchNotifications = (): Promise<NotificationsResult> => api<NotificationsResult>("notifications");

export const acknowledgeNotification = (notifyId: string): Promise<{ ok: boolean }> =>
  api<{ ok: boolean }>("order_action", {
    method: "POST",
    body: { id: "", action: "ack_notification", notifyId },
  });

export const fetchPlatforms = (): Promise<{ items: Platform[] }> => api<{ items: Platform[] }>("platforms");

/** Канонический (учебный) набор заказов — режим обучения, только чтение. */
export const fetchTraining = (): Promise<TrainingResult> => api<TrainingResult>("training");

export const runSync = (): Promise<SyncResult> => api<SyncResult>("sync", { method: "POST", timeoutMs: 20000 });

export type { NotificationItem };
