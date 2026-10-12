import { usePlatforms, useSync } from "../hooks/queries.js";
import { fmtDate, num } from "../format.js";
import { Modal } from "./Modal.js";
import { ErrorState } from "./StateViews.js";
import { IconLayers, IconSync } from "./icons.js";

export function PlatformsDialog({ onClose }: { onClose: () => void }) {
  const { data, isPending, isError, refetch } = usePlatforms();
  const sync = useSync();

  return (
    <Modal
      title="Электронные площадки"
      onClose={onClose}
      tour="platforms-dialog"
      footer={
        <button className="btn btn--accent" type="button" onClick={() => sync.mutate()} disabled={sync.isPending} aria-busy={sync.isPending}>
          <IconSync width={16} height={16} />
          {sync.isPending ? "Синхронизация…" : "Синхронизировать все"}
        </button>
      }
    >
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: 13.5 }}>
        Заказы агрегируются из подключённых площадок в единый список. Демонстрационные коннекторы
        наполнены реалистичными данными; реальный коннектор реализует тот же интерфейс.
      </p>
      {isPending ? (
        <p style={{ color: "var(--muted)" }}>Загружаем площадки…</p>
      ) : isError ? (
        <ErrorState message="Не удалось загрузить площадки" onRetry={() => void refetch()} />
      ) : (
        <div className="docs">
          {(data?.items ?? []).map((p) => (
            <div className="doc" key={p.code} style={{ padding: "12px 14px" }}>
              <IconLayers width={18} height={18} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <b>{p.title}</b>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {p.connected ? "Подключена" : "Не подключена"}
                  {p.lastSync ? ` · синхронизация ${fmtDate(p.lastSync)}` : ""}
                </span>
              </div>
              <span className="doc__status doc__status--ok" style={{ marginLeft: "auto" }}>
                {num(p.count)} заказов
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
