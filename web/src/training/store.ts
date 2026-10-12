import type {
  NotificationItem,
  Order,
  OrderActionInput,
  OrderDoc,
  OrderEvent,
  OrderStatus,
  OrderSummary,
  Platform,
} from "../api/types.js";
import { PLATFORM_LABEL, orderNum } from "../format.js";

export const TRAINING_KEY = "logus_training_v1";
/** Через сколько после прохождения прогресс обнуляется, мс. */
export const TRAINING_RESET_MS = 15 * 60 * 1000;

/** Локальная «правка» заказа — как патч поверх канонического набора. */
export interface OrderPatch {
  status?: OrderStatus;
  events: OrderEvent[];
  docs: OrderDoc[];
  problem?: string | null;
}

export interface TrainingState {
  version: number;
  stepIndex: number;
  done: string[];
  flags: Record<string, boolean>;
  patches: Record<string, OrderPatch>;
  read: Record<string, boolean>;
  lastSync: string | null;
  completedAt: number | null;
}

export function emptyState(): TrainingState {
  return { version: 1, stepIndex: 0, done: [], flags: {}, patches: {}, read: {}, lastSync: null, completedAt: null };
}

export function loadState(): TrainingState {
  try {
    const raw = window.localStorage.getItem(TRAINING_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<TrainingState>;
    const state: TrainingState = {
      version: 1,
      stepIndex: typeof parsed.stepIndex === "number" && parsed.stepIndex >= 0 ? parsed.stepIndex : 0,
      done: Array.isArray(parsed.done) ? parsed.done.filter((s): s is string => typeof s === "string") : [],
      flags:
        parsed.flags && typeof parsed.flags === "object" && !Array.isArray(parsed.flags)
          ? (parsed.flags as Record<string, boolean>)
          : {},
      patches:
        parsed.patches && typeof parsed.patches === "object" && !Array.isArray(parsed.patches)
          ? (parsed.patches as Record<string, OrderPatch>)
          : {},
      read:
        parsed.read && typeof parsed.read === "object" && !Array.isArray(parsed.read)
          ? (parsed.read as Record<string, boolean>)
          : {},
      lastSync: typeof parsed.lastSync === "string" ? parsed.lastSync : null,
      completedAt: typeof parsed.completedAt === "number" ? parsed.completedAt : null,
    };
    // Прошло больше 15 минут с момента завершения — обнуляем прохождение.
    if (state.completedAt !== null && Date.now() - state.completedAt > TRAINING_RESET_MS) {
      return emptyState();
    }
    return state;
  } catch {
    return emptyState();
  }
}

export function saveState(state: TrainingState): void {
  try {
    window.localStorage.setItem(TRAINING_KEY, JSON.stringify(state));
  } catch {
    // localStorage недоступен — прогресс просто не сохранится
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(TRAINING_KEY);
  } catch {
    // ignore
  }
}

/** Накладывает локальные правки на канонический набор заказов. */
export function applyPatches(orders: Order[], patches: Record<string, OrderPatch>): Order[] {
  return orders.map((order) => {
    const patch = patches[order.id];
    if (!patch) return order;
    const events = patch.events.length > 0 ? [...order.events, ...patch.events] : order.events;
    const docs = patch.docs.length > 0 ? [...order.docs, ...patch.docs] : order.docs;
    const status = patch.status ?? order.status;
    let problem = order.flags.problem;
    if (patch.problem !== undefined) problem = patch.problem;
    else if (patch.status !== undefined && patch.status !== "problem") problem = null;
    const last = events[events.length - 1];
    return {
      ...order,
      status,
      events,
      docs,
      statusUpdatedAt: last ? last.at : order.statusUpdatedAt,
      flags: { deviation: order.flags.deviation, problem },
    };
  });
}

/** Повторяет серверный order_summary(). */
export function summaryOf(orders: Order[]): OrderSummary {
  const summary: OrderSummary = { total: orders.length, inTransit: 0, problems: 0, delivered: 0, awaiting: 0 };
  for (const o of orders) {
    if (o.status === "loading" || o.status === "in_transit" || o.status === "unloading") summary.inTransit += 1;
    if (o.status === "problem") summary.problems += 1;
    if (o.status === "delivered" || o.status === "closed") summary.delivered += 1;
    if (o.status === "created" || o.status === "carrier_assigned") summary.awaiting += 1;
  }
  return summary;
}

/** Повторяет серверный notifications_from_orders(). */
export function notificationsOf(orders: Order[], read: Record<string, boolean>): NotificationItem[] {
  const items: NotificationItem[] = [];
  for (const order of orders) {
    for (const event of order.events.slice(-2)) {
      const code = event.code;
      let tone: NotificationItem["tone"] = "info";
      if (code === "problem") tone = "danger";
      else if (code === "delivered" || code === "closed" || code === "confirmed") tone = "ok";
      else if (code === "request_change") tone = "warn";
      const id = `${order.id}:${event.at}:${code}`;
      const route = `${order.route.from.city} → ${order.route.to.city}`;
      items.push({
        id,
        orderId: order.id,
        orderNum: orderNum(order),
        title: event.label,
        body: event.note ? `${route} — ${event.note}` : route,
        at: event.at,
        tone,
        read: Boolean(read[id]),
      });
    }
  }
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return items.slice(0, 30);
}

export function platformsOf(orders: Order[], lastSync: string | null): Platform[] {
  return (["ati", "loginet", "own"] as const).map((code) => ({
    code,
    title: PLATFORM_LABEL[code] ?? code,
    count: orders.filter((o) => o.source === code).length,
    connected: true,
    lastSync,
  }));
}

/**
 * Безопасный «исполнитель» действий в режиме обучения. Никогда не бросает и
 * не может испортить прохождение: разрешённые шагом действия применяются
 * локально, остальные возвращаются с дружелюбной подсказкой и без изменений.
 */
export interface ActionOutcome {
  ok: boolean;
  patch?: OrderPatch;
  hint?: string;
}

export function applyAction(order: Order, input: OrderActionInput, now: number): ActionOutcome {
  const iso = new Date(now).toISOString();
  const event = (code: string, label: string, note: string | null = null): OrderEvent => ({ code, label, at: iso, note });
  const current = order.status;

  switch (input.action) {
    case "confirm":
      if (current === "created" || current === "carrier_assigned") {
        return {
          ok: true,
          patch: { status: "confirmed", events: [event("confirmed", "Заказ подтверждён клиентом", input.note ?? null)], docs: [] },
        };
      }
      return { ok: false, hint: "Подтвердить можно заказ, ожидающий решения перевозчика." };

    case "resolve_problem":
      if (current === "problem") {
        return {
          ok: true,
          patch: { status: "in_transit", problem: null, events: [event("in_transit", "Проблема урегулирована", input.note ?? null)], docs: [] },
        };
      }
      return { ok: false, hint: "Сейчас этот заказ не в состоянии проблемы." };

    case "mark_received":
      if (current === "delivered") {
        return { ok: true, patch: { status: "closed", events: [event("closed", "Документы закрыты", input.note ?? null)], docs: [] } };
      }
      return { ok: false, hint: "Закрыть можно только доставленный заказ." };

    case "upload_doc": {
      const docType = input.docType ?? "документ";
      const doc: OrderDoc = { id: `up-${Math.random().toString(36).slice(2, 10)}`, title: `Загруженный документ: ${docType}`, status: "ok", url: null };
      return { ok: true, patch: { events: [event("doc_uploaded", "Клиент загрузил документ", docType)], docs: [doc] } };
    }

    case "request_change":
      return { ok: true, patch: { events: [event("request_change", "Запрошено изменение", input.note ?? "Уточнение условий")], docs: [] } };

    case "reject":
      return { ok: false, hint: "В обучении отменять заказы не нужно — идём по плану." };

    case "report_problem":
      return { ok: false, hint: "В обучении сообщать о новой проблеме не нужно — разберёмся с уже существующей." };

    default:
      return { ok: false, hint: "Это действие в обучении пока не требуется." };
  }
}

export function mergePatch(prev: OrderPatch | undefined, patch: OrderPatch): OrderPatch {
  return {
    status: patch.status ?? prev?.status,
    problem: patch.problem !== undefined ? patch.problem : prev?.problem,
    events: [...(prev?.events ?? []), ...patch.events],
    docs: [...(prev?.docs ?? []), ...patch.docs],
  };
}
