import type { OrderSummary } from "../api/types.js";
import { num } from "../format.js";

export function Summary({ summary }: { summary: OrderSummary }) {
  return (
    <div className="summary">
      <div className="summary__card">
        <b>{num(summary.total)}</b>
        <span>Всего заказов</span>
      </div>
      <div className="summary__card">
        <b>{num(summary.inTransit)}</b>
        <span>В пути</span>
      </div>
      <div className="summary__card summary__card--danger">
        <b>{num(summary.problems)}</b>
        <span>Требуют внимания</span>
      </div>
      <div className="summary__card summary__card--ok">
        <b>{num(summary.delivered)}</b>
        <span>Доставлено</span>
      </div>
    </div>
  );
}
