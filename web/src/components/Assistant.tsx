import { useEffect, useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { useTraining } from "../training/context.js";
import { IconCheck, IconChevron, IconClose, IconSpark } from "./icons.js";

const DESKTOP_QUERY = "(min-width: 900px)";

function fmtLeft(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Заголовок панели: аватар, имя и подпись (задача/статус/итог). */
function Head({ subtitle, onCollapse }: { subtitle: string; onCollapse?: () => void }) {
  return (
    <header className="assistant__head">
      <span className="assistant__avatar" aria-hidden="true">
        <IconSpark width={16} height={16} />
      </span>
      <div className="assistant__head-text">
        <strong>Помощник</strong>
        <span title={subtitle}>{subtitle}</span>
      </div>
      {onCollapse ? (
        <button className="btn btn-icon btn--ghost" type="button" onClick={onCollapse} aria-label="Свернуть">
          <IconChevron width={18} height={18} />
        </button>
      ) : null}
    </header>
  );
}

/** Лента шагов: пройденные + текущий, как переписка. */
function Chat() {
  const t = useTraining();
  return (
    <div className="assistant__chat" aria-live="polite" ref={(el) => {
      if (el) {
        const last = el.querySelector(".assistant__msg--current") || el.lastElementChild;
        if (last) el.scrollTop = el.scrollHeight;
      }
    }}>
      {t.transcript.map((item) => (
        <article
          key={item.id}
          className={`assistant__msg assistant__msg--${item.state}${item.state === "current" ? " is-clickable" : ""}`}
          onClick={item.state === "current" ? () => t.replay() : undefined}
          role={item.state === "current" ? "button" : undefined}
          tabIndex={item.state === "current" ? 0 : undefined}
          onKeyDown={
            item.state === "current"
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    t.replay();
                  }
                }
              : undefined
          }
          title={item.state === "current" ? "Вернуться к текущему шагу" : undefined}
        >
          <header className="assistant__msg-head">
            {item.state === "done" ? <IconCheck width={13} height={13} /> : <span className="assistant__msg-dot" aria-hidden="true" />}
            <span className="assistant__msg-title">{item.title}</span>
          </header>
          <p className="assistant__msg-say">{item.say}</p>
          {item.state === "current" && item.action ? <div className="assistant__todo">{item.action}</div> : null}
        </article>
      ))}

      {t.preparing ? (
        <div className="assistant__typing" role="status">
          <span className="assistant__dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Готовлю шаг…
        </div>
      ) : null}
      {t.celebrate ? <div className="assistant__typing assistant__typing--ok">Отлично — идём дальше.</div> : null}
      {t.hint ? <p className="assistant__hint is-nudge">{t.hint}</p> : null}
    </div>
  );
}

function Completion() {
  const t = useTraining();
  return (
    <div className="assistant__body">
      <div className="assistant__done" aria-hidden="true">
        <IconCheck width={26} height={26} />
      </div>
      <h3 className="assistant__title">Обучение пройдено</h3>
      <p className="assistant__say">
        Вы познакомились с площадками, синхронизацией, фильтрами, карточкой заказа, документами и уведомлениями.
        Теперь работа с реальными заказами будет привычной.
      </p>
      <p className="assistant__hint">
        Прогресс обнулится через <b>{t.completionLeftMs !== null ? fmtLeft(t.completionLeftMs) : "—"}</b> — после этого
        обучение можно пройти заново.
      </p>
      <div className="assistant__actions">
        <button className="btn btn--accent" type="button" onClick={t.exit}>
          Перейти к заказам
        </button>
        <button className="btn" type="button" onClick={t.restart}>
          Пройти заново
        </button>
      </div>
    </div>
  );
}

function Intro() {
  const t = useTraining();
  return (
    <div className="assistant__body">
      <h3 className="assistant__title">{t.hasProgress ? "Продолжим обучение?" : "Пройдите короткое обучение"}</h3>
      <p className="assistant__say">
        {t.hasProgress
          ? "Мы остановились на одном из шагов. Продолжим с того же места."
          : "Я проведу вас по возможностям кабинета на учебных заказах: площадки, синхронизация, фильтры, карточка заказа, документы и уведомления. Здесь нельзя ошибиться — только научиться."}
      </p>
      <div className="assistant__actions">
        <button className="btn btn--accent" type="button" onClick={t.start}>
          {t.hasProgress ? "Продолжить" : "Начать обучение"}
        </button>
        <button className="btn btn--ghost" type="button" onClick={t.closePanel}>
          Позже
        </button>
      </div>
    </div>
  );
}

