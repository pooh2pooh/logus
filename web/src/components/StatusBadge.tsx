import type { OrderStatus } from "../api/types.js";
import { STATUS_LABEL, statusTone } from "../format.js";

export function StatusBadge({ status }: { status: OrderStatus }) {
  const tone = statusTone(status);
  return (
    <span className={tone === "muted" ? "status" : `status status--${tone}`}>
      <span className="status__dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}
