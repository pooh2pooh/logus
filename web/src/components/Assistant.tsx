import { useTraining } from "../training/context.js";
import { IconCheck, IconClose, IconSpark } from "./icons.js";

function fmtLeft(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Кнопка «Помощник» и обучающая панель. */
export function Assistant() {
  const t = useTraining();

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
          <span>
            {t.active && !t.finished ? `обучение · шаг ${t.stepNumber} из ${t.totalSteps}` : "обучение работе с заказами"}
          </span>
        </div>
        <button className="btn btn-icon btn--ghost" type="button" onClick={t.closePanel} aria-label="Свернуть">
          <IconClose width={16} height={16} />
        </button>
      </header>

      {t.active && !t.finished ? (
        <>
          <div className="assistant__progress" aria-hidden="true">
            <span style={{ width: `${Math.round(t.progress * 100)}%` }} />
          </div>
          <div className="assistant__body">
            {t.step ? (
              <>
                <h3 className="assistant__title">{t.step.title}</h3>
                <p className="assistant__say">{t.say}</p>
                <p className={`assistant__hint${t.celebrate ? " is-ok" : ""}${t.hint ? " is-nudge" : ""}`} aria-live="polite">
                  {t.hint ?? t.statusLine}
                </p>
                {t.action && !t.celebrate ? <div className="assistant__todo">{t.action}</div> : null}
              </>
            ) : null}
            {t.step?.prepare?.length ? (
              <button className="btn btn--ghost assistant__replay" type="button" onClick={t.replay}>
                Показать ещё раз
              </button>
            ) : null}
          </div>
          <footer className="assistant__foot">
            <button className="btn btn--ghost" type="button" onClick={t.exit}>
              Выйти из обучения
            </button>
          </footer>
        </>
      ) : t.finished ? (
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
      ) : (
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
      )}
    </section>
  );
}
