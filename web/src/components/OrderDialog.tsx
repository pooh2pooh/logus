import { useState } from "react";
import { useOrder, useOrderAction } from "../hooks/queries.js";
import { ApiError } from "../api/client.js";
import type { OrderActionName, OrderStatus } from "../api/types.js";
import { fmtDate, money, num, orderNum } from "../format.js";
import { StatusBadge } from "./StatusBadge.js";
import { Modal } from "./Modal.js";
import { ErrorState } from "./StateViews.js";
import { IconAlert, IconArrowRight, IconCheck, IconDoc, IconEdit, IconReject, IconUpload } from "./icons.js";

const DOC_TYPES = ["Договор-заявка", "Транспортная накладная", "ПОД", "Счёт", "Прочее"];

function isActive(status: OrderStatus): boolean {
  return !["closed", "cancelled", "delivered"].includes(status);
}

export function OrderDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isPending, isError, error, refetch } = useOrder(id);
  const actionMutation = useOrderAction();
  const [note, setNote] = useState("");
  const [docType, setDocType] = useState(DOC_TYPES[0] ?? "Прочее");

  const order = data?.order;

  const run = (action: OrderActionName, extra?: { docType?: string }) => {
    if (actionMutation.isPending) return;
    actionMutation.mutate(
      { id, action, note: note.trim() || undefined, ...extra },
      { onSuccess: () => setNote("") },
    );
  };

  if (isPending) {
    return (
      <Modal title="Заказ" onClose={onClose}>
        <p style={{ color: "var(--muted)" }}>Загружаем карточку заказа…</p>
      </Modal>
    );
  }

  if (isError || !order) {
    const msg = error instanceof ApiError ? error.message : "Не удалось загрузить заказ";
    return (
      <Modal title="Заказ" onClose={onClose}>
        <ErrorState message={msg} onRetry={() => void refetch()} />
      </Modal>
    );
  }

  const status = order.status;
  const actionError = actionMutation.error instanceof ApiError ? actionMutation.error.message : null;

  return (
    <Modal
      title={`Заказ ${orderNum(order)}`}
      onClose={onClose}
      footer={
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
          {actionError ? <p className="login__error" role="alert">{actionError}</p> : null}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Комментарий к действию (необязательно)"
            rows={2}
            aria-label="Комментарий к действию"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(status === "created" || status === "carrier_assigned") && (
              <button className="btn btn--accent" type="button" disabled={actionMutation.isPending} onClick={() => run("confirm")} data-tour="action-confirm">
                <IconCheck width={16} height={16} /> Подтвердить
              </button>
            )}
            {isActive(status) && (
              <>
                <button className="btn" type="button" disabled={actionMutation.isPending} onClick={() => run("request_change")}>
                  <IconEdit width={16} height={16} /> Изменить
                </button>
                <button className="btn" type="button" disabled={actionMutation.isPending} onClick={() => run("report_problem")}>
                  <IconAlert width={16} height={16} /> Проблема
                </button>
                <button className="btn btn--danger" type="button" disabled={actionMutation.isPending} onClick={() => run("reject")}>
                  <IconReject width={16} height={16} /> Отменить
                </button>
              </>
            )}
            {status === "problem" && (
              <button className="btn btn--accent" type="button" disabled={actionMutation.isPending} onClick={() => run("resolve_problem")} data-tour="action-resolve">
                <IconCheck width={16} height={16} /> Урегулировать
              </button>
            )}
            {status === "delivered" && (
              <button className="btn btn--accent" type="button" disabled={actionMutation.isPending} onClick={() => run("mark_received")}>
                <IconCheck width={16} height={16} /> Подтвердить получение
              </button>
            )}
          </div>
          <div className="doc-upload">
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              aria-label="Тип документа"
            >
              {DOC_TYPES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button className="btn" type="button" disabled={actionMutation.isPending} onClick={() => run("upload_doc", { docType })} data-tour="action-upload">
              <IconUpload width={16} height={16} /> Загрузить документ
            </button>
          </div>
        </div>
      }
    >
      {order.flags.problem ? (
        <div style={{ border: "1px solid var(--danger-border)", background: "var(--danger-bg)", color: "var(--danger-text)", borderRadius: 12, padding: "10px 12px", display: "flex", gap: 8, alignItems: "center" }}>
          <IconAlert width={18} height={18} />
          <span>{order.flags.problem}</span>
        </div>
      ) : order.flags.deviation ? (
        <div style={{ border: "1px solid var(--warn-border)", background: "var(--warn-bg)", color: "var(--warn)", borderRadius: 12, padding: "10px 12px", display: "flex", gap: 8, alignItems: "center" }}>
          <IconAlert width={18} height={18} />
          <span>{order.flags.deviation.reason} (отклонение {order.flags.deviation.minutes} мин)</span>
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <StatusBadge status={status} />
        <span className="badge">{order.sourceTitle}</span>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>создан {fmtDate(order.createdAt)}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17 }}>
        <span>{order.route.from.city}</span>
        <span style={{ color: "var(--muted)" }} aria-hidden="true">
          <IconArrowRight width={18} height={18} />
        </span>
        <span>{order.route.to.city}</span>
      </div>

      <dl className="kv">
        <div className="kv__row">
          <dt>Погрузка</dt>
          <dd>{fmtDate(order.dates.loadAt)}</dd>
        </div>
        <div className="kv__row">
          <dt>Выгрузка</dt>
          <dd>{fmtDate(order.dates.unloadAt)}</dd>
        </div>
        <div className="kv__row">
          <dt>Адрес погрузки</dt>
          <dd>{order.route.from.address}</dd>
        </div>
        <div className="kv__row">
          <dt>Адрес выгрузки</dt>
          <dd>{order.route.to.address}</dd>
        </div>
        <div className="kv__row">
          <dt>Груз</dt>
          <dd>{order.cargo.name}</dd>
        </div>
        <div className="kv__row">
          <dt>Габариты</dt>
          <dd>
            {num(order.cargo.weightKg)} кг · {num(order.cargo.volumeM3, 1)} м³ · {num(order.cargo.places)} мест
          </dd>
        </div>
        <div className="kv__row">
          <dt>Тип кузова</dt>
          <dd>{order.cargo.bodyType}</dd>
        </div>
        <div className="kv__row">
          <dt>Стоимость</dt>
          <dd>
            {money(order.price.amount)} {order.price.vat === "with" ? "(с НДС)" : "(без НДС)"}
          </dd>
        </div>
        <div className="kv__row">
          <dt>Перевозчик</dt>
          <dd>
            {order.counterparty.carrierName} · ★ {order.counterparty.carrierRating.toFixed(1)}
          </dd>
        </div>
        <div className="kv__row">
          <dt>Контакт</dt>
          <dd>{order.counterparty.carrierContact}</dd>
        </div>
      </dl>

      <section>
        <h3 className="section-title">История статуса</h3>
        <ul className="timeline">
          {order.events.map((event, i) => {
            const isLast = i === order.events.length - 1;
            const cls = event.code === "problem" ? "is-problem" : isLast ? "is-active" : "is-done";
            return (
              <li key={`${event.at}-${event.code}`} className={cls}>
                <div className="timeline__time">{fmtDate(event.at)}</div>
                <div className="timeline__label">{event.label}</div>
                {event.note ? <div className="timeline__time">{event.note}</div> : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="section-title">Документы</h3>
        <div className="docs">
          {order.docs.map((doc) => (
            <div className="doc" key={doc.id}>
              <IconDoc width={18} height={18} />
              <span className="doc__title">{doc.title}</span>
              <span className={`doc__status doc__status--${doc.status}`}>{doc.status === "ok" ? "Готов" : "Ожидается"}</span>
            </div>
          ))}
        </div>
      </section>
    </Modal>
  );
}
