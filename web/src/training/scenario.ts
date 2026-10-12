import type { Order, OrderStatus, OrderSummary } from "../api/types.js";
import type { OrderPatch } from "./store.js";

/** Всё, что нужно шагу, чтобы описать себя и понять, что уже сделано. */
export interface StepEval {
  orders: Order[];
  patches: Record<string, OrderPatch>;
  flags: Record<string, boolean>;
  status: string;
  summary: OrderSummary;
}

/** Действия, которые Помощник выполняет сам, показывая их пользователю. */
export type PrepareAction =
  | { type: "openPlatforms" }
  | { type: "openNotifications" }
  | { type: "closeDialogs" }
  | { type: "setStatus"; value: string }
  | { type: "openOrder"; id: string }
  | { type: "sync" };

export interface Step {
  id: string;
  title: string;
  say: (ctx: StepEval) => string;
  do?: (ctx: StepEval) => string;
  /** Селектор элемента, который подсвечиваем, пока пользователь действует. */
  target?: string;
  prepare?: PrepareAction[];
  done: (ctx: StepEval) => boolean;
}

export const STEPS: Step[] = [
  {
    id: "platforms",
    title: "Источники заказов",
    say: (ctx) =>
      `Начинаем с главного. Все ${ctx.summary.total} заказов собираются с нескольких электронных площадок в один список. Сейчас покажу панель площадок.`,
    do: () => "Посмотрите, сколько заказов пришло с каждой площадки, и закройте окно.",
    target: '[data-tour="platforms-dialog"]',
    prepare: [{ type: "openPlatforms" }, { type: "closeDialogs" }],
    done: (ctx) => Boolean(ctx.flags.platformsOpened),
  },
  {
    id: "sync",
    title: "Синхронизация",
    say: () => "Чтобы данные были актуальными, площадки синхронизируются. Запускаю синхронизацию — так вы всегда видите свежие статусы.",
    do: () => "Дождитесь окончания обновления.",
    target: '[data-tour="sync"]',
    prepare: [{ type: "sync" }, { type: "closeDialogs" }],
    done: (ctx) => Boolean(ctx.flags.synced),
  },
  {
    id: "filter",
    title: "Поиск проблем",
    say: () => "В длинном списке помогает фильтр по статусу. Включаю «Проблема», чтобы сразу увидеть заказы, которые ждут вашего решения.",
    do: () => "Обратите внимание: список сузился до проблемных заказов.",
    target: '[data-tour="status-filter"]',
    prepare: [{ type: "setStatus", value: "problem" }],
    done: (ctx) => ctx.status === "problem",
  },
  {
    id: "resolve",
    title: "Урегулировать проблему",
    say: () => "Вот проблемный заказ: перевозчик сообщил о поломке и ждёт вашего решения. Открываю его карточку — обратите внимание на предупреждение сверху.",
    do: () => "Нажмите «Урегулировать», чтобы снять проблему и вернуть заказ в работу.",
    target: '[data-tour="action-resolve"]',
    prepare: [{ type: "openOrder", id: "ati-10250" }],
    done: (ctx) => {
      const status = statusOf(ctx, "ati-10250");
      return status !== undefined && status !== "problem";
    },
  },
  {
    id: "confirm",
    title: "Подтвердить заказ",
    say: () => "А этот заказ ждёт вашего подтверждения — перевозчик уже назначен. Открываю следующую карточку.",
    do: () => "Нажмите «Подтвердить», чтобы заказ перешёл в работу.",
    target: '[data-tour="action-confirm"]',
    prepare: [{ type: "openOrder", id: "ati-10270" }],
    done: (ctx) => {
      const status = statusOf(ctx, "ati-10270");
      return status !== undefined && status !== "carrier_assigned" && status !== "created";
    },
  },
  {
    id: "docs",
    title: "Документы",
    say: () => "Документы по заказу собраны в самой карточке: договор, накладная, ПОД, счёт. То, чего не хватает, можно добавить прямо здесь.",
    do: () => "Выберите тип документа и нажмите «Загрузить документ».",
    target: '[data-tour="action-upload"]',
    done: (ctx) => (ctx.patches["ati-10270"]?.docs.length ?? 0) > 0,
  },
  {
    id: "notifications",
    title: "Уведомления",
    say: () => "Важные события собираются в уведомлениях — ничего не потеряется. Закрываю карточку и открываю колокольчик.",
    do: () => "Нажмите «Прочитано» на любом уведомлении.",
    target: '[data-tour="notifications-dialog"]',
    prepare: [{ type: "closeDialogs" }, { type: "openNotifications" }],
    done: (ctx) => Boolean(ctx.flags.notificationsAcked),
  },
];

function statusOf(ctx: StepEval, id: string): OrderStatus | undefined {
  return ctx.orders.find((o) => o.id === id)?.status;
}

/** Короткое описание того, что Помощник делает прямо сейчас. */

export const FINISH_TITLE = "Обучение пройдено";

export function isFinished(stepIndex: number): boolean {
  return stepIndex >= STEPS.length;
}
