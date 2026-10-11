import type { Order } from "../api/types.js";
import { PLATFORM_LABEL, fmtDate, money, num, orderNum, platformBadgeClass } from "../format.js";
import { StatusBadge } from "./StatusBadge.js";
import { IconAlert, IconArrowRight } from "./icons.js";

export function OrderCard({ order, onOpen }: { order: Order; onOpen: (id: string) => void }) {
  const hasDeviation = Boolean(order.flags.deviation);
  const hasProblem = Boolean(order.flags.problem);

  return (
    <button className="order-card" type="button" onClick={() => onOpen(order.id)} aria-label={`Заказ ${orderNum(order)}`}>
      <div className="order-card__top">
        <span className="order-card__num">{orderNum(order)}</span>
        <span className={platformBadgeClass(order.source)}>{PLATFORM_LABEL[order.source] ?? order.sourceTitle}</span>
        <StatusBadge status={order.status} />
        <span className="order-card__price">{money(order.price.amount)}</span>
      </div>

      <div className="order-card__route">
        <span className="order-card__city">{order.route.from.city}</span>
        <span className="arrow" aria-hidden="true">
          <IconArrowRight width={16} height={16} />
        </span>
        <span className="order-card__city">{order.route.to.city}</span>
      </div>

      <div className="order-card__meta">
        <span>
          Груз: <b>{order.cargo.name}</b>
        </span>
        <span>
          Вес: <b>{num(order.cargo.weightKg)} кг</b>
        </span>
        <span>
          Перевозчик: <b>{order.counterparty.carrierName}</b>
        </span>
        <span>
          {order.status === "in_transit" || order.status === "loading" ? "ETA" : "Выгрузка"}:{" "}
          <b>{fmtDate(order.dates.eta ?? order.dates.unloadAt)}</b>
        </span>
        {hasProblem ? (
          <span className="flag flag--danger">
            <IconAlert width={14} height={14} /> {order.flags.problem}
          </span>
        ) : hasDeviation ? (
          <span className="flag">
            <IconAlert width={14} height={14} /> {order.flags.deviation?.reason}
          </span>
        ) : null}
      </div>
    </button>
  );
}
