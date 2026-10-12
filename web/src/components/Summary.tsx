import { useState } from "react";
import type { OrderSummary } from "../api/types.js";
import { num } from "../format.js";

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

const R = 56;
const C = 2 * Math.PI * R;

/**
 * Сводка по заказам как интерактивная кольцевая диаграмма: сегменты и легенда
 * подсвечивают друг друга, в центре — итог или выбранная категория. Раньше это
 * были карточки, которые ошибочно выглядели кликабельными.
 */
export function Summary({ summary }: { summary: OrderSummary }) {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const shown = pinned ?? hover;

  const slices: Slice[] = [
    { key: "inTransit", label: "В пути", value: summary.inTransit, color: "var(--accent)" },
    { key: "awaiting", label: "Ожидают отправки", value: summary.awaiting, color: "var(--warn)" },
    { key: "delivered", label: "Доставлено", value: summary.delivered, color: "var(--ok)" },
    { key: "problems", label: "Требуют внимания", value: summary.problems, color: "var(--danger)" },
  ];
  const accounted = slices.reduce((sum, s) => sum + s.value, 0);
  if (summary.total > accounted) {
    slices.push({ key: "other", label: "Прочее", value: summary.total - accounted, color: "var(--muted)" });
  }
  const total = Math.max(summary.total, accounted, 0);

  let offset = 0;
  const arcs = slices.map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const len = frac * C;
    const arc = { ...s, frac, len, offset };
    offset += len;
    return arc;
  });

  const current = shown ? slices.find((s) => s.key === shown) ?? null : null;
  const currentValue = current ? current.value : total;
  const currentLabel = current ? current.label : "Всего заказов";
  const currentPct = current && total > 0 ? Math.round((current.value / total) * 100) : null;

  return (
    <section className="summary" aria-label="Сводка по заказам">
      <div className="summary__chart">
        <svg className="summary__donut" viewBox="0 0 160 160" role="img" aria-label={`Всего заказов: ${num(total)}`}>
          <circle className="summary__track" cx="80" cy="80" r={R} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              className={`summary__seg${shown === a.key ? " is-active" : ""}${shown && shown !== a.key ? " is-dim" : ""}`}
              cx="80"
              cy="80"
              r={R}
              style={{ stroke: a.color, color: a.color, strokeDasharray: `${a.len} ${C - a.len}`, strokeDashoffset: -a.offset }}
            >
              <title>{`${a.label}: ${num(a.value)}`}</title>
            </circle>
          ))}
          <g className="summary__center">
            <text className="summary__value" x="80" y="76">{num(currentValue)}</text>
            <text className="summary__caption" x="80" y="95">{currentLabel}</text>
            {currentPct !== null ? <text className="summary__pct" x="80" y="112">{currentPct}%</text> : null}
          </g>
        </svg>
      </div>

      <ul className="summary__legend">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.key}>
              <button
                type="button"
                aria-pressed={pinned === s.key}
                aria-label={`${s.label}: ${num(s.value)}, ${pct}%`}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(s.key)}
                onBlur={() => setHover(null)}
                onClick={() => setPinned((prev) => (prev === s.key ? null : s.key))}
              >
                <span className="summary__dot" style={{ background: s.color }} />
                <span className="summary__label">{s.label}</span>
                <b className="summary__count">{num(s.value)}</b>
                <span className="summary__share">{pct}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
