import { useEffect, useMemo, useState } from "react";
import { useOrders, useSync } from "../hooks/queries.js";
import { useAppUi } from "../hooks/useAppUi.js";
import { ApiError } from "../api/client.js";
import type { OrderStatus } from "../api/types.js";
import { PLATFORM_LABEL, STATUS_LABEL, STATUS_ORDER } from "../format.js";
import { Summary } from "./Summary.js";
import { OrderCard } from "./OrderCard.js";
import { EmptyState, ErrorState, LoadMore, OrderSkeleton } from "./StateViews.js";
import { IconRefresh, IconSearch, IconSync } from "./icons.js";

const PLATFORM_FILTERS: Array<{ code: string; label: string }> = [
  { code: "", label: "Все площадки" },
  { code: "ati", label: PLATFORM_LABEL.ati ?? "ATI.SU" },
  { code: "loginet", label: PLATFORM_LABEL.loginet ?? "Loginet" },
  { code: "own", label: PLATFORM_LABEL.own ?? "Своя площадка" },
];

export function OrdersView({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const { platform, setPlatform, status, setStatus } = useAppUi();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => window.clearTimeout(t);
  }, [query]);

  const filter = useMemo(() => ({ platform, status, q: debounced }), [platform, status, debounced]);
  const orders = useOrders(filter);
  const sync = useSync();

  const items = orders.data?.pages.flatMap((p) => p.items) ?? [];
  const summary = orders.data?.pages[0]?.summary;
  const error = orders.error;

  const errorMessage =
    error instanceof ApiError
      ? error.code === "UNAUTHORIZED"
        ? "Сессия истекла — войдите заново"
        : error.message
      : error
        ? "Не удалось получить список заказов"
        : "";

  return (
    <>
      {summary ? <Summary summary={summary} /> : null}

      <div className="controls">
        <div className="field">
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>
            <IconSearch width={16} height={16} />
          </span>
          <input
            type="search"
            placeholder="Поиск по номеру, городу, грузу…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск заказов"
            style={{ paddingLeft: 36 }}
          />
        </div>
        <div className="field field--status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Фильтр по статусу" data-tour="status-filter">
            <option value="">Все статусы</option>
            {STATUS_ORDER.map((s: OrderStatus) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-icon"
          type="button"
          onClick={() => orders.refetch()}
          aria-label="Обновить список"
          title="Обновить"
          disabled={orders.isFetching}
        >
          <IconRefresh width={18} height={18} />
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          aria-busy={sync.isPending}
          title="Синхронизировать с площадками"
          data-tour="sync"
        >
          <IconSync width={16} height={16} />
          {sync.isPending ? "Синхронизация…" : "Синхронизировать"}
        </button>
      </div>

      <div className="chips" role="group" aria-label="Фильтр по площадкам">
        {PLATFORM_FILTERS.map((p) => (
          <button
            key={p.code || "all"}
            className="chip"
            type="button"
            aria-pressed={platform === p.code}
            onClick={() => setPlatform(p.code)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {orders.isPending ? (
        <OrderSkeleton />
      ) : orders.isError ? (
        <ErrorState message={errorMessage} onRetry={() => orders.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Заказов не найдено"
          body="Измените фильтры или синхронизируйте данные с площадками."
        />
      ) : (
        <>
          <div className="order-list">
            {items.map((order) => (
              <OrderCard key={order.id} order={order} onOpen={onOpenOrder} />
            ))}
          </div>
          {orders.hasNextPage ? (
            <LoadMore onClick={() => void orders.fetchNextPage()} loading={orders.isFetchingNextPage} />
          ) : null}
        </>
      )}
    </>
  );
}
