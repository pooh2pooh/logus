import type { OrderStatus, PlatformCode } from "./api/types.js";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  created: "Создан",
  carrier_assigned: "Назначен перевозчик",
  confirmed: "Подтверждён",
  loading: "Погрузка",
  in_transit: "В пути",
  unloading: "Выгрузка",
  delivered: "Доставлен",
  closed: "Закрыт",
  cancelled: "Отменён",
  problem: "Проблема",
};

export type StatusTone = "wait" | "transit" | "done" | "problem" | "muted";

export function statusTone(status: OrderStatus): StatusTone {
  switch (status) {
    case "delivered":
    case "closed":
      return "done";
    case "loading":
    case "in_transit":
    case "unloading":
      return "transit";
    case "problem":
      return "problem";
    case "cancelled":
      return "muted";
    default:
      return "wait";
  }
}

export const STATUS_ORDER: OrderStatus[] = [
  "created",
  "carrier_assigned",
  "confirmed",
  "loading",
  "in_transit",
  "unloading",
  "delivered",
  "closed",
  "problem",
  "cancelled",
];

export const PLATFORM_LABEL: Record<string, string> = {
  ati: "ATI.SU",
  loginet: "Loginet",
  own: "Своя площадка",
};

export function platformBadgeClass(code: PlatformCode | string): string {
  return `badge badge--${code}`;
}

const moneyFmt = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

export function money(amount: number): string {
  return moneyFmt.format(amount);
}

export function num(value: number, digits = 0): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value);
}

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function orderNum(order: { source: string; sourceOrderId: string }): string {
  const map: Record<string, string> = { ati: "ATI", loginet: "LG", own: "СП" };
  return `${map[order.source] ?? order.source.toUpperCase()}-${order.sourceOrderId}`;
}

export function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diff = Date.now() - d;
  const min = Math.round(diff / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days === 1) return "вчера";
  return `${days} дн назад`;
}