/** Кнопка-агент, свёрнутый бар (мобильный) и чат-колонка (десктоп). */
export function Assistant() {
  const t = useTraining();
  const isWide = useMediaQuery(DESKTOP_QUERY);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Выход из обучения всегда возвращает мобильную панель в свёрнутый вид.
  useEffect(() => {
    if (!t.active) setMobileOpen(false);
  }, [t.active]);

  const subtitle = t.finished
    ? t.completionLeftMs !== null
      ? `Обучение пройдено · ${fmtLeft(t.completionLeftMs)}`
      : "Обучение пройдено"
    : t.preparing
      ? "Готовлю шаг…"
      : `Обучение · шаг ${t.stepNumber} из ${t.totalSteps}`;

  if (t.active && !t.finished) {
    if (isWide) {
      return (
        <aside className="assistant assistant--column" role="complementary" aria-label="Помощник">
          <Head subtitle={`Шаг ${t.stepNumber} из ${t.totalSteps}`} />
          <div className="assistant__progress" aria-hidden="true">
            <span style={{ width: `${Math.round(t.progress * 100)}%` }} />
          </div>
          <Chat />
          <footer className="assistant__foot">
            <button className="btn btn--ghost" type="button" onClick={t.exit}>
              Выйти из обучения
            </button>
          </footer>
        </aside>
      );
    }
    return (
      <>
        <button
          className={`assistant__bar${mobileOpen ? " is-open" : ""}`}
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
        >
          <span className="assistant__avatar" aria-hidden="true">
            <IconSpark width={16} height={16} />
          </span>
          <span className="assistant__bar-text">
            <strong>Помощник</strong>
            <span>{subtitle}</span>
          </span>
          <IconChevron className="assistant__bar-chevron" width={18} height={18} />
        </button>
        {mobileOpen ? (
          <section className="assistant assistant--sheet" role="dialog" aria-label="Помощник">
            <Head subtitle={`Шаг ${t.stepNumber} из ${t.totalSteps}`} onCollapse={() => setMobileOpen(false)} />
            <div className="assistant__progress" aria-hidden="true">
              <span style={{ width: `${Math.round(t.progress * 100)}%` }} />
            </div>
            <Chat />
            <footer className="assistant__foot">
              <button className="btn btn--ghost" type="button" onClick={t.exit}>
                Выйти из обучения
              </button>
            </footer>
          </section>
        ) : null}
      </>
    );
  }

  // Завершение показываем, пока идёт обучение или пользователь сам открыл панель.
  if (t.finished && (t.active || t.panelOpen)) {
    if (isWide) {
      return (
        <aside className="assistant assistant--column" role="complementary" aria-label="Помощник">
          <Head subtitle="Курс завершён" />
          <Completion />
        </aside>
      );
    }
    return (
      <>
        <button
          className={`assistant__bar assistant__bar--done${mobileOpen ? " is-open" : ""}`}
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
        >
          <span className="assistant__avatar assistant__avatar--ok" aria-hidden="true">
            <IconCheck width={16} height={16} />
          </span>
          <span className="assistant__bar-text">
            <strong>Обучение пройдено</strong>
            <span>{t.completionLeftMs !== null ? `Обнулится через ${fmtLeft(t.completionLeftMs)}` : "Можно пройти заново"}</span>
          </span>
          <IconChevron className="assistant__bar-chevron" width={18} height={18} />
        </button>
        {mobileOpen ? (
          <section className="assistant assistant--sheet" role="dialog" aria-label="Помощник">
            <Completion />
          </section>
        ) : null}
      </>
    );
  }

  if (!t.panelOpen) {
    return (
      <button className="assistant__fab" type="button" onClick={t.openPanel} aria-label="Помощник">
        <IconSpark width={18} height={18} />
        <span className="assistant__fab-label">Помощник</span>
        {t.finished ? (
          <span className="assistant__fab-badge assistant__fab-badge--ok" aria-hidden="true">
            <IconCheck width={12} height={12} />
          </span>
        ) : t.hasProgress ? (
          <span className="assistant__fab-badge" aria-hidden="true">
            {t.stepNumber}/{t.totalSteps}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <section className="assistant" role="dialog" aria-label="Помощник">
      <header className="assistant__head">
        <span className="assistant__avatar" aria-hidden="true">
          <IconSpark width={16} height={16} />
        </span>
        <div className="assistant__head-text">
          <strong>Помощник</strong>
          <span>обучение работе с заказами</span>
        </div>
        <button className="btn btn-icon btn--ghost" type="button" onClick={t.closePanel} aria-label="Свернуть">
          <IconClose width={16} height={16} />
        </button>
      </header>
      <Intro />
    </section>
  );
}
