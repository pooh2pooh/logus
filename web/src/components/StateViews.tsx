import { IconAlert, IconInbox, IconRefresh } from "./icons.js";

export function OrderSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="order-list" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton" key={i}>
          <div className="sk-line sk-line--sm" />
          <div className="sk-line sk-line--lg" />
          <div className="sk-line" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <IconAlert width={36} height={36} />
      <h3>Не удалось загрузить</h3>
      <p>{message}</p>
      {onRetry ? (
        <button className="btn" type="button" onClick={onRetry}>
          <IconRefresh width={16} height={16} /> Повторить
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <IconInbox />
      <h3 style={{ color: "var(--text)", margin: "8px 0 4px", fontSize: 16 }}>{title}</h3>
      <p style={{ margin: 0 }}>{body}</p>
    </div>
  );
}

export function LoadMore({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
      <button className="btn" type="button" onClick={onClick} disabled={loading} aria-busy={loading}>
        {loading ? "Загружаем…" : "Показать ещё"}
      </button>
    </div>
  );
}
