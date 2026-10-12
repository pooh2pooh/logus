import { useAckNotification, useNotifications } from "../hooks/queries.js";
import { relativeTime } from "../format.js";
import { Modal } from "./Modal.js";
import { EmptyState, ErrorState } from "./StateViews.js";
import { IconAlert, IconBell, IconCheck } from "./icons.js";

export function NotificationsDialog({
  onClose,
  onOpenOrder,
}: {
  onClose: () => void;
  onOpenOrder: (id: string) => void;
}) {
  const { data, isPending, isError, refetch } = useNotifications();
  const ack = useAckNotification();

  return (
    <Modal title="Уведомления" onClose={onClose} tour="notifications-dialog">
      {isPending ? (
        <p style={{ color: "var(--muted)" }}>Загружаем уведомления…</p>
      ) : isError ? (
        <ErrorState message="Не удалось загрузить уведомления" onRetry={() => void refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Уведомлений нет" body="Здесь появятся события по вашим заказам." />
      ) : (
        <ul className="notif">
          {data.items.map((n) => (
            <li key={n.id}>
              <span className="notif__icon" aria-hidden="true" style={n.tone === "danger" ? { color: "var(--danger-text)" } : undefined}>
                {n.tone === "ok" ? <IconCheck width={16} height={16} /> : n.tone === "danger" ? <IconAlert width={16} height={16} /> : <IconBell width={16} height={16} />}
              </span>
              <div className="notif__body" style={{ flex: 1 }}>
                <p>
                  <b>{n.orderNum}</b> · {n.title}
                </p>
                <p style={{ color: "var(--muted)" }}>{n.body}</p>
                <time dateTime={n.at}>{relativeTime(n.at)}</time>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "none" }}>
                <button
                  className="btn btn--ghost"
                  type="button"
                  style={{ padding: "6px 10px" }}
                  onClick={() => {
                    onOpenOrder(n.orderId);
                    onClose();
                  }}
                >
                  Открыть
                </button>
                {!n.read ? (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    style={{ padding: "6px 10px" }}
                    onClick={() => ack.mutate(n.id)}
                    disabled={ack.isPending}
                    data-tour="notif-ack"
                    aria-label={`Отметить прочитанным: ${n.title}`}
                  >
                    Прочитано
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
